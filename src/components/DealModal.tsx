import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import type { Deal, Contact } from '../types'

const STAGE_OPTIONS: { value: Deal['stage']; label: string }[] = [
  { value: 'lead',        label: 'Lead' },
  { value: 'qualified',   label: 'Qualified' },
  { value: 'proposal',    label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'closed_won',  label: 'Closed Won' },
  { value: 'closed_lost', label: 'Closed Lost' },
]

interface Props {
  isOpen: boolean
  onClose: () => void
  onSaved: (deal: Deal, isNew: boolean) => void
  deal?: Deal | null
  contacts: Contact[]
  defaultStage?: Deal['stage']
  defaultContactId?: string
  defaultName?: string
}

export default function DealModal({ isOpen, onClose, onSaved, deal, contacts, defaultStage = 'lead', defaultContactId = '', defaultName = '' }: Props) {
  const user = useAuthStore(s => s.user)
  const [name, setName]           = useState('')
  const [value, setValue]         = useState('')
  const [stage, setStage]         = useState<Deal['stage']>(defaultStage)
  const [contactId, setContactId] = useState('')
  const [error, setError]         = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (deal) {
      setName(deal.name)
      setValue(deal.value ? String(deal.value) : '')
      setStage(deal.stage)
      setContactId(deal.contact_id ?? '')
    } else {
      setName(defaultName)
      setValue('')
      setStage(defaultStage)
      setContactId(defaultContactId)
    }
    setError('')
  }, [isOpen, deal, defaultStage, defaultContactId, defaultName])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isLoading) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, isLoading, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Deal name is required.'); return }
    if (!user) return
    setError('')
    setIsLoading(true)

    const payload = {
      name:       name.trim(),
      value:      parseFloat(value) || 0,
      stage,
      contact_id: contactId || null,
    }

    if (deal) {
      const { data, error: err } = await supabase
        .from('deals').update(payload).eq('id', deal.id).select().single()
      if (err) { setError(err.message); setIsLoading(false); return }
      if (data) { onSaved(data as Deal, false); onClose() }
    } else {
      const { data, error: err } = await supabase
        .from('deals').insert({ ...payload, user_id: user.id }).select().single()
      if (err) { setError(err.message); setIsLoading(false); return }
      if (data) { onSaved(data as Deal, true); onClose() }
    }

    setIsLoading(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={!isLoading ? onClose : undefined} />

      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {deal ? 'Edit Deal' : 'New Deal'}
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

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Deal Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text" required autoFocus
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Enterprise License"
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
            />
          </div>

          {/* Value */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Value <span className="text-gray-400 dark:text-gray-500 font-normal">(USD)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-gray-500 font-medium">$</span>
              <input
                type="number" min="0" step="0.01"
                value={value} onChange={e => setValue(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              />
            </div>
          </div>

          {/* Stage */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Stage</label>
            <select
              value={stage} onChange={e => setStage(e.target.value as Deal['stage'])}
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
            >
              {STAGE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Contact */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Contact</label>
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
              {deal
                ? (isLoading ? 'Saving...'   : 'Save Changes')
                : (isLoading ? 'Creating...' : 'Create Deal')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
