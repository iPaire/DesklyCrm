import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import type { Task, Contact, Deal } from '../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSaved: (task: Task, isNew: boolean) => void
  task?: Task | null
  contacts: Contact[]
  deals: Deal[]
  defaultContactId?: string
  defaultTitle?: string
  defaultDueDate?: string
}

export default function TaskModal({ isOpen, onClose, onSaved, task, contacts, deals, defaultContactId = '', defaultTitle = '', defaultDueDate = '' }: Props) {
  const user = useAuthStore(s => s.user)
  const [title,     setTitle]     = useState('')
  const [dueDate,   setDueDate]   = useState('')
  const [contactId, setContactId] = useState('')
  const [dealId,    setDealId]    = useState('')
  const [error,     setError]     = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const todayStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (!isOpen) return
    if (task) {
      setTitle(task.title)
      setDueDate(task.due_date ?? '')
      setContactId(task.contact_id ?? '')
      setDealId(task.deal_id ?? '')
    } else {
      setTitle(defaultTitle)
      setDueDate(defaultDueDate || todayStr)
      setContactId(defaultContactId)
      setDealId('')
    }
    setError('')
  }, [isOpen, task, todayStr, defaultContactId, defaultTitle, defaultDueDate])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isLoading) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, isLoading, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required.'); return }
    if (!user) return
    setError('')
    setIsLoading(true)

    const payload = {
      title:      title.trim(),
      due_date:   dueDate   || null,
      contact_id: contactId || null,
      deal_id:    dealId    || null,
    }

    if (task) {
      const { data, error: err } = await supabase
        .from('tasks').update(payload).eq('id', task.id).select().single()
      if (err) { setError(err.message); setIsLoading(false); return }
      if (data) { onSaved(data as Task, false); onClose() }
    } else {
      const { data, error: err } = await supabase
        .from('tasks').insert({ ...payload, user_id: user.id, completed: false }).select().single()
      if (err) { setError(err.message); setIsLoading(false); return }
      if (data) { onSaved(data as Task, true); onClose() }
    }

    setIsLoading(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!isLoading ? onClose : undefined}
      />

      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 z-10">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {task ? 'Edit Task' : 'New Task'}
          </h2>
          <button
            onClick={onClose} disabled={isLoading}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl">
              <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-10.5a.75.75 0 011.5 0v4a.75.75 0 01-1.5 0v-4zm.75 7a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text" required autoFocus
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Follow up with Acme Corp"
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
            />
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>

          {/* Contact */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Contact
            </label>
            <select
              value={contactId} onChange={e => setContactId(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
            >
              <option value="">No contact</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.company ? ` · ${c.company}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Deal */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Deal
            </label>
            <select
              value={dealId} onChange={e => setDealId(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
            >
              <option value="">No deal</option>
              {deals.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose} disabled={isLoading}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={isLoading}
              className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isLoading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {task
                ? (isLoading ? 'Saving...'   : 'Save Changes')
                : (isLoading ? 'Creating...' : 'Create Task')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
