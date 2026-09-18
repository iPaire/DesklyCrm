// One-off script that (re)seeds the public demo account used in the README's
// "Try the demo" link. Safe to re-run - it clears and rewrites only the demo
// user's own rows, which RLS keeps isolated from every other tenant.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo.mjs
//
// Never commit real values for these two env vars.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@desklycrm.com'
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'desklydemo'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function getOrCreateDemoUser() {
  const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
  const found = existing?.users.find((u) => u.email === DEMO_EMAIL)
  if (found) return found

  const { data, error } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  })
  if (error) throw error
  return data.user
}

async function main() {
  const user = await getOrCreateDemoUser()
  console.log(`Demo user: ${user.email} (${user.id})`)

  const now = new Date().toISOString()

  const { data: team, error: teamErr } = await supabase
    .from('teams')
    .upsert(
      {
        owner_id: user.id,
        owner_email: user.email,
        name: 'Demo Workspace',
        trial_start: now,
        subscription_status: 'active', // never gated by the trial - no real Stripe subscription attached
        seats: 1,
      },
      { onConflict: 'owner_id' },
    )
    .select()
    .single()
  if (teamErr) throw teamErr

  await supabase
    .from('team_members')
    .upsert(
      { team_id: team.id, user_id: user.id, email: user.email, role: 'owner', status: 'active', joined_at: now },
      { onConflict: 'team_id,email' },
    )

  // Clear previous demo data so this script is safe to re-run
  for (const table of ['tasks', 'deals', 'contacts']) {
    await supabase.from(table).delete().eq('user_id', user.id)
  }

  const contacts = [
    { name: 'Elena Marinescu', email: 'elena@northwind.ro', phone: '+40 721 555 010', company: 'Northwind Studio' },
    { name: 'Victor Ionescu', email: 'victor@brightpath.io', phone: '+40 722 555 021', company: 'BrightPath' },
    { name: 'Sofia Dumitrescu', email: 'sofia@lumacraft.com', phone: '+40 723 555 032', company: 'LumaCraft' },
    { name: 'Radu Popescu', email: 'radu@vertexlabs.dev', phone: '+40 724 555 043', company: 'Vertex Labs' },
    { name: 'Ana Constantin', email: 'ana@harboranalytics.com', phone: '+40 725 555 054', company: 'Harbor Analytics' },
    { name: 'Mihai Stanciu', email: 'mihai@orbitgoods.ro', phone: '+40 726 555 065', company: 'Orbit Goods' },
  ]
  const { data: insertedContacts, error: contactsErr } = await supabase
    .from('contacts')
    .insert(contacts.map((c) => ({ ...c, user_id: user.id })))
    .select()
  if (contactsErr) throw contactsErr
  console.log(`Seeded ${insertedContacts.length} contacts`)

  const byName = Object.fromEntries(insertedContacts.map((c) => [c.name, c]))
  const deals = [
    { name: 'Northwind - annual plan', value: 4800, stage: 'proposal', contact: 'Elena Marinescu' },
    { name: 'BrightPath onboarding', value: 1200, stage: 'lead', contact: 'Victor Ionescu' },
    { name: 'LumaCraft expansion', value: 6400, stage: 'negotiation', contact: 'Sofia Dumitrescu' },
    { name: 'Vertex Labs pilot', value: 900, stage: 'qualified', contact: 'Radu Popescu' },
    { name: 'Harbor Analytics renewal', value: 3200, stage: 'closed_won', contact: 'Ana Constantin' },
    { name: 'Orbit Goods trial', value: 500, stage: 'closed_lost', contact: 'Mihai Stanciu' },
  ]
  const { error: dealsErr } = await supabase.from('deals').insert(
    deals.map((d) => ({
      user_id: user.id,
      contact_id: byName[d.contact]?.id ?? null,
      name: d.name,
      value: d.value,
      stage: d.stage,
      archived: false,
    })),
  )
  if (dealsErr) throw dealsErr
  console.log(`Seeded ${deals.length} deals`)

  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0] }
  const tasks = [
    { title: 'Send proposal to Elena Marinescu', due_date: addDays(2), contact: 'Elena Marinescu' },
    { title: 'Follow up with Victor Ionescu', due_date: addDays(-1), contact: 'Victor Ionescu' },
    { title: 'Prep negotiation notes for LumaCraft', due_date: addDays(1), contact: 'Sofia Dumitrescu' },
    { title: 'Reach out to Radu Popescu', due_date: addDays(-3), contact: 'Radu Popescu' },
    { title: 'Renewal call with Harbor Analytics', due_date: addDays(5), contact: 'Ana Constantin' },
  ]
  const { error: tasksErr } = await supabase.from('tasks').insert(
    tasks.map((t) => ({
      user_id: user.id,
      contact_id: byName[t.contact]?.id ?? null,
      title: t.title,
      due_date: t.due_date,
      completed: false,
    })),
  )
  if (tasksErr) throw tasksErr
  console.log(`Seeded ${tasks.length} tasks`)

  console.log('\nDemo account ready:')
  console.log(`  email:    ${DEMO_EMAIL}`)
  console.log(`  password: ${DEMO_PASSWORD}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
