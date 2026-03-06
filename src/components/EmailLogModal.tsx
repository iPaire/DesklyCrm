import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import type { EmailLog, Contact, Deal, Task } from '../types'
import DealModal from './DealModal'
import TaskModal from './TaskModal'

interface Props {
  email:    EmailLog
  contact:  Contact
  onClose:  () => void
  onTaskCreated?: (task: Task) => void
  onDealCreated?: (deal: Deal) => void
}

export function EmailLogModal({ email, contact, onClose, onTaskCreated, onDealCreated }: Props) {
  const user = useAuthStore(s => s.user)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const [showDealModal, setShowDealModal] = useState(false)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [deals, setDeals]                 = useState<Deal[]>([])

  // Keyboard close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Load deals for the TaskModal deal selector
  useEffect(() => {
    if (!user) return
    supabase
      .from('deals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setDeals((data ?? []) as Deal[]))
  }, [user])

  // Write HTML body into sandboxed iframe
  useEffect(() => {
    if (!iframeRef.current || !email.body_full) return
    const doc = iframeRef.current.contentDocument
    if (!doc) return
    doc.open()
    doc.write(`
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              font-size: 14px;
              line-height: 1.6;
              color: #111827;
              margin: 0;
              padding: 16px;
              word-break: break-word;
            }
            img { max-width: 100%; height: auto; }
            a { color: #6366f1; }
            pre, code { white-space: pre-wrap; word-break: break-all; }
          </style>
        </head>
        <body>${email.body_full}</body>
      </html>
    `)
    doc.close()
  }, [email.body_full])

  const formattedDate = email.received_at
    ? new Date(email.received_at).toLocaleString(undefined, {
        weekday: 'short', year: 'numeric', month: 'short',
        day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : ''

  // Pre-fill values for quick-action modals
  const twoFromNow = new Date()
  twoFromNow.setDate(twoFromNow.getDate() + 2)
  const taskDueDate = twoFromNow.toISOString().split('T')[0]

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

        <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 z-10 flex flex-col">

          {/* Header */}
          <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <div className="flex-1 min-w-0 pr-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                {email.subject ?? '(no subject)'}
              </h2>
              <div className="mt-1.5 space-y-0.5">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-600 dark:text-gray-300">From:</span>{' '}
                  {email.from_email}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-600 dark:text-gray-300">To:</span>{' '}
                  {email.to_email}
                </p>
                {formattedDate && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">{formattedDate}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Email body */}
          <div className="flex-1 overflow-hidden">
            {email.body_full ? (
              <iframe
                ref={iframeRef}
                title="Email body"
                sandbox="allow-same-origin"
                className="w-full h-full border-0"
                style={{ minHeight: '300px' }}
              />
            ) : (
              <div className="p-6 text-sm text-gray-500 dark:text-gray-400 whitespace-pre-wrap">
                {email.body_preview ?? 'No content available.'}
              </div>
            )}
          </div>

          {/* Actions footer */}
          <div className="flex items-center gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 shrink-0 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
            <button
              onClick={() => setShowDealModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Deal
            </button>
            <button
              onClick={() => setShowTaskModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Add Follow-up Task
            </button>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Create Deal quick action - pre-filled with email subject + contact */}
      <DealModal
        isOpen={showDealModal}
        onClose={() => setShowDealModal(false)}
        onSaved={(deal, isNew) => {
          setShowDealModal(false)
          if (isNew && onDealCreated) onDealCreated(deal)
        }}
        deal={null}
        contacts={[contact]}
        defaultStage="lead"
        defaultContactId={contact.id}
        defaultName={email.subject ?? ''}
      />

      {/* Add Task quick action - pre-filled with follow-up title + contact + 2-day due date */}
      <TaskModal
        isOpen={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        onSaved={(task, isNew) => {
          setShowTaskModal(false)
          if (isNew && onTaskCreated) onTaskCreated(task)
        }}
        task={null}
        contacts={[contact]}
        deals={deals}
        defaultContactId={contact.id}
        defaultTitle={`Follow up: ${email.subject ?? 'Email'}`}
        defaultDueDate={taskDueDate}
      />
    </>
  )
}
