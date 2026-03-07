// ─── Automation engine ────────────────────────────────────────────────────────
//
// Automations are stored in the `automations` table (one row per type per user).
// Notifications are stored in the `notifications` table (in-app inbox).
//
// Immediate triggers are called from UI components after the triggering action.
// Daily checks run once per calendar day (tracked in localStorage).
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'
import type { AutomationType, Automation, Deal, Contact, EmailLog } from '../types'

// ── Definitions ───────────────────────────────────────────────────────────────

export interface AutomationDef {
  type:         AutomationType
  title:        string
  description:  string
  actionDetail: string
  icon:         string
}

export const AUTOMATION_DEFS: AutomationDef[] = [
  {
    type:         'deal_proposal_task',
    icon:         '📋',
    title:        'Auto-create task when deal moves to Proposal',
    description:  'Creates a follow-up task whenever a deal reaches the Proposal stage.',
    actionDetail: 'Creates task "Send proposal to [Contact]", due in 2 days',
  },
  {
    type:         'deal_stale_alert',
    icon:         '⏰',
    title:        'Alert me when deal sits in a stage > 7 days',
    description:  'Notifies you when a deal hasn\'t been updated in 7 or more days.',
    actionDetail: 'In-app notification: "Deal with [Contact] hasn\'t moved in 7 days"',
  },
  {
    type:         'email_followup_task',
    icon:         '✉️',
    title:        'Auto-create follow-up task 3 days after email sent',
    description:  'Creates a task to follow up whenever you send an email to a contact.',
    actionDetail: 'Creates task "Follow up with [Contact]", due in 3 days',
  },
  {
    type:         'task_overdue_alert',
    icon:         '🔔',
    title:        'Notify when task is overdue',
    description:  'Sends a daily in-app alert listing all overdue tasks.',
    actionDetail: 'In-app notification: daily summary of overdue tasks',
  },
  {
    type:         'deal_auto_archive',
    icon:         '📦',
    title:        'Auto-archive closed deals after 30 days',
    description:  'Automatically archives Closed Won/Lost deals after 30 days to keep your pipeline clean.',
    actionDetail: 'Marks old closed deals as archived - hidden from the Kanban board',
  },
  {
    type:         'contact_reach_out_task',
    icon:         '👋',
    title:        'Create task when new contact is added',
    description:  'Creates a reminder to reach out whenever you add a new contact.',
    actionDetail: 'Creates task "Reach out to [Contact]", due tomorrow',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isEnabled(automations: Automation[], type: AutomationType): boolean {
  return automations.find(a => a.automation_type === type)?.enabled ?? false
}

export async function getUserAutomations(userId: string): Promise<Automation[]> {
  const { data } = await supabase
    .from('automations')
    .select('*')
    .eq('user_id', userId)
  return (data ?? []) as Automation[]
}

/** Fetch automation settings for a whole team (team_id-scoped rows). */
export async function getTeamAutomations(teamId: string): Promise<Automation[]> {
  const { data } = await supabase
    .from('automations')
    .select('*')
    .eq('team_id', teamId)
  return (data ?? []) as Automation[]
}

export async function createNotification(
  userId: string,
  title:  string,
  body:   string,
  linkTo?: string,
): Promise<void> {
  await supabase.from('notifications').insert({
    user_id: userId,
    title,
    body,
    link_to: linkTo ?? null,
  })
}

function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

// ── Immediate triggers ────────────────────────────────────────────────────────

/** Called when a deal is saved/moved to 'proposal' stage. */
export async function runDealProposalTask(
  deal:      Deal,
  contacts:  Contact[],
  userId:    string,
): Promise<void> {
  const contactName = contacts.find(c => c.id === deal.contact_id)?.name ?? 'Contact'
  await supabase.from('tasks').insert({
    user_id:    userId,
    contact_id: deal.contact_id ?? null,
    deal_id:    deal.id,
    title:      `Send proposal to ${contactName}`,
    due_date:   addDays(2),
    completed:  false,
  })
}

/** Called when a new contact is created. */
export async function runContactReachOutTask(
  contact: Contact,
  userId:  string,
): Promise<void> {
  await supabase.from('tasks').insert({
    user_id:    userId,
    contact_id: contact.id,
    title:      `Reach out to ${contact.name}`,
    due_date:   addDays(1),
    completed:  false,
  })
}

/** Called once per sent email during Gmail sync. */
export async function runEmailFollowupTask(
  _emailLog: EmailLog,
  contact:  Contact,
  userId:   string,
): Promise<void> {
  await supabase.from('tasks').insert({
    user_id:    userId,
    contact_id: contact.id,
    title:      `Follow up with ${contact.name}`,
    due_date:   addDays(3),
    completed:  false,
  })
}

// ── Daily check runners ───────────────────────────────────────────────────────

async function checkStaleDeals(userId: string): Promise<void> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)

  // No user_id filter: RLS returns team data automatically
  const { data: staleDeals } = await supabase
    .from('deals')
    .select('id, name, contact_id, stage, updated_at')
    .eq('archived', false)
    .not('stage', 'in', '("closed_won","closed_lost")')
    .lt('updated_at', cutoff.toISOString())

  if (!staleDeals || staleDeals.length === 0) return

  // Fetch contact names for context
  const contactIds = [...new Set(staleDeals.map(d => d.contact_id).filter(Boolean))]
  let contactMap: Record<string, string> = {}
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name')
      .in('id', contactIds as string[])
    for (const c of contacts ?? []) contactMap[c.id] = c.name
  }

  for (const deal of staleDeals) {
    const who = deal.contact_id ? (contactMap[deal.contact_id] ?? 'a contact') : 'a contact'
    await createNotification(
      userId,
      `Deal stale: ${deal.name}`,
      `Your deal with ${who} hasn't moved in over 7 days. Consider following up.`,
      '/deals',
    )
  }
}

async function checkOverdueTasks(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0]

  // No user_id filter: RLS returns team data automatically
  const { data: overdue } = await supabase
    .from('tasks')
    .select('id, title, due_date, contact_id')
    .eq('completed', false)
    .lt('due_date', today)

  if (!overdue || overdue.length === 0) return

  await createNotification(
    userId,
    `${overdue.length} overdue task${overdue.length !== 1 ? 's' : ''}`,
    overdue.slice(0, 3).map(t => `• ${t.title}`).join('\n')
      + (overdue.length > 3 ? `\n• …and ${overdue.length - 3} more` : ''),
    '/tasks',
  )
}

async function checkAutoArchive(): Promise<void> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)

  // No user_id filter: RLS returns team data automatically
  const { data: closedDeals } = await supabase
    .from('deals')
    .select('id')
    .eq('archived', false)
    .in('stage', ['closed_won', 'closed_lost'])
    .lt('updated_at', cutoff.toISOString())

  if (!closedDeals || closedDeals.length === 0) return

  const ids = closedDeals.map(d => d.id)
  await supabase
    .from('deals')
    .update({ archived: true })
    .in('id', ids)
}

// ── Main daily runner (called from Dashboard on mount, once per day) ───────────

export async function runDailyChecks(userId: string, teamId: string): Promise<void> {
  const today = new Date().toDateString()

  // Gate is per-user (each user tracks their own daily run via user_id row)
  const { data: meta } = await supabase
    .from('automations')
    .select('config')
    .eq('user_id', userId)
    .eq('automation_type', '_daily_check')
    .maybeSingle()

  if ((meta?.config as Record<string, unknown> | null)?.lastRun === today) return

  // Mark as ran immediately to prevent duplicate runs (even cross-device)
  await supabase
    .from('automations')
    .upsert(
      { user_id: userId, automation_type: '_daily_check', enabled: false, config: { lastRun: today } },
      { onConflict: 'user_id,automation_type' },
    )

  try {
    // Load TEAM automations to check which are enabled (shared across the whole team)
    const automations = await getTeamAutomations(teamId)

    await Promise.all([
      isEnabled(automations, 'deal_stale_alert')  && checkStaleDeals(userId),
      isEnabled(automations, 'task_overdue_alert') && checkOverdueTasks(userId),
      isEnabled(automations, 'deal_auto_archive')  && checkAutoArchive(),
    ])
  } catch {
    // Silently fail - daily checks are non-critical
  }
}
