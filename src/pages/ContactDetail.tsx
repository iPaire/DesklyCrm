import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import type { Contact, Deal } from '../types'
import { ContactModal } from '../components/ContactModal'
import { Toast } from '../components/Toast'

type DealStage = Deal['stage']
type ToastState = { message: string; type: 'success' | 'error'; action?: { label: string; onClick: () => void } } | null

const STAGES: { value: DealStage; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'closed_won', label: 'Closed Won' },
  { value: 'closed_lost', label: 'Closed Lost' },
]

const TEMPLATES = [
  { label: 'Discovery Call', value: 0, stage: 'lead' as DealStage },
  { label: 'Proposal', value: 5000, stage: 'proposal' as DealStage },
  { label: 'Contract', value: 10000, stage: 'negotiation' as DealStage },
]

const STAGE_BADGE: Record<DealStage, string> = {
  lead: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  qualified: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  proposal: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  negotiation: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  closed_won: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  closed_lost: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
}

const STAGE_DOT: Record<DealStage, string> = {
  lead: 'bg-gray-400',
  qualified: 'bg-blue-500',
  proposal: 'bg-violet-500',
  negotiation: 'bg-amber-500',
  closed_won: 'bg-emerald-500',
  closed_lost: 'bg-red-500',
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toLocaleString()}`
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div className="w-14 h-14 rounded-full bg-primary-100 dark:bg-primary-950 flex items-center justify-center shrink-0">
      <span className="text-primary-700 dark:text-primary-300 text-lg font-semibold">{initials}</span>
    </div>
  )
}

const inputClass =
  'w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors'

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [contact, setContact] = useState<Contact | null>(null)
  const [deals, setDeals] = useState<Deal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Quick create form
  const [showForm, setShowForm] = useState(false)
  const [dealName, setDealName] = useState('')
  const [dealValue, setDealValue] = useState('')
  const [dealStage, setDealStage] = useState<DealStage>('lead')
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Edit contact modal
  const [editOpen, setEditOpen] = useState(false)

  // Toast
  const [toast, setToast] = useState<ToastState>(null)

  useEffect(() => {
    if (!id) return
    fetchData()
  }, [id])

  const fetchData = async () => {
    setIsLoading(true)
    const [contactRes, dealsRes] = await Promise.all([
      supabase.from('contacts').select('*').eq('id', id).single(),
      supabase.from('deals').select('*').eq('contact_id', id).order('created_at', { ascending: false }),
    ])

    if (contactRes.error || !contactRes.data) {
      setNotFound(true)
    } else {
      const c = contactRes.data as Contact
      setContact(c)
      setDealName(`${c.company || c.name} - Deal`)
    }

    if (!dealsRes.error && dealsRes.data) {
      setDeals(dealsRes.data as Deal[])
    }

    setIsLoading(false)
  }

  const defaultDealName = (c: Contact) => `${c.company || c.name} - Deal`

  const openForm = () => {
    if (contact) setDealName(defaultDealName(contact))
    setDealValue('')
    setDealStage('lead')
    setCreateError('')
    setShowForm(true)
  }

  const applyTemplate = (tpl: typeof TEMPLATES[number]) => {
    if (contact) setDealName(`${contact.company || contact.name} - ${tpl.label}`)
    setDealValue(String(tpl.value))
    setDealStage(tpl.stage)
    setCreateError('')
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setCreateError('')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dealName.trim()) {
      setCreateError('Deal name is required.')
      return
    }
    if (!user || !contact) return

    setCreateError('')
    setIsCreating(true)

    const { data, error } = await supabase
      .from('deals')
      .insert({
        user_id: user.id,
        contact_id: contact.id,
        name: dealName.trim(),
        value: parseFloat(dealValue) || 0,
        stage: dealStage,
      })
      .select()
      .single()

    setIsCreating(false)

    if (error) {
      setCreateError(error.message)
      return
    }

    setDeals((prev) => [data as Deal, ...prev])
    closeForm()
    setDealName(defaultDealName(contact))
    setDealValue('')
    setDealStage('lead')
    setToast({
      message: 'Deal created!',
      type: 'success',
      action: { label: 'View in pipeline', onClick: () => navigate('/deals') },
    })
  }

  const handleContactSaved = (_msg: string, saved: Contact) => {
    setContact(saved)
    setEditOpen(false)
    setToast({ message: 'Contact updated.', type: 'success' })
  }

  if (isLoading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="w-7 h-7 border-[3px] border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound || !contact) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400 mb-4">Contact not found.</p>
        <Link to="/contacts" className="text-primary-600 dark:text-primary-400 text-sm hover:underline">
          ← Back to Contacts
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">

      {/* Back */}
      <Link
        to="/contacts"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors mb-6"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Contacts
      </Link>

      {/* Contact header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={contact.name} />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{contact.name}</h1>
              {contact.company && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{contact.company}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Edit
          </button>
        </div>

        {(contact.email || contact.phone || contact.notes) && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-2">
            {contact.email && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400 dark:text-gray-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <a href={`mailto:${contact.email}`} className="text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                  {contact.email}
                </a>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400 dark:text-gray-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <a href={`tel:${contact.phone}`} className="text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                  {contact.phone}
                </a>
              </div>
            )}
            {contact.notes && (
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mt-1">{contact.notes}</p>
            )}
          </div>
        )}
      </div>

      {/* Quick Create Deal */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 mb-5 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Quick Create Deal</h2>
          {showForm ? (
            <button
              onClick={closeForm}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Close form"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <button
              onClick={openForm}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Deal
            </button>
          )}
        </div>

        {/* Templates row - always visible */}
        <div className="px-6 pb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500 mr-0.5">Templates:</span>
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.label}
              onClick={() => applyTemplate(tpl)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 dark:hover:border-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/50 transition-all"
            >
              {tpl.label}
              <span className="text-gray-300 dark:text-gray-600 ml-0.5">
                {tpl.value === 0 ? '· $0' : `· $${tpl.value >= 1000 ? `${tpl.value / 1000}k` : tpl.value}`}
              </span>
            </button>
          ))}
        </div>

        {/* Inline form */}
        {showForm && (
          <div className="px-6 pb-6 pt-2 border-t border-gray-100 dark:border-gray-800">
            <form onSubmit={handleCreate} className="space-y-4">
              {createError && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg">
                  <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Deal Name
                </label>
                <input
                  type="text"
                  value={dealName}
                  onChange={(e) => setDealName(e.target.value)}
                  placeholder="e.g. Acme Corp - Q2 Deal"
                  className={inputClass}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                    Value
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-gray-500 pointer-events-none">$</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={dealValue}
                      onChange={(e) => setDealValue(e.target.value)}
                      placeholder="0"
                      className={`${inputClass} pl-7`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                    Stage
                  </label>
                  <select
                    value={dealStage}
                    onChange={(e) => setDealStage(e.target.value as DealStage)}
                    className={inputClass}
                  >
                    {STAGES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-60 transition-colors"
                >
                  {isCreating ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Deal'
                  )}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Related Deals */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Related Deals</h2>
          {deals.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">
              {deals.length}
            </span>
          )}
        </div>

        {deals.length === 0 ? (
          <div className="py-10 flex flex-col items-center text-center px-4">
            <svg className="w-6 h-6 text-gray-300 dark:text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm text-gray-400 dark:text-gray-500">No deals yet. Create one above.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {deals.map((deal) => (
              <div key={deal.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{deal.name}</p>
                  <div className="mt-1">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_BADGE[deal.stage]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${STAGE_DOT[deal.stage]}`} />
                      {STAGES.find((s) => s.value === deal.stage)?.label}
                    </span>
                  </div>
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white shrink-0">
                  {formatCurrency(deal.value)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Contact Modal */}
      {editOpen && (
        <ContactModal
          contact={contact}
          onClose={() => setEditOpen(false)}
          onSaved={handleContactSaved}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          action={toast.action}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  )
}
