import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import type { Contact } from '../types'
import { getUserAutomations, isEnabled, runContactReachOutTask } from '../lib/automations'
import { getColumnDefs, type CustomColumnDef } from '../lib/contactColumns'

interface FormData {
  name: string
  email: string
  phone: string
  company: string
  notes: string
  customFields: Record<string, string>
}

interface ContactModalProps {
  contact: Contact | null
  onClose: () => void
  onSaved: (message: string, contact: Contact) => void
}

const inputClass =
  'w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors'

export function ContactModal({ contact, onClose, onSaved }: ContactModalProps) {
  const user = useAuthStore((s) => s.user)
  const isEditing = contact !== null

  const [customColumns, setCustomColumns] = useState<CustomColumnDef[]>([])

  const [form, setForm] = useState<FormData>(() =>
    contact
      ? {
          name: contact.name,
          email: contact.email ?? '',
          phone: contact.phone ?? '',
          company: contact.company ?? '',
          notes: contact.notes ?? '',
          customFields: { ...(contact.custom_fields ?? {}) },
        }
      : { name: '', email: '', phone: '', company: '', notes: '', customFields: {} },
  )

  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Load custom column definitions
  useEffect(() => {
    if (user) getColumnDefs(user.id).then(setCustomColumns)
  }, [user])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const set =
    (field: keyof Omit<FormData, 'customFields'>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))

  const setCustomField = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, customFields: { ...f.customFields, [key]: e.target.value } }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required.'); return }
    const emailTrimmed = form.email.trim()
    if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setError('Please enter a valid email address.')
      return
    }
    if (!user) return

    setError('')
    setIsLoading(true)

    // Build custom_fields - only keep non-empty values
    const custom_fields: Record<string, string> = {}
    for (const [k, v] of Object.entries(form.customFields)) {
      if (v.trim()) custom_fields[k] = v.trim()
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      company: form.company.trim() || null,
      notes: form.notes.trim() || null,
      custom_fields,
    }

    if (isEditing) {
      const { data, error: dbError } = await supabase
        .from('contacts')
        .update(payload)
        .eq('id', contact.id)
        .select()
        .single()
      if (dbError) { setError(dbError.message); setIsLoading(false); return }
      onSaved('Contact updated successfully.', data as Contact)
    } else {
      const { data, error: dbError } = await supabase
        .from('contacts')
        .insert({ ...payload, user_id: user.id })
        .select()
        .single()
      if (dbError) { setError(dbError.message); setIsLoading(false); return }
      const newContact = data as Contact
      onSaved('Contact added successfully.', newContact)

      // Automation: contact_reach_out_task
      const automations = await getUserAutomations(user.id)
      if (isEnabled(automations, 'contact_reach_out_task')) {
        await runContactReachOutTask(newContact, user.id)
      }
    }

    setIsLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={!isLoading ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {isEditing ? 'Edit Contact' : 'Add Contact'}
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg">
              <svg className="w-4 h-4 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-10.5a.75.75 0 011.5 0v4a.75.75 0 01-1.5 0v-4zm.75 7a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder="Full name"
              autoFocus
              className={inputClass}
            />
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="email@example.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={set('phone')}
                placeholder="+1 234 567 890"
                className={inputClass}
              />
            </div>
          </div>

          {/* Company */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Company</label>
            <input
              type="text"
              value={form.company}
              onChange={set('company')}
              placeholder="Company name"
              className={inputClass}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              placeholder="Any additional notes..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Custom fields */}
          {customColumns.length > 0 && (
            <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3 mt-1">
                Custom Fields
              </p>
              <div className="space-y-3">
                {customColumns.map((col) => (
                  <div key={col.key}>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      {col.label}
                    </label>
                    <input
                      type="text"
                      value={form.customFields[col.key] ?? ''}
                      onChange={setCustomField(col.key)}
                      placeholder={col.label}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isLoading && (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {isLoading ? 'Saving...' : isEditing ? 'Save changes' : 'Add contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
