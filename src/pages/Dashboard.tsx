import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Contact, Deal, Task } from '../types'
import { useAuthStore } from '../store/authStore'
import { useBillingStore } from '../store/billingStore'
import { runDailyChecks } from '../lib/automations'

// ─── types ────────────────────────────────────────────────────────────────────

type RangeKey  = '7D' | '30D' | '3M' | '6M' | '1Y'
type DashMode  = 'simple' | 'advanced'
type TaskRow   = Pick<Task, 'id' | 'due_date' | 'completed' | 'title' | 'created_at' | 'updated_at'>

export type { DashMode }

// ─── helpers ─────────────────────────────────────────────────────────────────

function getLocalToday(): string {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toLocaleString()}`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  if (h < 24)  return `${h}h ago`
  if (d === 1) return 'yesterday'
  if (d < 7)   return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function greetingText(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function pct(cur: number, prev: number): number | null {
  return prev > 0 ? ((cur - prev) / prev) * 100 : null
}

// ─── constants ─────────────────────────────────────────────────────────────────

const STAGE_META: { id: Deal['stage']; label: string; color: string }[] = [
  { id: 'lead',        label: 'Lead',        color: '#9ca3af' },
  { id: 'qualified',   label: 'Qualified',   color: '#3b82f6' },
  { id: 'proposal',    label: 'Proposal',    color: '#8b5cf6' },
  { id: 'negotiation', label: 'Negotiation', color: '#f59e0b' },
  { id: 'closed_won',  label: 'Won',         color: '#10b981' },
]

const STAGE_LABELS: Record<string, string> = {
  lead: 'Lead', qualified: 'Qualified', proposal: 'Proposal',
  negotiation: 'Negotiation', closed_won: 'Closed Won', closed_lost: 'Closed Lost',
}

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7D', label: '7D' }, { key: '30D', label: '30D' },
  { key: '3M', label: '3M' }, { key: '6M', label: '6M' }, { key: '1Y', label: '1Y' },
]

// ─── area data builder ────────────────────────────────────────────────────────

function buildAreaData(deals: Deal[], range: RangeKey, now: Date): { label: string; value: number }[] {
  const cfg: Record<RangeKey, { n: number; days: number; fmt: Intl.DateTimeFormatOptions }> = {
    '7D':  { n: 7,  days: 1,  fmt: { month: 'short', day: 'numeric' } },
    '30D': { n: 5,  days: 6,  fmt: { month: 'short', day: 'numeric' } },
    '3M':  { n: 8,  days: 11, fmt: { month: 'short', day: 'numeric' } },
    '6M':  { n: 6,  days: 30, fmt: { month: 'short' } },
    '1Y':  { n: 12, days: 30, fmt: { month: 'short' } },
  }
  const { n, days, fmt } = cfg[range]
  return Array.from({ length: n }, (_, i) => {
    const bEnd   = new Date(now.getTime() - (n - 1 - i) * days * 86_400_000)
    const bStart = new Date(bEnd.getTime() - days * 86_400_000)
    const value  = deals.filter(x => { const cd = new Date(x.created_at); return cd >= bStart && cd <= bEnd }).reduce((s, x) => s + x.value, 0)
    return { label: bStart.toLocaleDateString('en-US', fmt), value }
  })
}

// ─── sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ data, color, uid }: { data: number[]; color: string; uid: string }) {
  const max = Math.max(...data, 1)
  const W = 110, H = 40, PAD = 4
  const pts = data.map((v, i) => ({ x: (i / Math.max(data.length - 1, 1)) * W, y: H - PAD - ((v / max) * (H - PAD * 2)) }))
  const poly = pts.map(p => `${p.x},${p.y}`).join(' ')
  const area = `M${pts.map(p => `${p.x},${p.y}`).join(' L')} L${W},${H} L0,${H} Z`
  return (
    <svg width="84" height="38" viewBox="0 0 110 40" fill="none" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={`spk-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.22} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spk-${uid})`} />
      <polyline points={poly} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, change, sparkData, sparkColor, uid, icon }: {
  label: string; value: string; change: number | null
  sparkData: number[]; sparkColor: string; uid: string; icon: React.ReactNode
}) {
  const up = change === null || change >= 0
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-400 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-[27px] font-bold tracking-tight text-gray-900 dark:text-white leading-none tabular-nums">{value}</div>
          {change !== null && (
            <div className={`flex items-center gap-1 mt-1.5 text-xs font-semibold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
              {up ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
            </div>
          )}
        </div>
        <Sparkline data={sparkData} color={sparkColor} uid={uid} />
      </div>
      <p className="text-[11.5px] text-gray-400 dark:text-gray-500 mt-2.5">vs prior period</p>
    </div>
  )
}

// ─── skeleton ─────────────────────────────────────────────────────────────────

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800 ${className}`} />
}

function LoadingSkeleton() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      <div className="space-y-2"><Bone className="h-7 w-56" /><Bone className="h-4 w-72" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
            <Bone className="h-3 w-24" /><Bone className="h-8 w-28" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <Bone className="h-4 w-40 mb-4" /><Bone className="h-52 w-full" />
        </div>
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <Bone className="h-4 w-36 mb-6" /><Bone className="w-36 h-36 rounded-full mx-auto mb-4" />
          <div className="space-y-2">{[...Array(5)].map((_,i) => <Bone key={i} className="h-3 w-full" />)}</div>
        </div>
      </div>
    </div>
  )
}

// ─── simple dashboard ─────────────────────────────────────────────────────────

function SimpleDashboard({ contacts, deals, tasks, user, today, onComplete }: {
  contacts: Contact[]; deals: Deal[]; tasks: TaskRow[]
  user: ReturnType<typeof useAuthStore>['user']
  today: string
  onComplete: (id: string) => void
}) {
  const totalContacts  = contacts.length
  const totalDeals     = deals.length
  const pipelineValue  = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage)).reduce((s, d) => s + d.value, 0)
  const tasksDueToday  = tasks.filter(t => t.due_date === today && !t.completed).length
  const overdueCount   = tasks.filter(t => !!t.due_date && t.due_date < today && !t.completed).length

  const upcoming = tasks
    .filter(t => !t.completed)
    .sort((a, b) => { if (!a.due_date && !b.due_date) return 0; if (!a.due_date) return 1; if (!b.due_date) return -1; return a.due_date.localeCompare(b.due_date) })
    .slice(0, 6)

  const stageValues = STAGE_META.map(s => ({
    ...s,
    count: deals.filter(d => d.stage === s.id).length,
    value: deals.filter(d => d.stage === s.id).reduce((sum, d) => sum + d.value, 0),
  }))
  const maxStageVal = Math.max(...stageValues.map(s => s.value), 1)

  const recent = [...contacts.slice(0, 4).map(c => ({ type: 'contact' as const, id: c.id, title: c.name, sub: c.company ?? 'Contact', ts: c.created_at })),
                  ...deals.slice(0, 4).map(d => ({ type: 'deal' as const, id: d.id, title: d.name, sub: STAGE_LABELS[d.stage] ?? d.stage, ts: d.created_at }))]
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 5)

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          {greetingText()}{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Here's a quick overview of your workspace.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Pipeline Value', value: formatCurrency(pipelineValue), color: 'text-primary-600 dark:text-primary-400', bg: 'bg-primary-50 dark:bg-primary-950' },
          { label: 'Total Deals',    value: String(totalDeals),            color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950' },
          { label: 'Contacts',       value: String(totalContacts),         color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-50 dark:bg-blue-950' },
          { label: 'Due Today',      value: String(tasksDueToday + overdueCount),
            color: (tasksDueToday + overdueCount) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500',
            bg:    (tasksDueToday + overdueCount) > 0 ? 'bg-amber-50 dark:bg-amber-950' : 'bg-gray-50 dark:bg-gray-900' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{s.label}</p>
            <p className={`text-[30px] font-bold tracking-tight tabular-nums leading-none ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Upcoming tasks */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Upcoming Tasks</h2>
            <Link to="/tasks" className="text-[12.5px] font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700">View all</Link>
          </div>
          {upcoming.length === 0
            ? <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No open tasks.</p>
            : <div className="space-y-0">
                {upcoming.map((t, i) => {
                  const isOverdue = !!t.due_date && t.due_date < today
                  const isToday   = t.due_date === today
                  return (
                    <div key={t.id} className={`flex items-center gap-3 py-2.5 ${i < upcoming.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}>
                      <button onClick={() => onComplete(t.id)} className="w-5 h-5 border-[1.7px] border-gray-300 dark:border-gray-600 rounded hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors shrink-0 flex items-center justify-center group" title="Mark complete">
                        <svg className="w-3 h-3 text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                      </button>
                      <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{t.title}</span>
                      {t.due_date && (
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${
                          isOverdue ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40'
                            : isToday ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                            : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'
                        }`}>
                          {isOverdue ? 'Overdue' : isToday ? 'Today' : new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
          }
        </div>

        {/* Pipeline by stage */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Pipeline by Stage</h2>
            <Link to="/deals" className="text-[12.5px] font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700">View all</Link>
          </div>
          <div className="space-y-4">
            {stageValues.map(s => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="w-20 text-sm text-gray-600 dark:text-gray-400 shrink-0 truncate">{s.label}</span>
                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(s.value / maxStageVal) * 100}%`, backgroundColor: s.color }} />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums w-16 text-right shrink-0">{formatCurrency(s.value)}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 w-5 text-right shrink-0 tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Activity</h2>
        </div>
        {recent.length === 0
          ? <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No activity yet.</p>
          : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {recent.map((item, i) => (
                <div key={`${item.id}-${i}`} className="flex gap-2.5 items-start p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.type === 'contact' ? 'bg-primary-100 dark:bg-primary-950 text-primary-600' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600'}`}>
                    {item.type === 'contact'
                      ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4.5"/><path d="M3.5 21c0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5H3.5z"/></svg>
                      : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.sub}</p>
                    <p className="text-[10.5px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">{timeAgo(item.ts)}</p>
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  )
}

// ─── main dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const user = useAuthStore(s => s.user)
  const team = useBillingStore(s => s.team)

  const [contacts, setContacts] = useState<Contact[]>([])
  const [deals,    setDeals]    = useState<Deal[]>([])
  const [tasks,    setTasks]    = useState<TaskRow[]>([])
  const [loading,  setLoading]  = useState(true)

  const [chartRange, setChartRange] = useState<RangeKey>('3M')
  const [dashMode,   setDashModeState] = useState<DashMode>(() =>
    (localStorage.getItem('deskly-dashboard-mode') as DashMode) || 'advanced'
  )
  const [heatHover, setHeatHover] = useState<{ idx: number; x: number; y: number } | null>(null)
  const heatGridRef = useRef<HTMLDivElement>(null)

  const setDashMode = (m: DashMode) => {
    setDashModeState(m)
    localStorage.setItem('deskly-dashboard-mode', m)
  }

  const today = getLocalToday()

  const { now, thisWeekStart } = useMemo(() => {
    const n = new Date()
    const tws = new Date(n); tws.setDate(n.getDate() - n.getDay()); tws.setHours(0, 0, 0, 0)
    return { now: n, thisWeekStart: tws }
  }, [])

  useEffect(() => {
    async function load() {
      const [{ data: c }, { data: d }, { data: t }] = await Promise.all([
        supabase.from('contacts').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('deals').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('tasks').select('id, due_date, completed, title, created_at, updated_at'),
      ])
      setContacts((c ?? []) as Contact[])
      setDeals((d ?? []) as Deal[])
      setTasks((t ?? []) as TaskRow[])
      setLoading(false)
      if (user && team) runDailyChecks(user.id, team.id)
    }
    load()
  }, [user])

  // ── mark task complete ────────────────────────────────────────────────────
  const handleCompleteTask = useCallback(async (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: true, updated_at: new Date().toISOString() } : t))
    await supabase.from('tasks').update({ completed: true, updated_at: new Date().toISOString() }).eq('id', id)
  }, [])

  // ── range-aware comparison ────────────────────────────────────────────────
  const rangeMs = useMemo(() => ({
    '7D': 7, '30D': 30, '3M': 90, '6M': 180, '1Y': 365
  }[chartRange] * 86_400_000), [chartRange])

  const periodStart    = useMemo(() => new Date(now.getTime() - rangeMs), [now, rangeMs])
  const prevPeriodStart = useMemo(() => new Date(now.getTime() - 2 * rangeMs), [now, rangeMs])

  const inCur  = useCallback((iso: string) => new Date(iso) >= periodStart, [periodStart])
  const inPrev = useCallback((iso: string) => { const d = new Date(iso); return d >= prevPeriodStart && d < periodStart }, [prevPeriodStart, periodStart])

  // ── weekly sparkline (always 12 trailing weeks) ───────────────────────────
  const weeklyPoints = useMemo(() => {
    const W = 12, WEEK = 7 * 86_400_000, nowMs = now.getTime()
    const pipeline = Array(W).fill(0)
    const newDeals  = Array(W).fill(0)
    const won       = Array(W).fill(0)
    const ctPts     = Array(W).fill(0)
    for (const d of deals) {
      const wa = Math.floor((nowMs - new Date(d.created_at).getTime()) / WEEK)
      if (wa >= 0 && wa < W) { newDeals[W-1-wa]++; pipeline[W-1-wa] += d.value }
      if (d.stage === 'closed_won') {
        const wa2 = Math.floor((nowMs - new Date(d.updated_at).getTime()) / WEEK)
        if (wa2 >= 0 && wa2 < W) won[W-1-wa2]++
      }
    }
    for (const c of contacts) {
      const wa = Math.floor((nowMs - new Date(c.created_at).getTime()) / WEEK)
      if (wa >= 0 && wa < W) ctPts[W-1-wa]++
    }
    return { pipeline, newDeals, won, contacts: ctPts }
  }, [deals, contacts, now])

  // ── area chart ────────────────────────────────────────────────────────────
  const areaData = useMemo(() => buildAreaData(deals, chartRange, now), [deals, chartRange, now])

  // ── heatmap with dates ────────────────────────────────────────────────────
  const heatmapData = useMemo(() => {
    const DAYS = 130, DAY = 86_400_000, nowMs = now.getTime()
    const counts = Array(DAYS).fill(0)
    const dates  = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(nowMs - (DAYS - 1 - i) * DAY)
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    })
    const add = (iso: string) => { const da = Math.floor((nowMs - new Date(iso).getTime()) / DAY); if (da >= 0 && da < DAYS) counts[DAYS-1-da]++ }
    contacts.forEach(c => add(c.created_at))
    deals.forEach(d => add(d.created_at))
    tasks.forEach(t => add(t.created_at))
    const max = Math.max(...counts, 1)
    return counts.map((c, i) => ({ opacity: Math.max(0.06, c / max), count: c, date: dates[i] }))
  }, [contacts, deals, tasks, now])

  // ── task bars (completed per weekday) ─────────────────────────────────────
  const taskBars = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const ds = new Date(thisWeekStart); ds.setDate(thisWeekStart.getDate() + i)
      const de = new Date(ds); de.setDate(ds.getDate() + 1)
      return tasks.filter(t => t.completed && new Date(t.updated_at) >= ds && new Date(t.updated_at) < de).length
    }), [tasks, thisWeekStart])

  if (loading) return <LoadingSkeleton />

  // ── computed stats ────────────────────────────────────────────────────────
  const totalContacts  = contacts.length
  const pipelineValue  = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage)).reduce((s, d) => s + d.value, 0)
  const wonAllTime     = deals.filter(d => d.stage === 'closed_won').length
  const openDeals      = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage)).length
  const totalDeals     = deals.length
  const tasksDueToday  = tasks.filter(t => t.due_date === today && !t.completed).length
  const overdueCount   = tasks.filter(t => !!t.due_date && t.due_date < today && !t.completed).length

  const newDealsCur  = deals.filter(d => inCur(d.created_at)).length
  const newDealsPrev = deals.filter(d => inPrev(d.created_at)).length
  const wonCur       = deals.filter(d => d.stage === 'closed_won' && inCur(d.updated_at)).length
  const wonPrev      = deals.filter(d => d.stage === 'closed_won' && inPrev(d.updated_at)).length
  const ctCur        = contacts.filter(c => inCur(c.created_at)).length
  const ctPrev       = contacts.filter(c => inPrev(c.created_at)).length
  const pvCur        = deals.filter(d => inCur(d.created_at)).reduce((s, d) => s + d.value, 0)
  const pvPrev       = deals.filter(d => inPrev(d.created_at)).reduce((s, d) => s + d.value, 0)

  // ── donut chart ────────────────────────────────────────────────────────────
  const CIRC = 2 * Math.PI * 60
  let donutOff = 0
  const donutSegs = STAGE_META.map(s => {
    const count = deals.filter(d => d.stage === s.id).length
    const frac  = totalDeals > 0 ? count / totalDeals : 0
    const dash  = frac * CIRC
    const seg   = { ...s, count, frac, dash, offset: donutOff }
    donutOff += dash
    return seg
  })

  // ── funnel ─────────────────────────────────────────────────────────────────
  const funnelStages = STAGE_META.map(s => ({ ...s, count: deals.filter(d => d.stage === s.id).length }))
  const funnelMax    = Math.max(funnelStages[0].count, 1)
  const convRate     = totalDeals > 0 ? Math.round((wonAllTime / totalDeals) * 100) : 0

  // ── pipeline value by stage ────────────────────────────────────────────────
  const stageValues  = STAGE_META.map(s => ({
    ...s,
    value: deals.filter(d => d.stage === s.id).reduce((sum, d) => sum + d.value, 0),
    count: deals.filter(d => d.stage === s.id).length,
  }))
  const maxStageVal  = Math.max(...stageValues.map(s => s.value), 1)

  // ── recent activity ────────────────────────────────────────────────────────
  type Act = { type: 'contact' | 'deal'; id: string; title: string; sub: string; created_at: string }
  const recentActivity: Act[] = [
    ...contacts.slice(0, 8).map(c => ({ type: 'contact' as const, id: c.id, title: c.name, sub: c.company ?? 'New contact', created_at: c.created_at })),
    ...deals.slice(0, 8).map(d => ({ type: 'deal' as const, id: d.id, title: d.name, sub: d.value > 0 ? `${STAGE_LABELS[d.stage]} · ${formatCurrency(d.value)}` : STAGE_LABELS[d.stage], created_at: d.created_at })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)

  // ── upcoming tasks ─────────────────────────────────────────────────────────
  const upcomingTasks = tasks
    .filter(t => !t.completed)
    .sort((a, b) => { if (!a.due_date && !b.due_date) return 0; if (!a.due_date) return 1; if (!b.due_date) return -1; return a.due_date.localeCompare(b.due_date) })
    .slice(0, 4)

  // ── tasks completed this week ──────────────────────────────────────────────
  const completedThisWeek  = tasks.filter(t => t.completed && new Date(t.updated_at) >= thisWeekStart).length
  const lastWeekStart      = new Date(thisWeekStart); lastWeekStart.setDate(thisWeekStart.getDate() - 7)
  const completedLastWeek  = tasks.filter(t => t.completed && new Date(t.updated_at) >= lastWeekStart && new Date(t.updated_at) < thisWeekStart).length
  const completedPct       = pct(completedThisWeek, completedLastWeek)
  const taskBarsMax        = Math.max(...taskBars, 1)

  // ── area chart SVG ────────────────────────────────────────────────────────
  const AREA_MAX = Math.max(...areaData.map(p => p.value), 1)
  const AREA_X0 = 10, AREA_X1 = 610, AREA_TOP = 10, AREA_BOT = 190
  const areaPts = areaData.map((p, i) => ({
    x: AREA_X0 + (i / Math.max(areaData.length - 1, 1)) * (AREA_X1 - AREA_X0),
    y: AREA_BOT - ((p.value / AREA_MAX) * (AREA_BOT - AREA_TOP)),
    label: p.label,
    value: p.value,
  }))
  const polyPts  = areaPts.map(p => `${p.x},${p.y}`).join(' ')
  const areaPath = `M${areaPts.map(p => `${p.x},${p.y}`).join(' L')} L${AREA_X1},${AREA_BOT} L${AREA_X0},${AREA_BOT} Z`

  const isEmpty    = totalContacts === 0 && totalDeals === 0 && tasks.length === 0
  const monthLabel = `${new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  // ── mode toggle header (shared) ────────────────────────────────────────────
  const ModeToggle = (
    <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
      {(['simple', 'advanced'] as DashMode[]).map(m => (
        <button key={m} onClick={() => setDashMode(m)}
          className={`px-3 py-1 text-xs font-semibold rounded-md capitalize transition-all ${
            dashMode === m
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >{m}</button>
      ))}
    </div>
  )

  // ── simple mode ────────────────────────────────────────────────────────────
  if (dashMode === 'simple') {
    return (
      <div>
        {/* mode switch in top-right corner */}
        <div className="flex justify-end px-6 pt-6 lg:px-8">
          {ModeToggle}
        </div>
        <SimpleDashboard
          contacts={contacts} deals={deals} tasks={tasks}
          user={user} today={today} onComplete={handleCompleteTask}
        />
      </div>
    )
  }

  // ── advanced mode ──────────────────────────────────────────────────────────
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {greetingText()}{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Here's what's happening with your team today.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 shadow-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {monthLabel}
          </div>
          {ModeToggle}
        </div>
      </div>

      {/* ── Quickstart (empty state only) ── */}
      {isEmpty && (
        <div className="mb-6 bg-gradient-to-br from-primary-50 to-blue-50 dark:from-primary-950/40 dark:to-blue-950/30 border border-primary-200 dark:border-primary-900 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5">Get started with Deskly</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Complete these steps to set up your CRM workspace.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { step: '1', title: 'Add a contact', desc: 'Import or add your first client or lead.', href: '/contacts', color: 'bg-blue-500' },
                  { step: '2', title: 'Create a deal',  desc: 'Track an opportunity in your pipeline.',  href: '/deals',    color: 'bg-violet-500' },
                  { step: '3', title: 'Set a task',     desc: 'Schedule your first follow-up.', href: '/tasks',            color: 'bg-amber-500' },
                ].map(item => (
                  <Link key={item.step} to={item.href} className="flex items-start gap-3 p-3.5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-sm transition-all group">
                    <div className={`w-6 h-6 ${item.color} rounded-full flex items-center justify-center shrink-0 mt-0.5`}><span className="text-white text-xs font-bold">{item.step}</span></div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{item.title}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{item.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard label="Pipeline Value"  value={formatCurrency(pipelineValue)} change={pct(pvCur, pvPrev)}        sparkData={weeklyPoints.pipeline} sparkColor="#4f46e5" uid="pv"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        />
        <KpiCard label="New Deals"       value={String(newDealsCur)}           change={pct(newDealsCur, newDealsPrev)} sparkData={weeklyPoints.newDeals} sparkColor="#10b981" uid="nd"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>}
        />
        <KpiCard label="Won Deals"       value={String(wonAllTime)}            change={pct(wonCur, wonPrev)}          sparkData={weeklyPoints.won}     sparkColor="#10b981" uid="wd"
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        />
        <KpiCard label="Active Contacts" value={String(totalContacts)}         change={pct(ctCur, ctPrev)}            sparkData={weeklyPoints.contacts} sparkColor="#4f46e5" uid="ct"
          icon={<svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4.5"/><path d="M3.5 21c0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5H3.5z"/></svg>}
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">

        {/* Pipeline over time */}
        <div className="lg:col-span-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Pipeline Over Time</h2>
              <p className="text-[25px] font-bold tracking-tight text-gray-900 dark:text-white mt-1 tabular-nums">{formatCurrency(pipelineValue)}</p>
            </div>
            {/* Range selector */}
            <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
              {RANGES.map(r => (
                <button key={r.key} onClick={() => setChartRange(r.key)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    chartRange === r.key
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >{r.label}</button>
              ))}
            </div>
          </div>
          <svg width="100%" height="190" viewBox="0 0 620 210" preserveAspectRatio="none" className="block overflow-visible">
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#4f46e5" stopOpacity={0.18} />
                <stop offset="1" stopColor="#4f46e5" stopOpacity={0} />
              </linearGradient>
            </defs>
            {[10, 57, 104, 151, 190].map(y => (
              <line key={y} x1="10" y1={y} x2="610" y2={y} stroke="#e5e7eb" strokeWidth="1" className="dark:stroke-gray-800" />
            ))}
            {areaPts.length > 1 && (
              <>
                <path d={areaPath} fill="url(#areaGrad)" />
                <polyline points={polyPts} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {areaPts.map((p, i) => (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r="4" fill="white" stroke="#4f46e5" strokeWidth="2" className="opacity-0 hover:opacity-100 transition-opacity" />
                    <title>{p.label}: {formatCurrency(p.value)}</title>
                  </g>
                ))}
                {areaPts.filter((_, i) => i % Math.max(1, Math.floor(areaPts.length / 5)) === 0).map((p, i) => (
                  <text key={i} x={p.x} y="208" textAnchor="middle" fontSize="10" fill="#9ca3af" fontFamily="monospace">{p.label}</text>
                ))}
              </>
            )}
            {areaPts.length <= 1 && (
              <text x="310" y="100" textAnchor="middle" fontSize="13" fill="#9ca3af">Add deals to see data</text>
            )}
          </svg>
        </div>

        {/* Deals by stage donut */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Deals by Stage</h2>
          <div className="flex items-center gap-5">
            <div className="relative w-36 h-36 shrink-0">
              <svg viewBox="0 0 160 160" className="w-full h-full">
                {totalDeals === 0
                  ? <circle cx="80" cy="80" r="60" fill="none" stroke="#e5e7eb" strokeWidth="22" className="dark:stroke-gray-800" />
                  : <g transform="rotate(-90 80 80)" fill="none" strokeWidth="22">
                      {donutSegs.filter(s => s.dash > 0).map(s => (
                        <circle key={s.id} cx="80" cy="80" r="60" stroke={s.color}
                          strokeDasharray={`${s.dash} ${CIRC - s.dash}`}
                          strokeDashoffset={-s.offset}>
                          <title>{s.label}: {s.count} deal{s.count !== 1 ? 's' : ''} ({Math.round(s.frac * 100)}%)</title>
                        </circle>
                      ))}
                    </g>
                }
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{totalDeals}</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">Total</span>
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-2.5">
              {donutSegs.map(s => (
                <div key={s.id} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="flex-1 text-[12.5px] text-gray-600 dark:text-gray-400 truncate">{s.label}</span>
                  <span className="text-[12.5px] font-semibold text-gray-900 dark:text-white tabular-nums w-6 text-right">{s.count}</span>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono w-8 text-right">{totalDeals > 0 ? Math.round(s.frac * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Three-card row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

        {/* Sales Funnel */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Sales Funnel</h2>
          <div className="flex gap-4 items-center">
            <svg className="flex-1" height="178" viewBox="0 0 100 178" preserveAspectRatio="none">
              {funnelStages.map((s, i) => {
                const topW = Math.max(10, (funnelStages[i].count / funnelMax) * 100)
                const botW = i < funnelStages.length - 1 ? Math.max(10, (funnelStages[i+1].count / funnelMax) * 100) : Math.max(10, (funnelStages[i].count / funnelMax) * 80)
                const tL = (100 - topW) / 2, bL = (100 - botW) / 2
                const y = i * 38, h = 34
                const COLS = ['#4f46e5','#6366f1','#818cf8','#46a691','#10b981']
                return (
                  <polygon key={s.id} points={`${tL},${y} ${100-tL},${y} ${100-bL},${y+h} ${bL},${y+h}`} fill={COLS[i]}>
                    <title>{s.label}: {s.count}</title>
                  </polygon>
                )
              })}
            </svg>
            <div className="w-32 shrink-0 space-y-0">
              {funnelStages.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between" style={{ height: 38 }}>
                  <span className="text-[12.5px] text-gray-600 dark:text-gray-400">{s.label}</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[13px] font-bold text-gray-900 dark:text-white tabular-nums">{s.count}</span>
                    {i > 0 && funnelStages[i-1].count > 0 && (
                      <span className="text-[10.5px] text-gray-400 dark:text-gray-500 font-mono">{Math.round((s.count / funnelStages[i-1].count) * 100)}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 pt-3.5 border-t border-gray-100 dark:border-gray-800">
            <span className="text-[12.5px] text-gray-500 dark:text-gray-400">Conversion rate</span>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded-md px-2 py-0.5">{convRate}%</span>
          </div>
        </div>

        {/* Pipeline value by stage */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Pipeline Value by Stage</h2>
          <div className="space-y-4">
            {stageValues.map(s => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="w-20 text-[12.5px] text-gray-600 dark:text-gray-400 shrink-0 truncate">{s.label}</span>
                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(s.value / maxStageVal) * 100}%`, backgroundColor: s.color }} title={`${s.label}: ${formatCurrency(s.value)}`} />
                </div>
                <span className="text-[12.5px] font-semibold text-gray-900 dark:text-white tabular-nums w-14 text-right shrink-0">{formatCurrency(s.value)}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 w-6 text-right shrink-0 tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3.5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <span className="text-[12.5px] text-gray-500 dark:text-gray-400">Open deals</span>
            <span className="text-[12.5px] font-semibold text-gray-900 dark:text-white tabular-nums">{openDeals}</span>
          </div>
        </div>

        {/* Recent activities */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Activities</h2>
            <Link to="/contacts" className="text-[12.5px] font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">View all</Link>
          </div>
          {recentActivity.length === 0
            ? <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No activity yet.</p>
            : (
              <div className="space-y-3.5">
                {recentActivity.map((item, i) => (
                  <div key={`${item.id}-${i}`} className="flex gap-2.5 items-start">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.type === 'contact' ? 'bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-400' : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'}`}>
                      {item.type === 'contact'
                        ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4.5"/><path d="M3.5 21c0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5H3.5z"/></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{item.sub}</p>
                    </div>
                    <span className="text-[10.5px] text-gray-400 dark:text-gray-500 shrink-0 font-mono">{timeAgo(item.created_at)}</span>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* ── Bottom row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Upcoming tasks */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Upcoming Tasks</h2>
            <Link to="/tasks" className="text-[12.5px] font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">View all</Link>
          </div>
          {upcomingTasks.length === 0
            ? <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No upcoming tasks.</p>
            : (
              <div>
                {upcomingTasks.map((t, i) => {
                  const isOverdue = !!t.due_date && t.due_date < today
                  const isToday   = t.due_date === today
                  const dateLabel = isOverdue ? 'Overdue' : isToday ? 'Today' : t.due_date
                    ? new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : 'No date'
                  const chipClass = isOverdue
                    ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40'
                    : isToday
                      ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                      : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'
                  return (
                    <div key={t.id} className={`flex items-center gap-2.5 py-2.5 ${i < upcomingTasks.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}>
                      <button
                        onClick={() => handleCompleteTask(t.id)}
                        className="w-5 h-5 border-[1.7px] border-gray-300 dark:border-gray-600 rounded hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors shrink-0 flex items-center justify-center group"
                        title="Mark complete"
                      >
                        <svg className="w-3 h-3 text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                        </svg>
                      </button>
                      <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{t.title}</span>
                      <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded shrink-0 ${chipClass}`}>{dateLabel}</span>
                    </div>
                  )
                })}
              </div>
            )
          }
          {(tasksDueToday > 0 || overdueCount > 0) && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3 flex-wrap">
              {overdueCount > 0 && <span className="text-xs text-red-500 dark:text-red-400 font-medium">{overdueCount} overdue</span>}
              {tasksDueToday > 0 && <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">{tasksDueToday} due today</span>}
            </div>
          )}
        </div>

        {/* Tasks completed */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Tasks Completed</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-md px-2 py-1">This week</span>
          </div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-[36px] font-bold tracking-tight text-gray-900 dark:text-white tabular-nums leading-none">{completedThisWeek}</span>
                {completedPct !== null && (
                  <span className={`text-[12.5px] font-semibold ${completedPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {completedPct >= 0 ? '↑' : '↓'} {Math.abs(completedPct).toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">vs last week</p>
            </div>
            <div className="flex items-end gap-1">
              {taskBars.map((v, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5" title={`${'Sunday Monday Tuesday Wednesday Thursday Friday Saturday'.split(' ')[i]}: ${v} completed`}>
                  <div className="w-5 bg-primary-500 dark:bg-primary-400 rounded-sm opacity-60 hover:opacity-90 transition-opacity cursor-default" style={{ height: `${Math.max(3, (v / taskBarsMax) * 48)}px` }} />
                  <span className="text-[9px] text-gray-400 dark:text-gray-500">{'SMTWTFS'[i]}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 pt-3.5 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">Total completed</span>
              <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">{tasks.filter(t => t.completed).length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">Open tasks</span>
              <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">{tasks.filter(t => !t.completed).length}</span>
            </div>
          </div>
        </div>

        {/* Activity heatmap */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Activity Heatmap</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-md px-2 py-1">Last 130 days</span>
          </div>
          <div className="relative">
            <div
              ref={heatGridRef}
              className="grid gap-[3px]"
              style={{ gridTemplateColumns: 'repeat(26, minmax(0, 1fr))' }}
              onMouseLeave={() => setHeatHover(null)}
            >
              {heatmapData.map((cell, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-[2px] bg-primary-500 dark:bg-primary-400 cursor-default"
                  style={{ opacity: cell.opacity }}
                  onMouseEnter={(e) => {
                    const gridRect = heatGridRef.current?.getBoundingClientRect()
                    const cellRect = e.currentTarget.getBoundingClientRect()
                    if (!gridRect) return
                    setHeatHover({
                      idx: i,
                      x: cellRect.left - gridRect.left + cellRect.width / 2,
                      y: cellRect.top - gridRect.top,
                    })
                  }}
                />
              ))}
            </div>
            {/* Tooltip */}
            {heatHover !== null && (
              <div
                className="absolute z-20 pointer-events-none"
                style={{ left: heatHover.x, top: heatHover.y - 6, transform: 'translate(-50%, -100%)' }}
              >
                <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                  <span className="font-semibold">{heatmapData[heatHover.idx].date}</span>
                  <span className="text-gray-300 ml-1.5">·</span>
                  <span className="ml-1.5">{heatmapData[heatHover.idx].count} {heatmapData[heatHover.idx].count === 1 ? 'activity' : 'activities'}</span>
                  <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-gray-900 dark:border-t-gray-700" />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-1.5 mt-3">
            <span className="text-[10.5px] text-gray-400 dark:text-gray-500">Less</span>
            {[0.08, 0.28, 0.55, 0.9].map(op => (
              <div key={op} className="w-2.5 h-2.5 rounded-[2px] bg-primary-500 dark:bg-primary-400" style={{ opacity: op }} />
            ))}
            <span className="text-[10.5px] text-gray-400 dark:text-gray-500">More</span>
          </div>
          <div className="mt-4 pt-3.5 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">Contacts added</span>
              <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">{totalContacts}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">Deals created</span>
              <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">{totalDeals}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
