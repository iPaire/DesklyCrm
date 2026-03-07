import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { Task, Contact, Deal } from '../types'
import TaskModal from '../components/TaskModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Toast } from '../components/Toast'
import { useAuthStore } from '../store/authStore'
import { useBillingStore } from '../store/billingStore'
import { logTeamActivity } from '../lib/billing'

type FilterTab = 'all' | 'today' | 'overdue' | 'completed'

// ─── Date helpers ─────────────────────────────────────────────────────────────
// Parse as local date (avoids UTC-shift bugs with date-only strings)
function getLocalToday(): string {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

function formatDate(dateStr: string, todayStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date      = new Date(y, m - 1, d)
  const [ty, tm, td] = todayStr.split('-').map(Number)
  const todayDate = new Date(ty, tm - 1, td)
  const diff = Math.round((date.getTime() - todayDate.getTime()) / 86_400_000)

  if (diff === 0)  return 'Today'
  if (diff === 1)  return 'Tomorrow'
  if (diff === -1) return 'Yesterday'

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    ...(date.getFullYear() !== todayDate.getFullYear() ? { year: 'numeric' } : {}),
  })
}

function isOverdue(task: Task, today: string) {
  return !!task.due_date && task.due_date < today && !task.completed
}

function isDueToday(task: Task, today: string) {
  return task.due_date === today && !task.completed
}

// ─── Task row ─────────────────────────────────────────────────────────────────

interface RowProps {
  task:     Task
  contacts: Contact[]
  deals:    Deal[]
  today:    string
  onEdit:   (t: Task) => void
  onDelete: (t: Task) => void
  onToggle: (t: Task) => void
}

function TaskRow({ task, contacts, deals, today, onEdit, onDelete, onToggle }: RowProps) {
  const contact  = contacts.find(c => c.id === task.contact_id)
  const deal     = deals.find(d => d.id === task.deal_id)
  const overdue  = isOverdue(task, today)
  const dueToday = isDueToday(task, today)

  return (
    <li
      onClick={() => onEdit(task)}
      className="group flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer transition-colors"
    >
      {/* Checkbox */}
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onToggle(task) }}
        className={`
          w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shrink-0
          transition-all duration-150
          ${task.completed
            ? 'bg-emerald-500 border-emerald-500'
            : 'border-gray-300 dark:border-gray-600 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
          }
        `}
      >
        {task.completed && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Title + links */}
      <div className="flex-1 min-w-0">
        <p className={`
          text-sm font-medium leading-snug truncate
          ${task.completed
            ? 'line-through text-gray-400 dark:text-gray-500'
            : 'text-gray-900 dark:text-white'}
        `}>
          {task.title}
        </p>

        {(contact || deal) && (
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {contact && (
              <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {contact.name}
              </span>
            )}
            {contact && deal && (
              <span className="text-gray-300 dark:text-gray-700 text-xs">·</span>
            )}
            {deal && (
              <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {deal.name}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Due date badge */}
      {task.due_date ? (
        <span className={`
          shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg whitespace-nowrap
          ${task.completed
            ? 'text-gray-400 dark:text-gray-600'
            : overdue
              ? 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-900'
              : dueToday
                ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 ring-1 ring-amber-200 dark:ring-amber-900'
                : 'text-gray-500 dark:text-gray-400'
          }
        `}>
          {!task.completed && (overdue || dueToday) && (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
          {formatDate(task.due_date, today)}
        </span>
      ) : (
        <span className="shrink-0 w-16" />
      )}

      {/* Delete */}
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onDelete(task) }}
        className="opacity-0 group-hover:opacity-100 shrink-0 p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-all duration-150"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </li>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

const EMPTY: Record<FilterTab, { title: string; sub: string; addable: boolean }> = {
  all:       { title: 'No tasks yet',          sub: 'Create your first task to stay organized.',    addable: true },
  today:     { title: 'Nothing due today',      sub: "You're all caught up for today!",              addable: false },
  overdue:   { title: 'No overdue tasks',       sub: 'Great job staying on top of things.',          addable: false },
  completed: { title: 'No completed tasks yet', sub: 'Tasks you complete will appear here.',         addable: false },
}

function EmptyState({ filter, onAdd }: { filter: FilterTab; onAdd: () => void }) {
  const { title, sub, addable } = EMPTY[filter]
  return (
    <div className="py-14 flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{sub}</p>
      {addable && (
        <button
          onClick={onAdd}
          className="mt-4 text-sm text-primary-600 dark:text-primary-400 font-medium hover:underline"
        >
          Create a task →
        </button>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Tasks() {
  const user = useAuthStore(s => s.user)
  const team = useBillingStore(s => s.team)
  const [tasks,    setTasks]    = useState<Task[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [deals,    setDeals]    = useState<Deal[]>([])
  const [loading,    setLoading]    = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [retryKey,   setRetryKey]   = useState(0)
  const [filter,     setFilter]     = useState<FilterTab>('all')

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editTask,  setEditTask]  = useState<Task | null>(null)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)
  const [isDeleting,   setIsDeleting]   = useState(false)

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const today = getLocalToday()

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [
        { data: taskData,    error: taskErr },
        { data: contactData, error: contactErr },
        { data: dealData,    error: dealErr },
      ] = await Promise.all([
        supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }),
        supabase.from('contacts').select('*').order('name', { ascending: true }),
        supabase.from('deals').select('*').order('name', { ascending: true }),
      ])
      if (taskErr || contactErr || dealErr) {
        setFetchError((taskErr ?? contactErr ?? dealErr)!.message)
        setLoading(false)
        return
      }
      setTasks((taskData   ?? []) as Task[])
      setContacts((contactData ?? []) as Contact[])
      setDeals((dealData   ?? []) as Deal[])
      setLoading(false)
    }
    load()
  }, [retryKey])

  // ── Derived state ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    switch (filter) {
      case 'today':     return tasks.filter(t => isDueToday(t, today))
      case 'overdue':   return tasks.filter(t => isOverdue(t, today))
      case 'completed': return tasks.filter(t => t.completed)
      default:          return tasks
    }
  }, [tasks, filter, today])

  const counts = useMemo(() => ({
    all:       tasks.length,
    today:     tasks.filter(t => isDueToday(t, today)).length,
    overdue:   tasks.filter(t => isOverdue(t, today)).length,
    completed: tasks.filter(t => t.completed).length,
  }), [tasks, today])

  // ── Actions ────────────────────────────────────────────────────────────────
  const toggleComplete = async (task: Task) => {
    const next = !task.completed
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: next } : t))
    const { error } = await supabase
      .from('tasks').update({ completed: next }).eq('id', task.id)
    if (error) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: task.completed } : t))
      setToast({ message: error.message, type: 'error' })
    } else if (team && user) {
      logTeamActivity({ teamId: team.id, userId: user.id, userEmail: user.email ?? '', action: 'completed', entityType: 'task', entityId: task.id, entityName: task.title, details: { completed: next } })
    }
  }

  const openAdd = () => { setEditTask(null); setModalOpen(true) }
  const openEdit = (task: Task) => { setEditTask(task); setModalOpen(true) }

  const handleSaved = (saved: Task, isNew: boolean) => {
    if (isNew) {
      setTasks(prev =>
        [...prev, saved].sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0
          if (!a.due_date) return 1
          if (!b.due_date) return -1
          return a.due_date.localeCompare(b.due_date)
        })
      )
      setToast({ message: 'Task created!', type: 'success' })
    } else {
      setTasks(prev => prev.map(t => t.id === saved.id ? saved : t))
      setToast({ message: 'Task updated!', type: 'success' })
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    const { error } = await supabase.from('tasks').delete().eq('id', deleteTarget.id)
    if (!error) {
      if (team && user) logTeamActivity({ teamId: team.id, userId: user.id, userEmail: user.email ?? '', action: 'deleted', entityType: 'task', entityId: deleteTarget.id, entityName: deleteTarget.title })
      setTasks(prev => prev.filter(t => t.id !== deleteTarget.id))
      setToast({ message: 'Task deleted.', type: 'success' })
    } else {
      setToast({ message: error.message, type: 'error' })
    }
    setIsDeleting(false)
    setDeleteTarget(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
        <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Failed to load tasks</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">{fetchError}</p>
        <button
          onClick={() => { setFetchError(''); setLoading(true); setRetryKey(k => k + 1) }}
          className="mt-1 px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  const TABS: { id: FilterTab; label: string }[] = [
    { id: 'all',       label: 'All' },
    { id: 'today',     label: 'Today' },
    { id: 'overdue',   label: 'Overdue' },
    { id: 'completed', label: 'Completed' },
  ]

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tasks</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {tasks.filter(t => !t.completed).length} remaining
            {counts.overdue > 0 && (
              <span className="ml-1.5 text-red-500 dark:text-red-400 font-medium">
                · {counts.overdue} overdue
              </span>
            )}
          </p>
        </div>

        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Task
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-5 bg-gray-100 dark:bg-gray-800/60 p-1 rounded-xl w-fit">
        {TABS.map(tab => {
          const active = filter === tab.id
          const count  = counts[tab.id]
          const isOverdueTab = tab.id === 'overdue'
          return (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${active
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }
              `}
            >
              {tab.label}
              {count > 0 && (
                <span className={`
                  text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums leading-none
                  ${active && isOverdueTab
                    ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400'
                    : active
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-400'
                      : isOverdueTab
                        ? 'bg-red-100 text-red-500 dark:bg-red-950/60 dark:text-red-400'
                        : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }
                `}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* List */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* Column labels (only when there's content) */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-100 dark:border-gray-800">
            <div className="w-[18px]" />
            <span className="flex-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              Task
            </span>
            <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide w-16 text-right pr-1">
              Due
            </span>
            <div className="w-7" />
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState filter={filter} onAdd={openAdd} />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                contacts={contacts}
                deals={deals}
                today={today}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onToggle={toggleComplete}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Completed count footer */}
      {filter === 'all' && counts.completed > 0 && tasks.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-center">
          {counts.completed} task{counts.completed !== 1 ? 's' : ''} completed
          <button
            onClick={() => setFilter('completed')}
            className="ml-1 text-primary-500 dark:text-primary-400 hover:underline"
          >
            · view all
          </button>
        </p>
      )}

      {/* Modals */}
      <TaskModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        task={editTask}
        contacts={contacts}
        deals={deals}
      />

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Task"
          message={`Delete "${deleteTarget.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          isLoading={isDeleting}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  )
}
