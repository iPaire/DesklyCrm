import { supabase } from './supabase'
import type { Contact, Deal, Task, EmailLog, ActivityLog, GmailConnection } from '../types/index'

type TaskRow = Pick<Task, 'id' | 'due_date' | 'completed' | 'title' | 'created_at' | 'updated_at'>

export async function fetchDashboardData() {
  const [{ data: contacts }, { data: deals }, { data: tasks }] = await Promise.all([
    supabase.from('contacts').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('deals').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('tasks').select('id, due_date, completed, title, created_at, updated_at'),
  ])
  return {
    contacts: (contacts ?? []) as Contact[],
    deals: (deals ?? []) as Deal[],
    tasks: (tasks ?? []) as TaskRow[],
  }
}

export async function fetchContactsList() {
  const [{ data: contacts, error }, { data: deals }] = await Promise.all([
    supabase.from('contacts').select('*').order('created_at', { ascending: false }),
    supabase.from('deals').select('contact_id, stage'),
  ])
  if (error) throw error
  const dealCounts: Record<string, number> = {}
  const openDealContactIds = new Set<string>()
  for (const d of (deals ?? []) as { contact_id: string | null; stage: string }[]) {
    if (!d.contact_id) continue
    dealCounts[d.contact_id] = (dealCounts[d.contact_id] ?? 0) + 1
    if (!['closed_won', 'closed_lost'].includes(d.stage)) openDealContactIds.add(d.contact_id)
  }
  return {
    contacts: (contacts ?? []) as Contact[],
    dealCounts,
    openDealContactIds,
  }
}

export async function fetchDealsList() {
  const [{ data: deals, error }, { data: contacts }] = await Promise.all([
    supabase.from('deals').select('*').eq('archived', false).order('created_at', { ascending: true }),
    supabase.from('contacts').select('*').order('name', { ascending: true }),
  ])
  if (error) throw error
  return {
    deals: (deals ?? []) as Deal[],
    contacts: (contacts ?? []) as Contact[],
  }
}

export async function fetchContactDetail(contactId: string, userId: string) {
  const [contactRes, emailsRes, activityRes, dealsRes, tasksRes, allContactsRes, gmailRes] = await Promise.all([
    supabase.from('contacts').select('*').eq('id', contactId).single(),
    supabase.from('email_logs').select('*').eq('contact_id', contactId).order('received_at', { ascending: false }),
    supabase.from('activity_logs').select('*').eq('contact_id', contactId).order('created_at', { ascending: false }),
    supabase.from('deals').select('*').eq('contact_id', contactId).order('created_at', { ascending: false }),
    supabase.from('tasks').select('*').eq('contact_id', contactId).order('created_at', { ascending: false }),
    supabase.from('contacts').select('*').order('name'),
    supabase.from('gmail_connections').select('*').eq('user_id', userId).maybeSingle(),
  ])
  if (contactRes.error || !contactRes.data) throw new Error('Contact not found')
  return {
    contact:      contactRes.data as Contact,
    emails:       (emailsRes.data       ?? []) as EmailLog[],
    activityLogs: (activityRes.data     ?? []) as ActivityLog[],
    deals:        (dealsRes.data        ?? []) as Deal[],
    tasks:        (tasksRes.data        ?? []) as Task[],
    allContacts:  (allContactsRes.data  ?? []) as Contact[],
    gmailConn:    (gmailRes.data        ?? null) as GmailConnection | null,
  }
}

export async function fetchTasksList() {
  const [{ data: tasks, error }, { data: contacts }, { data: deals }] = await Promise.all([
    supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('contacts').select('*').order('name', { ascending: true }),
    supabase.from('deals').select('*').order('name', { ascending: true }),
  ])
  if (error) throw error
  return {
    tasks: (tasks ?? []) as Task[],
    contacts: (contacts ?? []) as Contact[],
    deals: (deals ?? []) as Deal[],
  }
}
