import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Contact, Deal, Task, EmailLog } from '../types'
import { ContactModal } from '../components/ContactModal'
import { EmailLogModal } from '../components/EmailLogModal'
import { Toast } from '../components/Toast'
import DealModal from '../components/DealModal'
import TaskModal from '../components/TaskModal'

type Tab = 'emails' | 'deals' | 'tasks'

type ToastState = { message: string; type: 'success' | 'error' } | null

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

  const [contact,   setContact]   = useState<Contact | null>(null)
  const [emails,    setEmails]    = useState<EmailLog[]>([])
  const [deals,     setDeals]     = useState<Deal[]>([])
  const [tasks,     setTasks]     = useState<Task[]>([])
  const [loading,   setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('emails')
  const [toast,     setToast]     = useState<ToastState>(null)

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

  const loadAll = async (contactId: string) => {
    setLoading(true)

    const [contactRes, emailsRes, dealsRes, tasksRes, allContactsRes] = await Promise.all([
      supabase.from('contacts').select('*').eq('id', contactId).single(),
      supabase.from('email_logs').select('*').eq('contact_id', contactId).order('received_at', { ascending: false }),
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
          { label: 'Emails', count: emails.length,   tab: 'emails' as Tab },
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

      {/* ── Emails tab ── */}
      {activeTab === 'emails' && (
        <div>
          {emails.length === 0 ? (
            <div className="py-16 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">No emails synced yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Connect Gmail in Settings and run a sync to see emails with this contact.
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {emails.map(email => (
                <EmailCard
                  key={email.id}
                  email={email}
                  contact={contact}
                  onView={() => setViewEmail(email)}
                  onCreateDeal={() => setQuickDealEmail(email)}
                  onAddTask={() => setQuickTaskEmail(email)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Deals tab ── */}
      {activeTab === 'deals' && (
        <div className="space-y-3">
          {deals.length === 0 ? (
            <div className="py-16 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">No deals yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Deals linked to this contact will appear here.</p>
            </div>
          ) : (
            deals.map(deal => (
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
            ))
          )}
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
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  )
}
