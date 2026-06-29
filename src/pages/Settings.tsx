import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { useBillingStore, selectIsSubscribed } from '../store/billingStore'
import {
  inviteMember,
  removeMember,
  resendInvite,
  cancelInvite,
  startStripeCheckout,
  verifyCheckoutSession,
  syncSubscriptionQuantity,
  getStripePortalUrl,
  findUserIdByEmail,
  getMemberActivity,
  activateMemberSeat,
  getFreshToken,
  getTrialInfo,
  type TeamActivityLog,
} from '../lib/billing'
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

// ─── CSV parser (unchanged) ────────────────────────────────────────────────────

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
  name:    ['name', 'full name', 'fullname', 'contact name', 'full_name', 'contact_name', 'firstname', 'first name', 'display name', 'person name'],
  email:   ['email', 'email address', 'e-mail', 'email_address', 'emailaddress', 'mail', 'primary email',
            'email - work', 'email - home', 'email - other', 'email - primary'],
  phone:   ['phone', 'phone number', 'mobile', 'cell', 'telephone', 'phone_number', 'mobile_phone', 'work phone',
            'phone - work', 'phone - mobile', 'phone - home', 'phone - other', 'mobile phone'],
  company: ['company', 'organization', 'company name', 'account', 'firm', 'employer', 'company_name', 'account name'],
  notes:   ['notes', 'note', 'description', 'comments', 'comment', 'bio', 'about', 'memo'],
}

const LAST_NAME_ALIASES = ['last name', 'lastname', 'last_name', 'surname', 'family name']

function autoDetect(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  const norm = headers.map(h => h.toLowerCase().trim())
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = norm.findIndex(h => aliases.includes(h))
    if (idx !== -1) mapping[field] = headers[idx]
  }
  // Pipedrive / HubSpot: separate Last Name column - combine with first name at import time
  const lastIdx = norm.findIndex(h => LAST_NAME_ALIASES.includes(h))
  if (lastIdx !== -1 && mapping.name) {
    mapping._lastName = headers[lastIdx]
  }
  return mapping
}

// ─── Premium Section Card (redesigned) ─────────────────────────────────────────

function SectionCard({
  icon,
  title,
  children,
  className = '',
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden ${className}`}>
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-gray-50/50 to-white dark:from-gray-900/50 dark:to-gray-900">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 dark:from-primary-900/30 dark:to-primary-800/20 flex items-center justify-center text-primary-600 dark:text-primary-400 shadow-sm">
          {icon}
        </div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

// ─── Dashboard mode section ───────────────────────────────────────────────────

type DashMode = 'simple' | 'advanced'
function DashboardModeSection() {
  const [mode, setModeState] = useState<DashMode>(() =>
    (localStorage.getItem('deskly-dashboard-mode') as DashMode) || 'simple'
  )
  const setMode = (m: DashMode) => {
    setModeState(m)
    localStorage.setItem('deskly-dashboard-mode', m)
  }
  return (
    <div>
      <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">Dashboard layout</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
        Choose between a quick-glance simple view or the full advanced dashboard with charts and analytics.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {([
          { key: 'simple' as const,   title: 'Simple',   desc: 'Clean stats, task list, pipeline overview. Best for a quick daily check-in.', icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 10h16M4 14h8"/></svg>
          )},
          { key: 'advanced' as const, title: 'Advanced', desc: 'Full charts, sparklines, heatmap, funnel, and all analytics panels.', icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
          )},
        ] as const).map(opt => (
          <button
            key={opt.key}
            onClick={() => setMode(opt.key)}
            className={`relative text-left p-4 rounded-xl border-2 transition-all ${
              mode === opt.key
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-900'
            }`}
          >
            {mode === opt.key && (
              <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
              </div>
            )}
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${mode === opt.key ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
              {opt.icon}
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{opt.title}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{opt.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Helper: Feature list with check icons ────────────────────────────────────

const FeatureList = ({ features }: { features: string[] }) => (
  <ul className="space-y-2 mt-4">
    {features.map(f => (
      <li key={f} className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200">
        <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </span>
        {f}
      </li>
    ))}
  </ul>
)

// ─── Helper: Member Row (redesigned) ──────────────────────────────────────────

const MemberRow = ({
  member,
  isCurrentUser,
  trialExpired,
  onRemove,
  onResend,
  onCancel,
  onCopyLink,
  onViewActivity,
  onActivateSeat,
  isRemoving,
  isResending,
  recentlyResent,
  showLeave,
  showRemove,
  showResend,
  showCancel,
  showCopyLink,
  showActivity,
  showActivateSeat,
  isActivating,
}: {
  member: any
  isCurrentUser: boolean
  trialExpired?: boolean
  onRemove: () => void
  onResend: () => void
  onCancel: () => void
  onCopyLink?: () => void
  onViewActivity?: () => void
  onActivateSeat?: () => void
  isRemoving: boolean
  isResending: boolean
  recentlyResent: boolean
  showLeave: boolean
  showRemove: boolean
  showResend: boolean
  showCancel: boolean
  showCopyLink?: boolean
  showActivity?: boolean
  showActivateSeat?: boolean
  isActivating?: boolean
}) => {
  const isOwnerRow = member.role === 'owner'
  const initial = member.email[0].toUpperCase()
  const statusColor = member.status === 'active'
    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
    : member.status === 'denied'
    ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
    : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'

  return (
    <div className="flex items-center gap-4 p-3 bg-gray-50/80 dark:bg-gray-800/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 dark:from-primary-600 dark:to-primary-800 flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{member.email}</p>
          {isCurrentUser && (
            <span className="text-xs text-gray-400 dark:text-gray-500">(you)</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">{isOwnerRow ? 'Owner' : 'Member'}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
            {member.status === 'active' ? 'Active' : member.status === 'denied' ? 'Denied' : 'Pending'}
          </span>
          {!isOwnerRow && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              member.has_paid_seat
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                : trialExpired
                  ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                  : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
            }`}>
              {member.has_paid_seat ? 'Pro' : trialExpired ? 'Trial ended' : 'Trial'}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {showActivity && (
          <button
            onClick={onViewActivity}
            className="p-2 text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors"
            title="View activity"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </button>
        )}
        {showActivateSeat && (
          <button
            onClick={onActivateSeat}
            disabled={isActivating}
            className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
            title="Activate paid seat for this member"
          >
            {isActivating ? (
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {isActivating ? '…' : 'Activate'}
          </button>
        )}
        {showLeave && (
          <button
            onClick={onRemove}
            disabled={isRemoving}
            className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors disabled:opacity-40"
          >
            {isRemoving ? (
              <span className="block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : 'Leave team'}
          </button>
        )}
        {showCopyLink && (
          <button
            onClick={onCopyLink}
            className="p-2 text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors"
            title="Copy invite link"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        )}
        {showResend && (
          <button
            onClick={onResend}
            disabled={isResending || recentlyResent}
            className="p-2 text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors disabled:opacity-40"
            title={recentlyResent ? 'Link deja trimis' : 'Resend invite'}
          >
            {isResending ? (
              <span className="block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : recentlyResent ? (
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </button>
        )}
        {(showRemove || showCancel) && (
          <button
            onClick={showCancel ? onCancel : onRemove}
            disabled={isRemoving}
            className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-40"
            title={showCancel ? 'Cancel invite' : 'Remove member'}
          >
            {isRemoving ? (
              <span className="block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Progress Bar (for trial) ─────────────────────────────────────────────────

const ProgressBar = ({ value, status }: { value: number; status: 'expired' | 'warning' | 'normal' }) => {
  const colorClass = {
    expired: 'from-red-400 to-red-500',
    warning: 'from-orange-400 to-amber-500',
    normal: 'from-primary-400 to-violet-500',
  }[status]

  return (
    <div className="h-2.5 bg-white/60 dark:bg-gray-900/40 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${colorClass} transition-all duration-500`}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

// ─── Member Activity Modal ─────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  created:       'Created',
  updated:       'Updated',
  deleted:       'Deleted',
  completed:     'Completed',
  stage_changed: 'Moved stage',
}

const ENTITY_LABELS: Record<string, string> = {
  contact: 'contact',
  deal:    'deal',
  task:    'task',
}

const ACTION_COLORS: Record<string, string> = {
  created:       'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  updated:       'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  deleted:       'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  completed:     'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300',
  stage_changed: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
}

function MemberActivityModal({
  member,
  teamId,
  onClose,
}: {
  member: { email: string; user_id: string | null }
  teamId: string
  onClose: () => void
}) {
  const [logs,    setLogs]    = useState<TeamActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!member.user_id) { setLoading(false); return }
    getMemberActivity(teamId, member.user_id).then(({ logs: l }) => {
      setLogs(l)
      setLoading(false)
    })
  }, [teamId, member.user_id])

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Activity log</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{member.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <span className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-400 dark:text-gray-500">No activity recorded yet.</p>
            </div>
          ) : (
            logs.map(log => (
              <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                <div className="shrink-0 mt-0.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ACTION_COLORS[log.action] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">{log.entity_name ?? '-'}</span>
                    <span className="text-gray-400 dark:text-gray-500"> · {ENTITY_LABELS[log.entity_type] ?? log.entity_type}</span>
                  </p>
                  {log.action === 'stage_changed' && log.details && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {String(log.details.from)} → {String(log.details.to)}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatTime(log.created_at)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Import Contacts Panel (redesigned UI, logic untouched) ───────────────────

const IMPORT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: 'name',    label: 'Name',    required: true },
  { key: 'email',   label: 'Email' },
  { key: 'phone',   label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'notes',   label: 'Notes' },
]

type ImportStatus = 'idle' | 'importing' | 'done'

interface CustomImportField {
  csvCol: string
  label: string
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
      const usedCols = new Set(Object.values(detected).filter(Boolean))
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
        const firstName = row[mapping.name]?.trim() || ''
        const lastName  = mapping._lastName ? (row[mapping._lastName]?.trim() || '') : ''
        const fullName  = [firstName, lastName].filter(Boolean).join(' ')
        return {
          user_id: user.id,
          name:    fullName,
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

    if (enabledExtra.length > 0) {
      const existingDefs = await getColumnDefs(user.id)
      const existingKeys = existingDefs.map(d => d.key)
      let updatedDefs = [...existingDefs]
      for (const cf of enabledExtra) {
        if (updatedDefs.length >= MAX_CUSTOM_COLS) break
        const key = generateKey(cf.label, updatedDefs.map(d => d.key))
        if (!existingKeys.includes(labelToKey(cf.label))) {
          updatedDefs.push({ key, label: cf.label })
        }
      }
      await saveColumnDefs(user.id, updatedDefs)
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

  if (status === 'done') {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-base font-semibold text-gray-900 dark:text-white">
          {count} contact{count !== 1 ? 's' : ''} imported
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">You can find them in the Contacts page.</p>
        <button onClick={reset} className="mt-4 text-sm text-primary-600 dark:text-primary-400 hover:underline font-medium">
          Import another file
        </button>
      </div>
    )
  }

  if (parsed) {
    const preview = parsed.rows.slice(0, 3)
    const hasName = !!mapping.name
    const allMappedCols = new Set(Object.values(mapping).filter(Boolean))
    const previewCols = [
      ...IMPORT_FIELDS.filter(f => mapping[f.key]),
      ...customFields.filter(f => f.enabled).map(f => ({ key: f.csvCol, label: f.label })),
    ]

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{file?.name}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              · {parsed.rows.length} row{parsed.rows.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            Change
          </button>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Standard fields</h4>
          <div className="space-y-3">
            {IMPORT_FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="w-20 text-sm text-gray-600 dark:text-gray-400 shrink-0">
                  {f.label}
                  {f.required && <span className="text-red-500 ml-0.5">*</span>}
                </span>
                <select
                  value={mapping[f.key] ?? ''}
                  onChange={e => {
                    const newVal = e.target.value
                    setMapping(prev => ({ ...prev, [f.key]: newVal }))
                    setCustomFields(prev => {
                      const oldVal = mapping[f.key]
                      let next = prev.filter(cf => cf.csvCol !== newVal)
                      if (oldVal && !Object.values({ ...mapping, [f.key]: newVal }).includes(oldVal)) {
                        next = [...next, { csvCol: oldVal, label: oldVal, enabled: false }]
                      }
                      return next
                    })
                  }}
                  className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                >
                  <option value="">- skip -</option>
                  {parsed.headers.map(h => (
                    <option key={h} value={h} disabled={allMappedCols.has(h) && mapping[f.key] !== h}>{h}</option>
                  ))}
                </select>
                {mapping[f.key] && (
                  <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>

        {customFields.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Extra columns → custom fields
              </h4>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {enabledCustomCount}/{MAX_CUSTOM_COLS} selected
              </span>
            </div>
            <div className="space-y-3">
              {customFields.map(cf => (
                <div key={cf.csvCol} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={cf.enabled}
                    onChange={() => toggleCustomField(cf.csvCol)}
                    disabled={!cf.enabled && enabledCustomCount >= MAX_CUSTOM_COLS}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer disabled:opacity-40"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-24 shrink-0 truncate" title={cf.csvCol}>
                    {cf.csvCol}
                  </span>
                  {cf.enabled ? (
                    <input
                      type="text"
                      value={cf.label}
                      onChange={e => updateCustomLabel(cf.csvCol, e.target.value)}
                      placeholder="Column label"
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  ) : (
                    <span className="flex-1 text-sm text-gray-400 dark:text-gray-600 italic">
                      {enabledCustomCount >= MAX_CUSTOM_COLS ? 'limit reached' : 'not imported'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {preview.length > 0 && mapping.name && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Preview ({Math.min(3, parsed.rows.length)} of {parsed.rows.length})
            </h4>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {previewCols.map(f => (
                        <th key={f.key} className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {preview.map((row, i) => (
                      <tr key={i}>
                        {IMPORT_FIELDS.filter(f => mapping[f.key]).map(f => {
                          let val = row[mapping[f.key]]?.trim() || ''
                          if (f.key === 'name' && mapping._lastName) {
                            val = [val, row[mapping._lastName]?.trim()].filter(Boolean).join(' ')
                          }
                          return (
                            <td key={f.key} className="px-4 py-2 text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
                              {val || <span className="text-gray-300 dark:text-gray-600">-</span>}
                            </td>
                          )
                        })}
                        {customFields.filter(f => f.enabled).map(cf => (
                          <td key={cf.csvCol} className="px-4 py-2 text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
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

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

        <button
          onClick={runImport}
          disabled={!hasName || status === 'importing'}
          className="w-full py-3 bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Upload a CSV exported from HubSpot, Salesforce, Pipedrive, or any CRM. We'll auto-detect standard fields and let you import all other columns too.
      </p>

      <label
        className={`
          flex flex-col items-center justify-center gap-3 w-full h-40 rounded-xl
          border-2 border-dashed cursor-pointer transition-all duration-200
          ${dragging
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30 scale-[1.02]'
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
        <svg className={`w-10 h-10 transition-colors ${dragging ? 'text-primary-500' : 'text-gray-300 dark:text-gray-600'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <div className="text-center">
          <p className="text-base font-medium text-gray-700 dark:text-gray-300">
            Drop your CSV here, or <span className="text-primary-600 dark:text-primary-400">browse</span>
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Contacts CSV - max 10,000 rows</p>
        </div>
      </label>

      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {['HubSpot', 'Salesforce', 'Pipedrive'].map(crm => (
          <div key={crm} className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-gray-600 dark:text-gray-400">{crm}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Settings Page ────────────────────────────────────────────────────────

export default function Settings() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const user    = useAuthStore(s => s.user)
  const signOut = useAuthStore(s => s.signOut)
  const { team, members, isOwner, hasPaidSeat, fetchBilling, setMembers } = useBillingStore()
  const memberJoinedAt = useBillingStore((s) => s.memberJoinedAt)
  // For owners: team trial. For members: their own personal trial (based on joined_at)
  const trialInfo = useMemo(() => {
    if (!team) return null
    if (!isOwner && memberJoinedAt) return getTrialInfo(memberJoinedAt)
    return getTrialInfo(team.trial_start, team.trial_extended_days)
  }, [team, isOwner, memberJoinedAt])
  const subscribed = useBillingStore(selectIsSubscribed)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteSent, setInviteSent] = useState(false)
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)
  const [recentlyResentIds, setRecentlyResentIds] = useState<Set<string>>(new Set())
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<{ id: string; email: string } | null>(null)
  const [activityMember, setActivityMember] = useState<{ email: string; user_id: string | null } | null>(null)
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [confirmActivateSeat, setConfirmActivateSeat] = useState<{ id: string; email: string } | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showChangeName, setShowChangeName] = useState(false)
  const [newName, setNewName] = useState('')
  const [nameLoading, setNameLoading] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  useEffect(() => {
    if (user) fetchBilling(user.id)
  }, [user, fetchBilling])

  useEffect(() => {
    if (searchParams.get('gmail') === 'connected') {
      setToast({ message: 'Gmail connected! Click "Sync Now" to import emails.', type: 'success' })
      navigate('/settings', { replace: true })
    }
    if (searchParams.get('billing') === 'success') {
      setToast({ message: 'Payment successful! Activating your subscription…', type: 'success' })
      const sessionId = searchParams.get('session_id')
      navigate('/settings', { replace: true })
      if (user) {
        const userId = user.id
        ;(async () => {
          // Directly verify with Stripe so activation works immediately (no webhook timing dependency)
          if (sessionId) {
            await verifyCheckoutSession(sessionId)
          }
          // Poll until subscription_status flips to 'active' (up to 20s, covers webhook path too)
          for (let i = 0; i < 10; i++) {
            await fetchBilling(userId)
            if (useBillingStore.getState().team?.subscription_status === 'active') {
              setToast({ message: 'Subscription activated! Welcome to Pro.', type: 'success' })
              break
            }
            await new Promise(r => setTimeout(r, 2000))
          }
        })()
      }
    }
    if (searchParams.get('billing') === 'canceled') {
      setToast({ message: 'Checkout canceled - your trial is still active.', type: 'error' })
      navigate('/settings', { replace: true })
    }
  }, [searchParams, navigate, user, fetchBilling])

  const displayName: string = user?.user_metadata?.full_name ?? ''
  const initials = displayName ? displayName[0].toUpperCase() : (user?.email?.[0].toUpperCase() ?? 'U')

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const handleUpgrade = async () => {
    setUpgradeLoading(true)
    const { url, error } = await startStripeCheckout()
    if (error === 'already_subscribed') {
      // DB was out of sync - re-fetch billing so the UI updates to the subscribed state
      if (user) await fetchBilling(user.id)
      setToast({ message: 'Your subscription is already active! The page has been refreshed.', type: 'success' })
      setUpgradeLoading(false)
      return
    }
    if (error === 'session_expired') {
      // Session is genuinely invalid - sign out and redirect to login for a clean re-auth
      await signOut()
      navigate('/login')
      return
    }
    if (error || !url) {
      setToast({ message: error ?? 'Could not start checkout. Try again.', type: 'error' })
      setUpgradeLoading(false)
      return
    }
    window.location.href = url
  }

  const handleOpenPortal = async () => {
    setPortalLoading(true)
    const { url, error } = await getStripePortalUrl()
    if (error || !url) {
      setToast({ message: error ?? 'Could not open billing portal. Try again.', type: 'error' })
      setPortalLoading(false)
      return
    }
    window.location.href = url
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!team) {
      setToast({ message: 'Team not loaded. Please reload the page.', type: 'error' })
      return
    }
    setInviteLoading(true)
    try {
      const { member, error } = await inviteMember(team.id, inviteEmail)
      if (error) {
        setToast({ message: error.message, type: 'error' })
      } else if (member) {
        setMembers([...members, member])
        setInviteEmail('')
        setInviteSent(true)
        setTimeout(() => setInviteSent(false), 5000)
        const inviteLink = `${window.location.origin}/invite/${member.invite_token}`
        setLastInviteLink(inviteLink)
        try { await navigator.clipboard.writeText(inviteLink) } catch {}
        const existingUserId = await findUserIdByEmail(member.email)
        setToast({
          message: existingUserId
            ? `${member.email} already has an account - invite link copied to clipboard!`
            : `Invitation created for ${member.email} - link copied to clipboard!`,
          type: 'success',
        })
      }
    } catch (err) {
      setToast({ message: 'An unexpected error occurred. Please try again.', type: 'error' })
    } finally {
      setInviteLoading(false)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    setConfirmRemoveMember(null)
    setRemovingId(memberId)
    const { error } = await removeMember(memberId)
    if (error) {
      setToast({ message: error.message, type: 'error' })
    } else {
      const updated = members.filter(m => m.id !== memberId)
      setMembers(updated)
      setToast({ message: 'Member removed.', type: 'success' })
      // Sync Stripe subscription quantity to the new active seat count
      if (team) syncSubscriptionQuantity(team.id)
    }
    setRemovingId(null)
  }

  const handleResendInvite = async (memberId: string, email: string) => {
    if (!team || !user) return
    setResendingId(memberId)
    try {
      const { member, error } = await resendInvite(memberId)
      if (error) {
        setToast({ message: error.message, type: 'error' })
      } else if (member) {
        setMembers(members.map(m => m.id === memberId ? member : m))
        setRecentlyResentIds(prev => new Set(prev).add(memberId))
        setTimeout(() => setRecentlyResentIds(prev => { const next = new Set(prev); next.delete(memberId); return next }), 10000)
        const inviteLink = `${window.location.origin}/invite/${member.invite_token}`
        setLastInviteLink(inviteLink)
        try { await navigator.clipboard.writeText(inviteLink) } catch {}
        const existingUserId = await findUserIdByEmail(email)
        setToast({
          message: existingUserId
            ? `Invite link refreshed for ${email} - copied to clipboard!`
            : `New invite link generated for ${email} - copied to clipboard!`,
          type: 'success',
        })
      }
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
    } finally {
      setResendingId(null)
    }
  }

  const handleCancelInvite = async (memberId: string) => {
    setRemovingId(memberId)
    const { error } = await cancelInvite(memberId)
    if (error) {
      setToast({ message: error.message, type: 'error' })
    } else {
      setMembers(members.filter(m => m.id !== memberId))
    }
    setRemovingId(null)
  }

  const handleActivateSeat = async (memberId: string) => {
    if (!team || !user) return
    setConfirmActivateSeat(null)
    setActivatingId(memberId)
    const { error } = await activateMemberSeat(team.id, memberId)
    if (error) {
      setToast({ message: error, type: 'error' })
    } else {
      setMembers(members.map(m => m.id === memberId ? { ...m, has_paid_seat: true } : m))
      setToast({ message: 'Seat activated! The member now has Pro access.', type: 'success' })
    }
    setActivatingId(null)
  }

  const handleLeaveTeam = async () => {
    if (!user) return
    const myMembership = members.find(m => m.user_id === user.id || m.email === user.email)
    if (!myMembership) return
    setRemovingId(myMembership.id)
    const { error } = await removeMember(myMembership.id)
    if (error) {
      setToast({ message: error.message, type: 'error' })
      setRemovingId(null)
    } else {
      // Sync Stripe quantity now that a seat was freed
      if (team) syncSubscriptionQuantity(team.id)
      await fetchBilling(user.id)
    }
  }

  const handleDeleteAccount = async () => {
    if (!user) return
    setDeleteLoading(true)
    try {
      const token = await getFreshToken()
      if (!token) {
        setToast({ message: 'Session expired. Please log in again.', type: 'error' })
        setDeleteLoading(false)
        return
      }
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      const json = await res.json()
      if (!res.ok) {
        setToast({ message: json.error ?? 'Failed to delete account.', type: 'error' })
        setDeleteLoading(false)
        return
      }
      await signOut()
      navigate('/login')
    } catch {
      setToast({ message: 'An unexpected error occurred.', type: 'error' })
      setDeleteLoading(false)
    }
  }

  const handleChangeName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setNameLoading(true)
    const { error } = await supabase.auth.updateUser({ data: { full_name: newName.trim() } })
    setNameLoading(false)
    if (error) {
      setToast({ message: error.message, type: 'error' })
    } else {
      setToast({ message: 'Name updated!', type: 'success' })
      setShowChangeName(false)
      setNewName('')
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setToast({ message: 'Passwords do not match.', type: 'error' })
      return
    }
    if (newPassword.length < 6) {
      setToast({ message: 'Password must be at least 6 characters.', type: 'error' })
      return
    }
    setPasswordLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordLoading(false)
    if (error) {
      setToast({ message: error.message, type: 'error' })
    } else {
      setToast({ message: 'Password updated!', type: 'success' })
      setShowChangePassword(false)
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  // Determine progress bar status for trial
  const trialStatus = (trialInfo?.isExpired || team?.subscription_status === 'ended')
    ? 'expired'
    : trialInfo?.daysRemaining && trialInfo.daysRemaining <= 3
      ? 'warning'
      : 'normal'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Page header with subtle glow */}
        <div className="relative mb-2">
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-primary-500/10 via-transparent to-violet-500/10 blur-3xl" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-base text-gray-500 dark:text-gray-400 mt-1">
            Manage your account, billing, and data.
          </p>
        </div>

        {/* Account */}
        <SectionCard
          title="Account"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-xl font-bold shadow-md">
              {initials}
            </div>
            <div>
              {displayName && (
                <p className="text-base font-semibold text-gray-900 dark:text-white">{displayName}</p>
              )}
              <p className={`${displayName ? 'text-sm text-gray-500 dark:text-gray-400' : 'text-base font-semibold text-gray-900 dark:text-white'}`}>{user?.email}</p>
              <span className={`inline-flex items-center gap-1 text-sm font-medium px-3 py-1 rounded-full mt-1 ${
                hasPaidSeat
                  ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60'
                  : trialInfo?.isExpired
                    ? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/60'
                    : 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60'
              }`}>
                {hasPaidSeat ? 'Pro' : trialInfo?.isExpired ? 'Trial ended' : `Free Trial · ${trialInfo?.daysRemaining ?? '?'}d left`}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {/* Change Name */}
            <button
              onClick={() => { setShowChangeName(v => !v); setShowChangePassword(false) }}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors group"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Change Name</span>
              </div>
              <svg className={`w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 transition-all ${showChangeName ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {showChangeName && (
              <form onSubmit={handleChangeName} className="px-4 pb-4 pt-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl -mt-2 space-y-3">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={displayName || 'Your name'}
                  maxLength={60}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!newName.trim() || nameLoading}
                  className="w-full py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {nameLoading && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Save Name
                </button>
              </form>
            )}

            {/* Change Password */}
            <button
              onClick={() => { setShowChangePassword(v => !v); setShowChangeName(false) }}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors group"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Change Password</span>
              </div>
              <svg className={`w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 transition-all ${showChangePassword ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {showChangePassword && (
              <form onSubmit={handleChangePassword} className="px-4 pb-4 pt-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl -mt-2 space-y-3">
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New password"
                  minLength={6}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  type="submit"
                  disabled={!newPassword || !confirmPassword || passwordLoading}
                  className="w-full py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {passwordLoading && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Save Password
                </button>
              </form>
            )}

            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 rounded-xl transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="text-sm font-semibold">Sign Out</span>
            </button>
          </div>
        </SectionCard>

        {/* Billing */}
        <SectionCard
          title="Billing"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          }
        >
          {!isOwner ? (
            /* ── Member view: billing managed by team owner ── */
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800/50 border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md ${subscribed ? 'bg-gradient-to-br from-emerald-500 to-teal-500' : 'bg-gradient-to-br from-primary-500 to-violet-500'}`}>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Current Plan</p>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    {subscribed ? 'Deskly Pro' : 'Free Trial'}
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${subscribed ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60' : 'text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-950/60'}`}>
                      {subscribed ? 'Active' : `${trialInfo?.daysRemaining ?? '?'} days left`}
                    </span>
                  </h3>
                </div>
              </div>
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-200">Billing is managed by your team owner</p>
                    <p className="text-sm text-blue-700 dark:text-blue-400 mt-0.5">{team?.owner_email}</p>
                    {subscribed && team?.current_period_end && (
                      <p className="text-xs text-blue-600 dark:text-blue-500 mt-2">
                        Next billing period: {new Date(team.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        {' '}· ${(members.filter(m => m.status === 'active').length || 1) * 10}/month ({members.filter(m => m.status === 'active').length || 1} seat{(members.filter(m => m.status === 'active').length || 1) !== 1 ? 's' : ''} × $10)
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : subscribed ? (
            /* ── Owner subscribed view ── */
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800/50 border border-gray-200 dark:border-gray-800 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-full blur-3xl -mr-20 -mt-20" />
              <div className="relative">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-md">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Current Plan</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      Deskly Pro
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-3 py-1 rounded-full">
                        Active
                      </span>
                    </h3>
                  </div>
                </div>

                {(() => {
                  const activeSeats = members.filter(m => m.status === 'active').length || (team?.seats ?? 1)
                  return (
                    <>
                      <div className="mt-4 flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-gray-900 dark:text-white">${activeSeats * 10}</span>
                        <span className="text-gray-500 dark:text-gray-400 text-base">/month</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                        {activeSeats} seat{activeSeats !== 1 ? 's' : ''} · $10/user/month
                      </p>
                    </>
                  )
                })()}

                <FeatureList features={[
                  'Unlimited contacts',
                  'Kanban deal pipeline',
                  'Task management',
                  'Team collaboration',
                  'Gmail sync & automations'
                ]} />

                <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex items-center justify-end">
                    <button
                      onClick={handleOpenPortal}
                      disabled={portalLoading}
                      className="text-sm text-primary-600 dark:text-primary-400 hover:underline font-medium disabled:opacity-60 flex items-center gap-1"
                    >
                      {portalLoading && <span className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />}
                      Manage billing →
                    </button>
                  </div>
                  {team?.current_period_end ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                      Next invoice: {new Date(team.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' '}· ${(members.filter(m => m.status === 'active').length || team.seats) * 10}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                      Billing details available in the customer portal.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ── Owner trial view ── */
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-50 to-violet-50 dark:from-primary-950/30 dark:to-violet-950/20 border border-primary-100 dark:border-primary-900/50 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-500/10 to-violet-500/10 rounded-full blur-3xl -mr-20 -mt-20" />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-violet-500 flex items-center justify-center text-white shadow-md">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 019.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Current Plan</p>
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Free Trial</h3>
                    </div>
                  </div>
                </div>

                {trialInfo && (
                  <div className="mt-4">
                    <div className="flex items-end justify-between mb-1">
                      <span className="text-4xl font-bold text-gray-900 dark:text-white">
                        {trialInfo.daysRemaining}
                        <span className="text-lg font-normal text-gray-500 dark:text-gray-400 ml-1">days left</span>
                      </span>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Day {trialInfo.daysElapsed} of {trialInfo.totalDays}
                      </span>
                    </div>
                    <ProgressBar value={trialInfo.progress} status={trialStatus} />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                      {trialInfo.isExpired
                        ? 'Your trial has ended. Upgrade to keep using all features.'
                        : `Upgrade before your trial ends to keep your data and continue using Deskly Pro.`}
                    </p>
                  </div>
                )}

                <FeatureList features={[
                  'Unlimited contacts',
                  'Kanban deal pipeline',
                  'Task management',
                  'Gmail sync & automations'
                ]} />

                <button
                  onClick={handleUpgrade}
                  disabled={upgradeLoading}
                  className="mt-6 w-full py-3 bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {upgradeLoading && (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {upgradeLoading ? 'Redirecting…' : 'Upgrade to Pro - $10/user/month →'}
                </button>
              </div>
            </div>
          )}
        </SectionCard>

        {/* Team */}
        <SectionCard
          title="Team"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4a4 4 0 11-8 0 4 4 0 018 0zm6 4a2 2 0 100-4 2 2 0 000 4zM3 20a2 2 0 100-4 2 2 0 000 4z" />
            </svg>
          }
        >
          {members.length > 0 && (
            <div className="space-y-3 mb-6">
              {members.map(m => {
                const isMe = m.user_id === user?.id || m.email === user?.email
                const isOwnerRow = m.role === 'owner'
                const isPending = m.status === 'pending'
                const isDenied = m.status === 'denied'
                return (
                  <MemberRow
                    key={m.id}
                    member={m}
                    isCurrentUser={isMe}
                    trialExpired={m.role === 'owner'
                      ? trialInfo?.isExpired
                      : m.joined_at ? getTrialInfo(m.joined_at).isExpired : false}
                    onRemove={() => {
                      if (isMe) handleLeaveTeam()
                      else setConfirmRemoveMember({ id: m.id, email: m.email })
                    }}
                    onResend={() => handleResendInvite(m.id, m.email)}
                    onCancel={() => handleCancelInvite(m.id)}
                    onCopyLink={async () => {
                      const link = `${window.location.origin}/invite/${m.invite_token}`
                      setLastInviteLink(link)
                      try { await navigator.clipboard.writeText(link) } catch {}
                      setToast({ message: `Invite link copied for ${m.email}!`, type: 'success' })
                    }}
                    onViewActivity={() => setActivityMember({ email: m.email, user_id: m.user_id })}
                    onActivateSeat={() => setConfirmActivateSeat({ id: m.id, email: m.email })}
                    isRemoving={removingId === m.id}
                    isResending={resendingId === m.id}
                    recentlyResent={recentlyResentIds.has(m.id)}
                    showLeave={isMe && !isOwnerRow}
                    showRemove={!isMe && (!isPending || isDenied) && isOwner}
                    showResend={!isMe && isPending && isOwner}
                    showCancel={!isMe && isPending && isOwner}
                    showCopyLink={!isMe && isPending && isOwner}
                    showActivity={isOwner && !isMe && m.status === 'active'}
                    showActivateSeat={isOwner && !isOwnerRow && m.status === 'active' && !m.has_paid_seat && subscribed}
                    isActivating={activatingId === m.id}
                  />
                )
              })}
            </div>
          )}

          {subscribed && team && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 text-center">
              {members.filter(m => m.status === 'active').length} active seat{members.filter(m => m.status === 'active').length !== 1 ? 's' : ''} · $10/seat/month
            </p>
          )}

          {isOwner && (
            <>
              <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  className="flex-1 px-4 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={inviteLoading || inviteSent}
                  className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {inviteLoading ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : inviteSent ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                  {inviteSent ? 'Link copied!' : 'Invite'}
                </button>
              </form>

              {lastInviteLink && (
                <div className="mt-3 flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-1 truncate font-mono">{lastInviteLink}</span>
                  <button
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(lastInviteLink) } catch {}
                      setToast({ message: 'Link copied to clipboard!', type: 'success' })
                    }}
                    className="shrink-0 px-2.5 py-1 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => setLastInviteLink(null)}
                    className="shrink-0 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
                    title="Close"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {!lastInviteLink && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-center">
                  The invite link will appear here after you invite a teammate.
                </p>
              )}
            </>
          )}
        </SectionCard>

        {/* Activate seat confirmation modal */}
        {confirmActivateSeat && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmActivateSeat(null)} />
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 w-full max-w-sm p-6">
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">Activate Pro seat?</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                You are activating Pro access for{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">{confirmActivateSeat.email}</span>.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Your card will be charged a prorated amount for the remaining days of the current billing period. From the next billing cycle, all active members are included automatically.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmActivateSeat(null)}
                  className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleActivateSeat(confirmActivateSeat.id)}
                  disabled={activatingId === confirmActivateSeat.id}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {activatingId === confirmActivateSeat.id ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : 'Confirm payment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Remove member confirmation modal */}
        {confirmRemoveMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmRemoveMember(null)} />
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 w-full max-w-sm p-6">
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">Remove member?</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                <span className="font-medium text-gray-700 dark:text-gray-300">{confirmRemoveMember.email}</span> will lose access to your team's data immediately.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmRemoveMember(null)}
                  className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRemoveMember(confirmRemoveMember.id)}
                  disabled={!!removingId}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {removingId ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Member Activity Modal */}
        {activityMember && team && (
          <MemberActivityModal
            member={activityMember}
            teamId={team.id}
            onClose={() => setActivityMember(null)}
          />
        )}

        {/* Dashboard */}
        <SectionCard
          title="Dashboard"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          }
        >
          <DashboardModeSection />
        </SectionCard>

        {/* Automations */}
        <SectionCard
          title="Automations"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        >
          <div className="mb-5">
            <p className="text-base font-semibold text-gray-900 dark:text-white">Pre-built Automations</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Toggle automations on or off. Enabled automations run automatically when triggered.
            </p>
          </div>
          <AutomationsPanel onToast={(m, t) => setToast({ message: m, type: t })} />
        </SectionCard>

        {/* Gmail Integration */}
        <SectionCard
          title="Gmail Integration"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        >
          <div className="mb-4">
            <p className="text-base font-semibold text-gray-900 dark:text-white">Sync Gmail Emails</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Automatically sync emails with your CRM contacts and track communication history.
            </p>
          </div>
          <GmailSettingsPanel onToast={(m, t) => setToast({ message: m, type: t })} />
        </SectionCard>

        {/* Import Data */}
        <SectionCard
          title="Import Data"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          }
        >
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-semibold text-gray-900 dark:text-white">Import Contacts</span>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">CSV</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Migrate your contacts from any CRM in seconds.
            </p>
          </div>

          <ImportContactsPanel onToast={(m, t) => setToast({ message: m, type: t })} />

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-semibold text-gray-900 dark:text-white">Import Deals</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">CSV import for your deal pipeline.</p>
              </div>
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg">
                Coming soon
              </span>
            </div>
          </div>
        </SectionCard>

        {/* Danger Zone */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-red-200 dark:border-red-900/50 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-red-100 dark:border-red-900/40 bg-gradient-to-r from-red-50/50 to-white dark:from-red-950/20 dark:to-gray-900">
            <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-red-600 dark:text-red-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-red-600 dark:text-red-400">Danger Zone</h2>
          </div>
          <div className="p-6">
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className="flex-1">
                <p className="text-base font-semibold text-gray-900 dark:text-white">Delete Account</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
              </div>
              <button
                onClick={() => { setDeleteConfirm(''); setShowDeleteModal(true) }}
                className="w-full sm:w-auto shrink-0 px-5 py-2.5 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/70 text-red-600 dark:text-red-400 text-sm font-semibold rounded-xl border border-red-200 dark:border-red-800 transition-colors"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !deleteLoading && setShowDeleteModal(false)} />
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 w-full max-w-md p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">Delete Account</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">This is permanent and cannot be reversed.</p>
                </div>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                All your contacts, deals, tasks, emails, and billing data will be permanently deleted.
                To confirm, type your email address below:
              </p>

              <p className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 mb-2 select-all">
                {user?.email}
              </p>

              <input
                type="email"
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                placeholder={user?.email ?? 'your@email.com'}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors mb-4"
                disabled={deleteLoading}
              />

              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleteLoading}
                  className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirm !== user?.email || deleteLoading}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {deleteLoading && (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {deleteLoading ? 'Deleting…' : 'Delete Everything'}
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        )}
      </div>
    </div>
  )
}