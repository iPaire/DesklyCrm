import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import type { Contact, Deal, Task, EmailLog, ActivityLog } from '../types'
import { ContactModal } from '../components/ContactModal'
import { EmailLogModal } from '../components/EmailLogModal'
import { Toast } from '../components/Toast'
import DealModal from '../components/DealModal'
import TaskModal from '../components/TaskModal'

type Tab = 'timeline' | 'deals' | 'tasks'
type TimelineFilter = 'all' | 'email' | 'activity' | 'deal' | 'task'
type ActivityType = ActivityLog['type']

type TimelineEntry =
  | { kind: 'email';    date: string; email:    EmailLog    }
  | { kind: 'activity'; date: string; activity: ActivityLog }
  | { kind: 'deal';     date: string; deal:     Deal        }
  | { kind: 'task';     date: string; task:     Task        }

type ToastState = { message: string; type: 'success' | 'error'; action?: { label: string; onClick: () => void } } | null

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 'lg' }: { name: string; size?: 'sm' | 'lg' }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const cls = size === 'lg'
    ? 'w-14 h-14 text-lg font-bold'
    : 'w-8 h-8 text-xs font-semibold'
  return (
    <div className={`${cls} rounded-full bg-primary-100 dark:bg-primary-950 flex items-center justify-center shrink-0`}>
      <span className="text-primary-700 dark:text-primary-300">{initials}</span>
    </div>
  )
}

// ── Relative time ─────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 2)  return 'Just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Email card ────────────────────────────────────────────────────────────────

function EmailCard({
  email,
  contact,
  onView,
  onCreateDeal,
  onAddTask,
}: {
  email:        EmailLog
  contact:      Contact
  onView:       () => void
  onCreateDeal: () => void
  onAddTask:    () => void
}) {
  const isSent = email.direction === 'sent'

  return (
    <div className="flex gap-3 group">
      {/* Timeline dot */}
      <div className="flex flex-col items-center shrink-0 pt-0.5">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
          isSent
            ? 'bg-primary-100 dark:bg-primary-950'
            : 'bg-emerald-100 dark:bg-emerald-950'
        }`}>
          <svg className={`w-4 h-4 ${isSent ? 'text-primary-600 dark:text-primary-400' : 'text-emerald-600 dark:text-emerald-400'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isSent ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            )}
          </svg>
        </div>
        <div className="w-px flex-1 mt-2 bg-gray-100 dark:bg-gray-800" />
      </div>

      {/* Card */}
      <div className="flex-1 pb-5 min-w-0">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                isSent
                  ? 'text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-950'
                  : 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950'
              }`}>
                {isSent ? 'Sent' : 'Received'}
              </span>
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {email.subject ?? '(no subject)'}
              </p>
            </div>
            {email.received_at && (
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                {relativeTime(email.received_at)}
              </span>
            )}
          </div>

          {/* From/To line */}
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2 truncate">
            {isSent
              ? `To: ${email.to_email ?? contact.email ?? ''}`
              : `From: ${email.from_email ?? ''}`}
          </p>

          {/* Preview */}
          {email.body_preview && (
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
              "{email.body_preview}"
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onView}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              View Full Email
            </button>
            <button
              onClick={onCreateDeal}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-950/50 hover:bg-primary-100 dark:hover:bg-primary-950 rounded-lg transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Deal
            </button>
            <button
              onClick={onAddTask}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Add Task
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Stage badge ───────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  lead:        'text-gray-600 bg-gray-100 dark:text-gray-300 dark:bg-gray-800',
  qualified:   'text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-950',
  proposal:    'text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-950',
  negotiation: 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-950',
  closed_won:  'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950',
  closed_lost: 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-950',
}

const STAGE_LABELS: Record<string, string> = {
  lead: 'Lead', qualified: 'Qualified', proposal: 'Proposal',
  negotiation: 'Negotiation', closed_won: 'Closed Won', closed_lost: 'Closed Lost',
}

// ── Main ContactDetail page ───────────────────────────────────────────────────

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [contact,      setContact]      = useState<Contact | null>(null)
  const [emails,       setEmails]       = useState<EmailLog[]>([])
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [deals,        setDeals]        = useState<Deal[]>([])
  const [tasks,        setTasks]        = useState<Task[]>([])
  const [loading,      setLoading]      = useState(true)
  const [activeTab,    setActiveTab]    = useState<Tab>('timeline')
  const [toast,        setToast]        = useState<ToastState>(null)

  // Timeline filter
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all')

  // Add note form
  const [showAddNote, setShowAddNote] = useState(false)
  const [noteType,    setNoteType]    = useState<ActivityType>('note')
  const [noteContent, setNoteContent] = useState('')
  const [noteSaving,  setNoteSaving]  = useState(false)

  // Quick deal form
  const [showQuickDeal, setShowQuickDeal] = useState(false)
  const [qdName,        setQdName]        = useState('')
  const [qdValue,       setQdValue]       = useState('')
  const [qdStage,       setQdStage]       = useState<Deal['stage']>('lead')
  const [qdSaving,      setQdSaving]      = useState(false)

  // Modals
  const [editOpen,       setEditOpen]       = useState(false)
  const [viewEmail,      setViewEmail]      = useState<EmailLog | null>(null)
  const [quickDealEmail, setQuickDealEmail] = useState<EmailLog | null>(null)
  const [quickTaskEmail, setQuickTaskEmail] = useState<EmailLog | null>(null)
  const [allContacts,    setAllContacts]    = useState<Contact[]>([])

  useEffect(() => {
    if (!id) return
    loadAll(id)
  }, [id])

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [
      ...emails.map(e => ({ kind: 'email'    as const, date: e.received_at ?? e.created_at, email:    e })),
      ...activityLogs.map(a => ({ kind: 'activity' as const, date: a.created_at,              activity: a })),
      ...deals.map(d => ({ kind: 'deal'     as const, date: d.created_at,              deal:     d })),
      ...tasks.map(t => ({ kind: 'task'     as const, date: t.created_at,              task:     t })),
    ]
    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [emails, activityLogs, deals, tasks])

  const filteredEntries = useMemo(() => {
    if (timelineFilter === 'all') return timelineEntries
    return timelineEntries.filter(e => e.kind === timelineFilter)
  }, [timelineEntries, timelineFilter])

  const loadAll = async (contactId: string) => {
    setLoading(true)

    const [contactRes, emailsRes, activityRes, dealsRes, tasksRes, allContactsRes] = await Promise.all([
      supabase.from('contacts').select('*').eq('id', contactId).single(),
      supabase.from('email_logs').select('*').eq('contact_id', contactId).order('received_at', { ascending: false }),
      supabase.from('activity_logs').select('*').eq('contact_id', contactId).order('created_at', { ascending: false }),
      supabase.from('deals').select('*').eq('contact_id', contactId).order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').eq('contact_id', contactId).order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').order('name'),
    ])

    if (contactRes.error || !contactRes.data) {
      navigate('/contacts')
      return
    }

    setContact(contactRes.data as Contact)
    setEmails((emailsRes.data ?? []) as EmailLog[])
    setActivityLogs((activityRes.data ?? []) as ActivityLog[])
    setDeals((dealsRes.data ?? []) as Deal[])
    setTasks((tasksRes.data ?? []) as Task[])
    setAllContacts((allContactsRes.data ?? []) as Contact[])
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 border-[3px] border-primary-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading contact...</p>
        </div>
      </div>
    )
  }

  if (!contact) return null

  const twoFromNow = new Date()
  twoFromNow.setDate(twoFromNow.getDate() + 2)
  const taskDueDate = twoFromNow.toISOString().split('T')[0]

  const handleAddNote = async () => {
    if (!contact || !user || !noteContent.trim()) return
    setNoteSaving(true)
    const { data, error } = await supabase
      .from('activity_logs')
      .insert({ type: noteType, content: noteContent.trim(), contact_id: contact.id, user_id: user.id })
      .select()
      .single()
    setNoteSaving(false)
    if (error) { setToast({ message: error.message, type: 'error' }); return }
    setActivityLogs(prev => [data as ActivityLog, ...prev])
    setNoteContent('')
    setNoteType('note')
    setShowAddNote(false)
    setToast({ message: 'Activity logged.', type: 'success' })
  }

  const openQuickDeal = (name?: string, value?: number, stage?: Deal['stage']) => {
    setQdName(name ?? `${contact?.company ?? contact?.name ?? ''} - Deal`)
    setQdValue(value != null && value > 0 ? String(value) : '')
    setQdStage(stage ?? 'lead')
    setShowQuickDeal(true)
  }

  const handleQuickDealCreate = async () => {
    if (!contact || !user || !qdName.trim()) return
    setQdSaving(true)
    const { data, error } = await supabase
      .from('deals')
      .insert({ name: qdName.trim(), value: parseFloat(qdValue) || 0, stage: qdStage, contact_id: contact.id, user_id: user.id })
      .select()
      .single()
    setQdSaving(false)
    if (error) { setToast({ message: error.message, type: 'error' }); return }
    const newDeal = data as Deal
    setDeals(prev => [newDeal, ...prev])
    setShowQuickDeal(false)
    setQdName('')
    setQdValue('')
    setQdStage('lead')
    setToast({
      message: `Deal "${newDeal.name}" created!`,
      type: 'success',
      action: { label: 'View in pipeline', onClick: () => navigate('/deals') },
    })
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">

      {/* Back button */}
      <button
        onClick={() => navigate('/contacts')}
        className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-5 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Contacts
      </button>

      {/* Contact header card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={contact.name} size="lg" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{contact.name}</h1>
              {contact.company && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{contact.company}</p>
              )}
              <div className="flex flex-wrap gap-3 mt-2">
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 hover:underline">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {contact.email}
                  </a>
                )}
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:underline">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {contact.phone}
                  </a>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => setEditOpen(true)}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-xl transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-1.414.914l-3.414 1.138 1.138-3.414A4 4 0 019 13z" />
            </svg>
            Edit
          </button>
        </div>

        {contact.notes && (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
            {contact.notes}
          </p>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Timeline', count: emails.length + activityLogs.length, tab: 'timeline' as Tab },
          { label: 'Deals',  count: deals.length,    tab: 'deals'  as Tab },
          { label: 'Tasks',  count: tasks.length,    tab: 'tasks'  as Tab },
        ].map(s => (
          <button
            key={s.tab}
            onClick={() => setActiveTab(s.tab)}
            className={`flex flex-col items-center py-3 rounded-xl border transition-colors ${
              activeTab === s.tab
                ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/30'
                : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
            }`}
          >
            <span className={`text-xl font-bold ${activeTab === s.tab ? 'text-primary-600 dark:text-primary-400' : 'text-gray-900 dark:text-white'}`}>
              {s.count}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}

      {/* ── Timeline tab ── */}
      {activeTab === 'timeline' && (
        <div className="space-y-3">

          {/* Top bar: Add Note + filter */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-1.5 flex-wrap">
              {(['all', 'activity', 'email', 'deal', 'task'] as TimelineFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setTimelineFilter(f)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    timelineFilter === f
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'activity' ? 'Notes & Calls' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAddNote(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Note
            </button>
          </div>

          {/* Inline add-note form */}
          {showAddNote && (
            <div className="bg-white dark:bg-gray-900 border border-primary-200 dark:border-primary-800 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Log Activity</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Type</label>
                <select
                  value={noteType}
                  onChange={e => setNoteType(e.target.value as ActivityType)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="note">Note</option>
                  <option value="call">Call</option>
                  <option value="meeting">Meeting</option>
                  <option value="email">Email (manual)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Content</label>
                <textarea
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  placeholder="What happened?"
                  rows={3}
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAddNote}
                  disabled={!noteContent.trim() || noteSaving}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {noteSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => { setShowAddNote(false); setNoteContent('') }}
                  className="px-3.5 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {filteredEntries.length === 0 && (
            <div className="py-12 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">No activity yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {timelineFilter === 'all'
                  ? 'Log a note, call or meeting using the button above.'
                  : `No ${timelineFilter === 'activity' ? 'notes or calls' : timelineFilter + 's'} recorded yet.`}
              </p>
            </div>
          )}

          {/* Timeline entries */}
          <div className="space-y-0">
            {filteredEntries.map((entry, i) => {
              const isLast = i === filteredEntries.length - 1

              if (entry.kind === 'email') {
                return (
                  <EmailCard
                    key={entry.email.id}
                    email={entry.email}
                    contact={contact}
                    onView={() => setViewEmail(entry.email)}
                    onCreateDeal={() => setQuickDealEmail(entry.email)}
                    onAddTask={() => setQuickTaskEmail(entry.email)}
                  />
                )
              }

              if (entry.kind === 'activity') {
                const a = entry.activity
                const typeConfig: Record<ActivityType, { label: string; color: string; icon: JSX.Element }> = {
                  note:    { label: 'Note',    color: 'bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /> },
                  call:    { label: 'Call',    color: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /> },
                  meeting: { label: 'Meeting', color: 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /> },
                  email:   { label: 'Email',   color: 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /> },
                }
                const cfg = typeConfig[a.type]
                return (
                  <div key={a.id} className="flex gap-3">
                    <div className="flex flex-col items-center shrink-0 pt-0.5">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${cfg.color}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">{cfg.icon}</svg>
                      </div>
                      {!isLast && <div className="w-px flex-1 mt-2 bg-gray-100 dark:bg-gray-800" />}
                    </div>
                    <div className="flex-1 pb-5 min-w-0">
                      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.color}`}>
                            {cfg.label}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{relativeTime(a.created_at)}</span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{a.content}</p>
                      </div>
                    </div>
                  </div>
                )
              }

              if (entry.kind === 'deal') {
                const d = entry.deal
                return (
                  <div key={`deal-${d.id}`} className="flex gap-3">
                    <div className="flex flex-col items-center shrink-0 pt-0.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary-100 dark:bg-primary-950 text-primary-600 dark:text-primary-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      {!isLast && <div className="w-px flex-1 mt-2 bg-gray-100 dark:bg-gray-800" />}
                    </div>
                    <div className="flex-1 pb-5 min-w-0">
                      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300">
                            Deal Created
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{relativeTime(d.created_at)}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{d.name}</p>
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STAGE_COLORS[d.stage] ?? ''}`}>
                            {STAGE_LABELS[d.stage] ?? d.stage}
                          </span>
                        </div>
                        {d.value > 0 && (
                          <p className="text-sm font-bold text-primary-600 dark:text-primary-400 mt-0.5">${d.value.toLocaleString()}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              }

              if (entry.kind === 'task') {
                const t = entry.task
                return (
                  <div key={`task-${t.id}`} className="flex gap-3">
                    <div className="flex flex-col items-center shrink-0 pt-0.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                      </div>
                      {!isLast && <div className="w-px flex-1 mt-2 bg-gray-100 dark:bg-gray-800" />}
                    </div>
                    <div className="flex-1 pb-5 min-w-0">
                      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            Task Created
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{relativeTime(t.created_at)}</span>
                        </div>
                        <p className={`text-sm font-medium mt-1.5 ${t.completed ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-900 dark:text-white'}`}>
                          {t.title}
                        </p>
                        {t.due_date && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            Due {new Date(t.due_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              }

              return null
            })}
          </div>

        </div>
      )}

      {/* ── Deals tab ── */}
      {activeTab === 'deals' && (
        <div className="space-y-3">

          {/* Quick create bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-2 flex-wrap">
              {([
                { label: 'Discovery Call', value: 0,     stage: 'lead'        as Deal['stage'] },
                { label: 'Proposal',       value: 5000,  stage: 'proposal'    as Deal['stage'] },
                { label: 'Contract',       value: 10000, stage: 'negotiation' as Deal['stage'] },
              ] as const).map(tpl => (
                <button
                  key={tpl.label}
                  onClick={() => openQuickDeal(tpl.label, tpl.value, tpl.stage)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  {tpl.label}
                  {tpl.value > 0 && <span className="text-gray-400 dark:text-gray-500 ml-0.5">· ${(tpl.value / 1000).toFixed(0)}k</span>}
                </button>
              ))}
            </div>
            <button
              onClick={() => openQuickDeal()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Quick Create Deal
            </button>
          </div>

          {/* Inline form */}
          {showQuickDeal && (
            <div className="bg-white dark:bg-gray-900 border border-primary-200 dark:border-primary-800 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">New Deal</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Deal Name</label>
                <input
                  type="text"
                  value={qdName}
                  onChange={e => setQdName(e.target.value)}
                  placeholder="Deal name..."
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Value ($)</label>
                  <input
                    type="number"
                    value={qdValue}
                    onChange={e => setQdValue(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Stage</label>
                  <select
                    value={qdStage}
                    onChange={e => setQdStage(e.target.value as Deal['stage'])}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    {Object.entries(STAGE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleQuickDealCreate}
                  disabled={!qdName.trim() || qdSaving}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {qdSaving ? 'Creating...' : 'Create Deal'}
                </button>
                <button
                  onClick={() => setShowQuickDeal(false)}
                  className="px-3.5 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {deals.length === 0 && !showQuickDeal && (
            <div className="py-12 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">No deals yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Use the templates or button above to create your first deal.</p>
            </div>
          )}

          {/* Deals list */}
          {deals.map(deal => (
            <div key={deal.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{deal.name}</p>
                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STAGE_COLORS[deal.stage] ?? ''}`}>
                  {STAGE_LABELS[deal.stage] ?? deal.stage}
                </span>
              </div>
              {deal.value > 0 && (
                <p className="text-sm font-bold text-primary-600 dark:text-primary-400 mt-1">
                  ${deal.value.toLocaleString()}
                </p>
              )}
            </div>
          ))}

        </div>
      )}

      {/* ── Tasks tab ── */}
      {activeTab === 'tasks' && (
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <div className="py-16 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">No tasks yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Tasks linked to this contact will appear here.</p>
            </div>
          ) : (
            tasks.map(task => (
              <div key={task.id} className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                  task.completed
                    ? 'bg-emerald-500 border-emerald-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}>
                  {task.completed && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ margin: '1px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${task.completed ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-900 dark:text-white'}`}>
                    {task.title}
                  </p>
                  {task.due_date && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Due {new Date(task.due_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Modals ── */}

      {/* Edit contact */}
      {editOpen && (
        <ContactModal
          contact={contact}
          onClose={() => setEditOpen(false)}
          onSaved={(_, saved) => {
            setContact(saved as Contact)
            setEditOpen(false)
            setToast({ message: 'Contact updated.', type: 'success' })
          }}
        />
      )}

      {/* Full email view */}
      {viewEmail && contact && (
        <EmailLogModal
          email={viewEmail}
          contact={contact}
          onClose={() => setViewEmail(null)}
          onDealCreated={deal => {
            setDeals(prev => [deal, ...prev])
            setToast({ message: `Deal "${deal.name}" created!`, type: 'success' })
          }}
          onTaskCreated={task => {
            setTasks(prev => [task, ...prev])
            setToast({ message: 'Task created!', type: 'success' })
          }}
        />
      )}

      {/* Quick Create Deal from email card */}
      {quickDealEmail && contact && (
        <DealModal
          isOpen={!!quickDealEmail}
          onClose={() => setQuickDealEmail(null)}
          onSaved={(deal, isNew) => {
            setQuickDealEmail(null)
            if (isNew) {
              setDeals(prev => [deal, ...prev])
              setToast({ message: `Deal "${deal.name}" created!`, type: 'success' })
            }
          }}
          deal={null}
          contacts={allContacts}
          defaultStage="lead"
          defaultContactId={contact.id}
          defaultName={quickDealEmail.subject ?? ''}
        />
      )}

      {/* Quick Add Task from email card */}
      {quickTaskEmail && contact && (
        <TaskModal
          isOpen={!!quickTaskEmail}
          onClose={() => setQuickTaskEmail(null)}
          onSaved={(task, isNew) => {
            setQuickTaskEmail(null)
            if (isNew) {
              setTasks(prev => [task, ...prev])
              setToast({ message: 'Task created!', type: 'success' })
            }
          }}
          task={null}
          contacts={allContacts}
          deals={deals}
          defaultContactId={contact.id}
          defaultTitle={`Follow up: ${quickTaskEmail.subject ?? 'Email'}`}
          defaultDueDate={taskDueDate}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} action={toast.action} onDismiss={() => setToast(null)} />
      )}
    </div>
  )
}
