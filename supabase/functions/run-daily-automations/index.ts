// Supabase Edge Function - run-daily-automations
// Processes daily automation checks server-side, in batches, to avoid thundering herd.
// Called by pg_cron every hour via pg_net. NOT callable by users.
//
// Setup: see supabase/pg_cron_setup.sql
// Deploy: supabase functions deploy run-daily-automations --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Service role client - bypasses RLS, so all queries must filter explicitly
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

Deno.serve(async (req) => {
  // Internal-only: must present the service role key
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${SERVICE_KEY}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { batch_size = 100 } = await req.json().catch(() => ({}))
  const today = new Date().toDateString()  // e.g. "Fri Jun 27 2026"

  // ── 1. Find teams that have at least one enabled automation ──────────────────

  const { data: enabledRows } = await supabase
    .from('automations')
    .select('team_id, automation_type')
    .not('team_id', 'is', null)
    .eq('enabled', true)

  if (!enabledRows?.length) {
    return new Response(JSON.stringify({ processed: 0, reason: 'no enabled automations' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Group enabled automation types by team_id
  const teamAutomations = new Map<string, Set<string>>()
  for (const row of enabledRows) {
    if (!row.team_id) continue
    if (!teamAutomations.has(row.team_id)) teamAutomations.set(row.team_id, new Set())
    teamAutomations.get(row.team_id)!.add(row.automation_type)
  }
  const teamIds = [...teamAutomations.keys()]

  // ── 2. Get active members for those teams ────────────────────────────────────

  const { data: members } = await supabase
    .from('team_members')
    .select('user_id, team_id')
    .in('team_id', teamIds)
    .eq('status', 'active')
    .not('user_id', 'is', null)

  if (!members?.length) {
    return new Response(JSON.stringify({ processed: 0, reason: 'no active members' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Deduplicate: one entry per user (prefer member role over owner if in multiple teams)
  const memberMap = new Map<string, { user_id: string; team_id: string }>()
  for (const m of members) {
    if (m.user_id && !memberMap.has(m.user_id)) {
      memberMap.set(m.user_id, { user_id: m.user_id, team_id: m.team_id })
    }
  }

  // ── 3. Filter out users already checked today ────────────────────────────────

  const allUserIds = [...memberMap.keys()]
  const { data: checked } = await supabase
    .from('automations')
    .select('user_id, config')
    .in('user_id', allUserIds)
    .eq('automation_type', '_daily_check')

  const alreadyRanSet = new Set<string>(
    (checked ?? [])
      .filter(c => (c.config as Record<string, unknown>)?.lastRun === today)
      .map(c => c.user_id as string),
  )

  // ── 4. Pick a batch to process ───────────────────────────────────────────────

  const toProcess = [...memberMap.values()]
    .filter(m => !alreadyRanSet.has(m.user_id))
    .slice(0, batch_size)

  if (!toProcess.length) {
    return new Response(JSON.stringify({ processed: 0, reason: 'all users already checked today' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── 5. Process each user ─────────────────────────────────────────────────────

  let processed = 0

  await Promise.allSettled(
    toProcess.map(async ({ user_id, team_id }) => {
      // Mark as ran FIRST to prevent race with the client-side daily check
      await supabase
        .from('automations')
        .upsert(
          { user_id, automation_type: '_daily_check', enabled: false, config: { lastRun: today } },
          { onConflict: 'user_id,automation_type' },
        )

      const enabledTypes = teamAutomations.get(team_id) ?? new Set()
      const memberIds = await getTeamMemberIds(team_id)
      if (!memberIds.length) return

      await Promise.allSettled([
        enabledTypes.has('deal_stale_alert')   && checkStaleDeals(user_id, memberIds),
        enabledTypes.has('task_overdue_alert')  && checkOverdueTasks(user_id, memberIds),
        enabledTypes.has('deal_auto_archive')   && checkAutoArchive(memberIds),
      ])

      processed++
    }),
  )

  return new Response(JSON.stringify({ processed, total_due: toProcess.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getTeamMemberIds(teamId: string): Promise<string[]> {
  const { data } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId)
    .eq('status', 'active')
    .not('user_id', 'is', null)
  return (data ?? []).map(m => m.user_id as string).filter(Boolean)
}

async function checkStaleDeals(userId: string, memberIds: string[]): Promise<void> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)

  const { data: staleDeals } = await supabase
    .from('deals')
    .select('id, name, contact_id')
    .in('user_id', memberIds)
    .eq('archived', false)
    .not('stage', 'in', '("closed_won","closed_lost")')
    .lt('updated_at', cutoff.toISOString())

  if (!staleDeals?.length) return

  const contactIds = [...new Set(staleDeals.map(d => d.contact_id).filter(Boolean))] as string[]
  const contactMap: Record<string, string> = {}
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase.from('contacts').select('id, name').in('id', contactIds)
    for (const c of contacts ?? []) contactMap[c.id] = c.name
  }

  await supabase.from('notifications').insert(
    staleDeals.map(deal => ({
      user_id:  userId,
      title:    `Deal stale: ${deal.name}`,
      body:     `Your deal with ${deal.contact_id ? (contactMap[deal.contact_id] ?? 'a contact') : 'a contact'} hasn't moved in over 7 days. Consider following up.`,
      link_to:  '/deals',
    })),
  )
}

async function checkOverdueTasks(userId: string, memberIds: string[]): Promise<void> {
  const today = new Date().toISOString().split('T')[0]

  const { data: overdue } = await supabase
    .from('tasks')
    .select('id, title')
    .in('user_id', memberIds)
    .eq('completed', false)
    .lt('due_date', today)

  if (!overdue?.length) return

  await supabase.from('notifications').insert({
    user_id: userId,
    title:   `${overdue.length} overdue task${overdue.length !== 1 ? 's' : ''}`,
    body:    overdue.slice(0, 3).map(t => `• ${t.title}`).join('\n')
             + (overdue.length > 3 ? `\n• …and ${overdue.length - 3} more` : ''),
    link_to: '/tasks',
  })
}

async function checkAutoArchive(memberIds: string[]): Promise<void> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)

  const { data: closedDeals } = await supabase
    .from('deals')
    .select('id')
    .in('user_id', memberIds)
    .eq('archived', false)
    .in('stage', ['closed_won', 'closed_lost'])
    .lt('updated_at', cutoff.toISOString())

  if (!closedDeals?.length) return

  await supabase.from('deals').update({ archived: true }).in('id', closedDeals.map(d => d.id))
}
