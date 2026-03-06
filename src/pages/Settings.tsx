import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { useBillingStore, selectIsSubscribed } from '../store/billingStore'
import { inviteMember, removeMember, startStripeCheckout } from '../lib/billing'
import { Toast } from '../components/Toast'
import { GmailSettingsPanel } from '../components/GmailSettingsPanel'
import { AutomationsPanel } from '../components/AutomationsPanel'
import {
  MAX_CUSTOM_COLS,
  getColumnDefs,
  saveColumnDefs,
  labelToKey,
  generateKey,
} from '../lib/contactColumns'

// ─── CSV parser ────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i += 2; continue }
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim()); current = ''
    } else {
      current += ch
    }
    i++
  }
  result.push(current.trim())
  return result
}

interface ParsedCSV { headers: string[]; rows: Record<string, string>[] }

function parseCSV(text: string): ParsedCSV {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = parseCSVLine(lines[0])
  const rows = lines.slice(1)
    .map(line => {
      const vals = parseCSVLine(line)
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
      return row
    })
    .filter(r => Object.values(r).some(v => v.trim()))
  return { headers, rows }
}

const FIELD_ALIASES: Record<string, string[]> = {
  name:    ['name', 'full name', 'fullname', 'contact name', 'full_name', 'contact_name', 'firstname', 'first name', 'display name'],
  email:   ['email', 'email address', 'e-mail', 'email_address', 'emailaddress', 'mail'],
  phone:   ['phone', 'phone number', 'mobile', 'cell', 'telephone', 'phone_number', 'mobile_phone', 'work phone'],
  company: ['company', 'organization', 'company name', 'account', 'firm', 'employer', 'company_name', 'account name'],
  notes:   ['notes', 'note', 'description', 'comments', 'comment', 'bio', 'about', 'memo'],
}

function autoDetect(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  const norm = headers.map(h => h.toLowerCase().trim())
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = norm.findIndex(h => aliases.includes(h))
    if (idx !== -1) mapping[field] = headers[idx]
  }
  return mapping
}

// ─── Shared section card ──────────────────────────────────────────────────────

function SectionCard({
  icon, title, children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400">
          {icon}
        </div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ─── Import section ───────────────────────────────────────────────────────────

const IMPORT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: 'name',    label: 'Name',    required: true },
  { key: 'email',   label: 'Email' },
  { key: 'phone',   label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'notes',   label: 'Notes' },
]

type ImportStatus = 'idle' | 'importing' | 'done'

interface CustomImportField {
  csvCol: string   // CSV column header
  label: string    // display / column def label
  enabled: boolean
}

function ImportContactsPanel({ onToast }: { onToast: (m: string, t: 'success' | 'error') => void }) {
  const user = useAuthStore(s => s.user)
  const fileRef = useRef<HTMLInputElement>(null)
  const [file,    setFile]    = useState<File | null>(null)
  const [parsed,  setParsed]  = useState<ParsedCSV | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [customFields, setCustomFields] = useState<CustomImportField[]>([])
  const [dragging, setDragging] = useState(false)
  const [status,  setStatus]  = useState<ImportStatus>('idle')
  const [count,   setCount]   = useState(0)
  const [error,   setError]   = useState('')

  // How many custom fields are currently enabled
  const enabledCustomCount = useMemo(
    () => customFields.filter(f => f.enabled).length,
    [customFields],
  )

  const load = (f: File) => {
    if (!f.name.match(/\.(csv|txt)$/i)) { setError('Please upload a .csv file.'); return }
    setFile(f)
    setError('')
    const reader = new FileReader()
    reader.onload = e => {
      const csv = parseCSV(e.target?.result as string)
      if (csv.headers.length === 0) { setError('Could not parse CSV - check the file format.'); return }
      const detected = autoDetect(csv.headers)
      const usedCols = new Set(Object.values(detected))
      // Extra columns not auto-mapped to standard fields
      const extras: CustomImportField[] = csv.headers
        .filter(h => !usedCols.has(h))
        .map(h => ({ csvCol: h, label: h, enabled: false }))
      setParsed(csv)
      setMapping(detected)
      setCustomFields(extras)
      setStatus('idle')
      setCount(0)
    }
    reader.readAsText(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) load(f)
  }

  const toggleCustomField = (csvCol: string) => {
    setCustomFields(prev => prev.map(f => {
      if (f.csvCol !== csvCol) return f
      // Can only enable up to MAX_CUSTOM_COLS
      if (!f.enabled && enabledCustomCount >= MAX_CUSTOM_COLS) return f
      return { ...f, enabled: !f.enabled }
    }))
  }

  const updateCustomLabel = (csvCol: string, label: string) => {
    setCustomFields(prev => prev.map(f => f.csvCol === csvCol ? { ...f, label } : f))
  }

  const runImport = async () => {
    if (!parsed || !user) return
    if (!mapping.name) { setError('The "Name" column is required.'); return }
    setStatus('importing'); setError('')

    const enabledExtra = customFields.filter(f => f.enabled)

    const records = parsed.rows
      .map(row => {
        const custom_fields: Record<string, string> = {}
        for (const cf of enabledExtra) {
          const val = row[cf.csvCol]?.trim()
          if (val) custom_fields[labelToKey(cf.label)] = val
        }
        return {
          user_id: user.id,
          name:    row[mapping.name]?.trim()    || '',
          email:   mapping.email   ? (row[mapping.email]?.trim()   || null) : null,
          phone:   mapping.phone   ? (row[mapping.phone]?.trim()   || null) : null,
          company: mapping.company ? (row[mapping.company]?.trim() || null) : null,
          notes:   mapping.notes   ? (row[mapping.notes]?.trim()   || null) : null,
          custom_fields: Object.keys(custom_fields).length > 0 ? custom_fields : {},
        }
      })
      .filter(r => r.name)

    let imported = 0
    const CHUNK = 50
    for (let i = 0; i < records.length; i += CHUNK) {
      const { error: err } = await supabase.from('contacts').insert(records.slice(i, i + CHUNK))
      if (err) { setError(err.message); setStatus('idle'); return }
      imported += Math.min(CHUNK, records.length - i)
    }

    // Auto-update column defs in localStorage so custom columns appear in the table
    if (enabledExtra.length > 0) {
      const existingDefs = getColumnDefs(user.id)
      const existingKeys = existingDefs.map(d => d.key)
      let updatedDefs = [...existingDefs]
      for (const cf of enabledExtra) {
        if (updatedDefs.length >= MAX_CUSTOM_COLS) break
        const key = generateKey(cf.label, updatedDefs.map(d => d.key))
        if (!existingKeys.includes(labelToKey(cf.label))) {
          updatedDefs.push({ key, label: cf.label })
        }
      }
      saveColumnDefs(user.id, updatedDefs)
    }

    setCount(imported)
    setStatus('done')
    onToast(`Imported ${imported} contact${imported !== 1 ? 's' : ''}!`, 'success')
    setTimeout(reset, 4000)
  }

  const reset = () => {
    setFile(null); setParsed(null); setMapping({})
    setCustomFields([])
    setStatus('idle'); setCount(0); setError('')
  }

  // ── Done state ──
  if (status === 'done') {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950 rounded-full flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {count} contact{count !== 1 ? 's' : ''} imported
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">You can find them in the Contacts page.</p>
        <button onClick={reset} className="mt-4 text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">
          Import another file
        </button>
      </div>
    )
  }

  // ── Preview + mapping ──
  if (parsed) {
    const preview = parsed.rows.slice(0, 3)
    const hasName = !!mapping.name
    const allMappedCols = new Set(Object.values(mapping).filter(Boolean))
    const previewCols = [
      ...IMPORT_FIELDS.filter(f => mapping[f.key]),
      ...customFields.filter(f => f.enabled).map(f => ({ key: f.csvCol, label: f.label })),
    ]

    return (
      <div className="space-y-4">
        {/* File banner */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{file?.name}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              · {parsed.rows.length} row{parsed.rows.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            Change
          </button>
        </div>

        {/* Standard column mapping */}
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Standard fields
          </p>
          <div className="space-y-1.5">
            {IMPORT_FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="w-20 text-xs text-gray-600 dark:text-gray-400 shrink-0">
                  {f.label}
                  {f.required && <span className="text-red-500 ml-0.5">*</span>}
                </span>
                <select
                  value={mapping[f.key] ?? ''}
                  onChange={e => {
                    const newVal = e.target.value
                    setMapping(prev => ({ ...prev, [f.key]: newVal }))
                    // Update customFields: remove newly mapped col, add back old one
                    setCustomFields(prev => {
                      const oldVal = mapping[f.key]
                      let next = prev.filter(cf => cf.csvCol !== newVal)
                      if (oldVal && !Object.values({ ...mapping, [f.key]: newVal }).includes(oldVal)) {
                        next = [...next, { csvCol: oldVal, label: oldVal, enabled: false }]
                      }
                      return next
                    })
                  }}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                >
                  <option value="">- skip -</option>
                  {parsed.headers.map(h => (
                    <option key={h} value={h} disabled={allMappedCols.has(h) && mapping[f.key] !== h}>{h}</option>
                  ))}
                </select>
                {mapping[f.key] && (
                  <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Extra columns → custom fields */}
        {customFields.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Extra columns → custom fields
              </p>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {enabledCustomCount}/{MAX_CUSTOM_COLS} selected
              </span>
            </div>
            <div className="space-y-1.5">
              {customFields.map(cf => (
                <div key={cf.csvCol} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cf.enabled}
                    onChange={() => toggleCustomField(cf.csvCol)}
                    disabled={!cf.enabled && enabledCustomCount >= MAX_CUSTOM_COLS}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer disabled:opacity-40"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-24 shrink-0 truncate" title={cf.csvCol}>
                    {cf.csvCol}
                  </span>
                  {cf.enabled ? (
                    <input
                      type="text"
                      value={cf.label}
                      onChange={e => updateCustomLabel(cf.csvCol, e.target.value)}
                      placeholder="Column label"
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
                    />
                  ) : (
                    <span className="flex-1 text-xs text-gray-400 dark:text-gray-600 italic">
                      {enabledCustomCount >= MAX_CUSTOM_COLS ? 'limit reached' : 'not imported'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preview rows */}
        {preview.length > 0 && mapping.name && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Preview ({Math.min(3, parsed.rows.length)} of {parsed.rows.length})
            </p>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {previewCols.map(f => (
                        <th key={f.key} className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {preview.map((row, i) => (
                      <tr key={i}>
                        {IMPORT_FIELDS.filter(f => mapping[f.key]).map(f => (
                          <td key={f.key} className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
                            {row[mapping[f.key]] || <span className="text-gray-300 dark:text-gray-600">-</span>}
                          </td>
                        ))}
                        {customFields.filter(f => f.enabled).map(cf => (
                          <td key={cf.csvCol} className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
                            {row[cf.csvCol] || <span className="text-gray-300 dark:text-gray-600">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
        )}

        <button
          onClick={runImport}
          disabled={!hasName || status === 'importing'}
          className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {status === 'importing' && (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {status === 'importing'
            ? 'Importing…'
            : `Import ${parsed.rows.length} Contact${parsed.rows.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    )
  }

  // ── Drop zone ──
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Upload a CSV exported from HubSpot, Salesforce, Pipedrive, or any CRM.
        We'll auto-detect standard fields and let you import all other columns too.
      </p>

      <label
        className={`
          flex flex-col items-center justify-center gap-2 w-full h-32 rounded-xl
          border-2 border-dashed cursor-pointer transition-all duration-150
          ${dragging
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30 scale-[1.01]'
            : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
          }
        `}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileRef} type="file" accept=".csv,.txt"
          className="sr-only"
          onChange={e => { if (e.target.files?.[0]) load(e.target.files[0]) }}
        />
        <svg className={`w-8 h-8 transition-colors ${dragging ? 'text-primary-500' : 'text-gray-300 dark:text-gray-600'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Drop your CSV here, or{' '}
            <span className="text-primary-600 dark:text-primary-400">browse</span>
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Contacts CSV - max 10,000 rows</p>
        </div>
      </label>

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

      {/* Format hints */}
      <div className="grid grid-cols-3 gap-2">
        {['HubSpot', 'Salesforce', 'Pipedrive'].map(crm => (
          <div key={crm} className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-xs text-gray-600 dark:text-gray-400">{crm}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Settings page ────────────────────────────────────────────────────────

export default function Settings() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const user    = useAuthStore(s => s.user)
  const signOut = useAuthStore(s => s.signOut)
  const { team, members, trialInfo, fetchBilling, setMembers } = useBillingStore()
  const subscribed = useBillingStore(selectIsSubscribed)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  // Load billing data
  useEffect(() => {
    if (user) fetchBilling(user.id)
  }, [user, fetchBilling])

  // Handle redirects
  useEffect(() => {
    if (searchParams.get('gmail') === 'connected') {
      setToast({ message: 'Gmail connected! Click "Sync Now" to import emails.', type: 'success' })
      navigate('/settings', { replace: true })
    }
    if (searchParams.get('billing') === 'success') {
      setToast({ message: 'Subscription activated! Welcome to Pro.', type: 'success' })
      navigate('/settings', { replace: true })
      if (user) fetchBilling(user.id)
    }
    if (searchParams.get('billing') === 'canceled') {
      setToast({ message: 'Checkout canceled - your trial is still active.', type: 'error' })
      navigate('/settings', { replace: true })
    }
  }, [searchParams, navigate, user, fetchBilling])

  const initials = user?.email?.[0].toUpperCase() ?? 'U'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const handleUpgrade = async () => {
    setUpgradeLoading(true)
    const { url, error } = await startStripeCheckout()
    if (error || !url) {
      setToast({ message: error ?? 'Could not start checkout. Try again.', type: 'error' })
      setUpgradeLoading(false)
      return
    }
    window.location.href = url
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!team) return
    setInviteLoading(true)
    const { member, error } = await inviteMember(team.id, inviteEmail)
    if (error) {
      setToast({ message: error.message, type: 'error' })
    } else if (member) {
      setMembers([...members, member])
      setInviteEmail('')
      setToast({
        message: `Invite sent to ${member.email} - share the link: ${window.location.origin}/invite/${member.invite_token}`,
        type: 'success',
      })
    }
    setInviteLoading(false)
  }

  const handleRemoveMember = async (memberId: string) => {
    setRemovingId(memberId)
    const { error } = await removeMember(memberId)
    if (error) {
      setToast({ message: error.message, type: 'error' })
    } else {
      setMembers(members.filter(m => m.id !== memberId))
    }
    setRemovingId(null)
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-5">

      {/* Page heading */}
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Manage your account, billing, and data.
        </p>
      </div>

      {/* ── Account ── */}
      <SectionCard
        title="Account"
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        }
      >
        {/* User info */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-full bg-primary-100 dark:bg-primary-950 flex items-center justify-center shrink-0">
            <span className="text-primary-700 dark:text-primary-300 text-base font-bold">{initials}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user?.email}</p>
            {subscribed ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-full mt-0.5">
                Pro
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded-full mt-0.5">
                Free Trial {trialInfo ? `· ${trialInfo.daysRemaining}d left` : ''}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {/* Change password */}
          <button
            onClick={() => alert('Coming soon - password change will be available in a future update.')}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded-xl transition-colors group"
          >
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Change Password</span>
            </div>
            <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="text-sm font-semibold">Sign Out</span>
          </button>
        </div>
      </SectionCard>

      {/* ── Billing ── */}
      <SectionCard
        title="Billing"
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        }
      >
        {subscribed ? (
          /* ── Pro plan ── */
          <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 border border-emerald-100 dark:border-emerald-900/50 p-4 mb-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Current Plan</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">Deskly Pro</p>
              </div>
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full">
                Active
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {team?.seats ?? 1} seat{(team?.seats ?? 1) > 1 ? 's' : ''} · ${(team?.seats ?? 1) * 10}/month
            </p>
            <ul className="mt-3 space-y-1">
              {['Unlimited contacts', 'Kanban deal pipeline', 'Task management', 'Team collaboration', 'Gmail sync & automations'].map(f => (
                <li key={f} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          /* ── Trial / upgrade ── */
          <div className="rounded-xl bg-gradient-to-br from-primary-50 to-violet-50 dark:from-primary-950/40 dark:to-violet-950/30 border border-primary-100 dark:border-primary-900/50 p-4 mb-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wide">Current Plan</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">Free Trial</p>
              </div>
              {trialInfo && (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  trialInfo.isExpired
                    ? 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-950/60'
                    : trialInfo.daysRemaining <= 3
                      ? 'text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-950/60'
                      : 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60'
                }`}>
                  {trialInfo.isExpired ? 'Expired' : `${trialInfo.daysRemaining} day${trialInfo.daysRemaining !== 1 ? 's' : ''} left`}
                </span>
              )}
            </div>

            {trialInfo && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span>Day {trialInfo.daysElapsed} of {trialInfo.totalDays}</span>
                  <span>{trialInfo.isExpired ? 'Trial ended' : 'Trial active'}</span>
                </div>
                <div className="h-1.5 bg-white/60 dark:bg-gray-900/40 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${trialInfo.isExpired ? 'bg-red-500' : 'bg-primary-500'}`}
                    style={{ width: `${trialInfo.progress}%` }}
                  />
                </div>
              </div>
            )}

            <ul className="space-y-1">
              {['Unlimited contacts', 'Kanban deal pipeline', 'Task management', 'Gmail sync & automations'].map(f => (
                <li key={f} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!subscribed && (
          <button
            onClick={handleUpgrade}
            disabled={upgradeLoading}
            className="w-full py-2.5 bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {upgradeLoading && (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {upgradeLoading ? 'Redirecting…' : 'Upgrade to Pro - $10/user/month →'}
          </button>
        )}
      </SectionCard>

      {/* ── Team ── */}
      <SectionCard
        title="Team"
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4a4 4 0 11-8 0 4 4 0 018 0zm6 4a2 2 0 100-4 2 2 0 000 4zM3 20a2 2 0 100-4 2 2 0 000 4z" />
          </svg>
        }
      >
        {/* Member list */}
        <div className="space-y-2 mb-4">
          {members.map(m => {
            const isOwner = m.role === 'owner'
            const memberInitial = m.email[0].toUpperCase()
            return (
              <div key={m.id} className="flex items-center gap-3 px-3 py-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-950 flex items-center justify-center shrink-0">
                  <span className="text-primary-700 dark:text-primary-300 text-xs font-bold">{memberInitial}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.email}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{isOwner ? 'Owner' : 'Member'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {m.status === 'pending' ? (
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-full">
                      Pending
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                  {!isOwner && (
                    <button
                      onClick={() => handleRemoveMember(m.id)}
                      disabled={removingId === m.id}
                      className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-40"
                      title="Remove member"
                    >
                      {removingId === m.id ? (
                        <span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin inline-block" />
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Pricing hint */}
        {subscribed && team && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 text-center">
            {members.filter(m => m.status === 'active').length} active seat{members.filter(m => m.status === 'active').length !== 1 ? 's' : ''} · $10/seat/month
          </p>
        )}

        {/* Invite form */}
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="teammate@example.com"
            className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
          />
          <button
            type="submit"
            disabled={inviteLoading}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60 flex items-center gap-1.5"
          >
            {inviteLoading ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
            Invite
          </button>
        </form>

        {/* Invite link explanation */}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
          An invite link will be shown - share it with your teammate.
        </p>
      </SectionCard>

      {/* ── Automations ── */}
      <SectionCard
        title="Automations"
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
      >
        <div className="mb-5">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Pre-built Automations</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Toggle automations on or off. Enabled automations run automatically when triggered.
          </p>
        </div>
        <AutomationsPanel onToast={(m, t) => setToast({ message: m, type: t })} />
      </SectionCard>

      {/* ── Gmail Integration ── */}
      <SectionCard
        title="Gmail Integration"
        icon={
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
      >
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Sync Gmail Emails</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Automatically sync emails with your CRM contacts and track communication history.
          </p>
        </div>
        <GmailSettingsPanel onToast={(m, t) => setToast({ message: m, type: t })} />
      </SectionCard>

      {/* ── Import Data ── */}
      <SectionCard
        title="Import Data"
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        }
      >
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Import Contacts</span>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">CSV</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Migrate your contacts from any CRM in seconds.
          </p>
        </div>

        <ImportContactsPanel onToast={(m, t) => setToast({ message: m, type: t })} />

        {/* Import deals - placeholder */}
        <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Import Deals</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">CSV import for your deal pipeline.</p>
            </div>
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-lg">
              Coming soon
            </span>
          </div>
        </div>
      </SectionCard>

      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  )
}
