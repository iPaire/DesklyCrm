import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area,
  BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { supabase } from '../lib/supabase'
import type { Contact, Deal, Task } from '../types'
import { useDarkModeStore } from '../store/darkModeStore'
import { useAuthStore } from '../store/authStore'
import { runDailyChecks } from '../lib/automations'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLocalToday(): string {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
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

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toLocaleString()}`
}

function formatKTick(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`
  return `$${n}`
}

function greetingText(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const TODAY_LABEL = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
})

// ─── Stage config ─────────────────────────────────────────────────────────────

const PIPELINE_STAGES: { id: Deal['stage']; label: string; bar: string; color: string }[] = [
  { id: 'lead',        label: 'Lead',        bar: 'bg-gray-400 dark:bg-gray-500', color: '#9ca3af' },
  { id: 'qualified',   label: 'Qualified',   bar: 'bg-blue-500',                  color: '#3b82f6' },
  { id: 'proposal',    label: 'Proposal',    bar: 'bg-violet-500',                color: '#8b5cf6' },
  { id: 'negotiation', label: 'Negotiation', bar: 'bg-amber-500',                 color: '#f59e0b' },
  { id: 'closed_won',  label: 'Closed Won',  bar: 'bg-emerald-500',               color: '#10b981' },
]

const ALL_STAGES = [
  ...PIPELINE_STAGES,
  { id: 'closed_lost' as Deal['stage'], label: 'Closed Lost', bar: '', color: '#ef4444' },
]

const STAGE_LABELS: Record<string, string> = {
  lead: 'Lead', qualified: 'Qualified', proposal: 'Proposal',
  negotiation: 'Negotiation', closed_won: 'Closed Won', closed_lost: 'Closed Lost',
}

// ─── Chart types ──────────────────────────────────────────────────────────────

type ChartKey = 'contacts' | 'pipeline' | 'deals' | 'tasks'

const CHART_META: Record<ChartKey, { title: string; desc: string; accent: string }> = {
  contacts: { title: 'Contact Growth',          desc: 'New contacts added per week - last 8 weeks',       accent: '#3b82f6' },
  pipeline: { title: 'Pipeline Value by Stage', desc: 'Total deal value in each active pipeline stage',   accent: '#10b981' },
  deals:    { title: 'Deals by Stage',          desc: 'Number of deals in each pipeline stage',           accent: '#8b5cf6' },
  tasks:    { title: 'Upcoming Tasks',          desc: 'Open tasks by due date - next 7 days + overdue',   accent: '#f59e0b' },
}

// ─── Custom chart tooltip ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label, valueFormat }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl px-3 py-2 text-xs">
      <p className="text-gray-400 dark:text-gray-500 font-medium mb-1">{label}</p>
      {payload.map((p: { value: number }, i: number) => (
        <p key={i} className="font-bold text-gray-900 dark:text-white text-sm">
          {valueFormat ? valueFormat(p.value) : p.value.toLocaleString()}
        </p>
      ))}
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800 ${className}`} />
}

function LoadingSkeleton() {
  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-8 space-y-2">
        <Bone className="h-7 w-44" />
        <Bone className="h-4 w-60" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <Bone className="h-3 w-24" />
              <Bone className="h-8 w-8 rounded-lg" />
            </div>
            <Bone className="h-8 w-20 mb-2" />
            <Bone className="h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <Bone className="h-4 w-32 mb-6" />
          <div className="space-y-4">
            {[78, 62, 44, 28, 18].map((w, i) => (
              <div key={i}>
                <div className="flex justify-between mb-1.5">
                  <Bone className="h-3 w-20" />
                  <Bone className="h-3 w-14" />
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full animate-pulse bg-gray-200 dark:bg-gray-700" style={{ width: `${w}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <Bone className="h-4 w-32 mb-6" />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Bone className="h-7 w-7 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5 pt-0.5">
                  <Bone className="h-3 w-4/5" />
                  <Bone className="h-3 w-1/2" />
                </div>
                <Bone className="h-3 w-10 mt-0.5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Stat card (clickable) ────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string
  sub: string
  subPositive: boolean | null
  iconBg: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
}

function StatCard({ label, value, sub, subPositive, iconBg, icon, active, onClick }: StatCardProps) {
  const subColor =
    subPositive === true  ? 'text-emerald-600 dark:text-emerald-400' :
    subPositive === false ? 'text-red-500 dark:text-red-400' :
                            'text-gray-500 dark:text-gray-400'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white dark:bg-gray-900 rounded-xl border p-5 transition-all group
        ${active
          ? 'border-primary-400 dark:border-primary-600 ring-2 ring-primary-500/20 shadow-sm'
          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm'
        }
      `}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
      <div className="flex items-center justify-between mt-1">
        <p className={`text-xs font-medium ${subColor}`}>{sub}</p>
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${
            active
              ? 'rotate-180 text-primary-500'
              : 'text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500'
          }`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const user = useAuthStore(s => s.user)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [deals,    setDeals]    = useState<Deal[]>([])
  const [tasks,    setTasks]    = useState<Pick<Task, 'id' | 'due_date' | 'completed'>[]>([])
  const [loading,  setLoading]  = useState(true)
  const [activeChart, setActiveChart] = useState<ChartKey | null>(null)

  const { isDark } = useDarkModeStore()
  const today = getLocalToday()

  // ── Chart datasets - all useMemo BEFORE any early return ────────────────────
  const contactsChartData = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 8 }, (_, i) => {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - (7 - i) * 7)
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 7)
      const count = contacts.filter(c => {
        const d = new Date(c.created_at)
        return d >= weekStart && d < weekEnd
      }).length
      return {
        week: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        New: count,
      }
    })
  }, [contacts])

  const pipelineChartData = useMemo(() =>
    PIPELINE_STAGES.map(s => ({
      stage: s.label,
      Value: deals.filter(d => d.stage === s.id).reduce((sum, d) => sum + d.value, 0),
      color: s.color,
    }))
  , [deals])

  const dealsChartData = useMemo(() =>
    ALL_STAGES.map(s => ({
      stage: s.label,
      Deals: deals.filter(d => d.stage === s.id).length,
      color: s.color,
    }))
  , [deals])

  const tasksChartData = useMemo(() => {
    const points: { day: string; Tasks: number; color: string }[] = []
    const overdue = tasks.filter(t => t.due_date && t.due_date < today && !t.completed).length
    if (overdue > 0) points.push({ day: 'Overdue', Tasks: overdue, color: '#ef4444' })
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      const dateStr = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
      const count = tasks.filter(t => t.due_date === dateStr && !t.completed).length
      points.push({
        day: i === 0 ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        Tasks: count,
        color: i === 0 ? '#f59e0b' : '#fbbf24',
      })
    }
    return points
  }, [tasks, today])

  // ── Chart axis styles (adapts to dark mode) ─────────────────────────────────
  const gridColor = isDark ? '#374151' : '#f3f4f6'
  const tickStyle = { fill: isDark ? '#9ca3af' : '#6b7280', fontSize: 11 }

  useEffect(() => {
    async function load() {
      const [{ data: c }, { data: d }, { data: t }] = await Promise.all([
        supabase.from('contacts').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('deals').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('tasks').select('id, due_date, completed'),
      ])
      setContacts((c ?? []) as Contact[])
      setDeals((d ?? []) as Deal[])
      setTasks((t ?? []) as Pick<Task, 'id' | 'due_date' | 'completed'>[])
      setLoading(false)

      // Run daily automation checks (stale deals, overdue tasks, auto-archive)
      if (user) runDailyChecks(user.id)
    }
    load()
  }, [user])

  if (loading) return <LoadingSkeleton />

  // ── Computed stats ──────────────────────────────────────────────────────────
  const totalContacts  = contacts.length
  const openDeals      = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage)).length
  const wonDeals       = deals.filter(d => d.stage === 'closed_won').length
  const lostDeals      = deals.filter(d => d.stage === 'closed_lost').length
  const pipelineValue  = deals.filter(d => d.stage !== 'closed_lost').reduce((s, d) => s + d.value, 0)
  const tasksDueToday  = tasks.filter(t => t.due_date === today && !t.completed).length
  const overdueCount   = tasks.filter(t => !!t.due_date && t.due_date < today && !t.completed).length

  // ── Pipeline summary (bar chart in bottom section) ──────────────────────────
  const pipelineSummary = PIPELINE_STAGES.map(s => {
    const sd = deals.filter(d => d.stage === s.id)
    return { ...s, count: sd.length, value: sd.reduce((sum, d) => sum + d.value, 0) }
  })
  const maxCount = Math.max(1, ...pipelineSummary.map(p => p.count))
  const hasPipelineData = pipelineSummary.some(p => p.count > 0)

  // ── Recent activity ─────────────────────────────────────────────────────────
  type ActivityItem = { type: 'contact' | 'deal'; id: string; title: string; sub: string; created_at: string }
  const recentActivity: ActivityItem[] = [
    ...contacts.slice(0, 10).map(c => ({
      type: 'contact' as const, id: c.id, title: c.name,
      sub: c.company ?? 'New contact', created_at: c.created_at,
    })),
    ...deals.slice(0, 10).map(d => ({
      type: 'deal' as const, id: d.id, title: d.name,
      sub: d.value > 0 ? `${STAGE_LABELS[d.stage]} · ${formatCurrency(d.value)}` : STAGE_LABELS[d.stage],
      created_at: d.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  const toggleChart = (key: ChartKey) =>
    setActiveChart(prev => (prev === key ? null : key))

  // ── Chart panel ─────────────────────────────────────────────────────────────
  function ChartPanel() {
    if (!activeChart) return null
    const meta = CHART_META[activeChart]

    return (
      <div className="mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        {/* Accent bar */}
        <div className="h-1" style={{ backgroundColor: meta.accent }} />

        <div className="px-6 py-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{meta.title}</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{meta.desc}</p>
            </div>
            <button
              onClick={() => setActiveChart(null)}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-4 shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Chart */}
          <div className="h-52 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              {activeChart === 'contacts' ? (
                <AreaChart data={contactsChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="contactsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="week" tick={tickStyle} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={tickStyle} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="New"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#contactsGrad)"
                    dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#3b82f6', strokeWidth: 0 }}
                  />
                </AreaChart>
              ) : activeChart === 'pipeline' ? (
                <BarChart data={pipelineChartData} margin={{ top: 5, right: 10, left: 15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="stage" tick={tickStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={formatKTick} />
                  <Tooltip content={<ChartTooltip valueFormat={formatCurrency} />} />
                  <Bar dataKey="Value" radius={[4, 4, 0, 0]} maxBarSize={56}>
                    {pipelineChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} fillOpacity={0.9} />
                    ))}
                  </Bar>
                </BarChart>
              ) : activeChart === 'deals' ? (
                <BarChart data={dealsChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="stage" tick={tickStyle} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={tickStyle} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="Deals" radius={[4, 4, 0, 0]} maxBarSize={56}>
                    {dealsChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} fillOpacity={0.9} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <BarChart data={tasksChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="day" tick={tickStyle} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={tickStyle} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="Tasks" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {tasksChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} fillOpacity={0.9} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    )
  }

  const isEmpty = totalContacts === 0 && deals.length === 0 && tasks.length === 0

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {greetingText()} 👋
        </h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{TODAY_LABEL}</p>
      </div>

      {/* ── Quickstart guide (shown on empty workspace) ── */}
      {isEmpty && (
        <div className="mb-8 bg-gradient-to-br from-primary-50 to-blue-50 dark:from-primary-950/40 dark:to-blue-950/30 border border-primary-200 dark:border-primary-900 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5">
                Get started with Deskly
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
                Complete these steps to set up your CRM workspace.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    step: '1',
                    title: 'Add a contact',
                    desc: 'Import or add your first client or lead.',
                    href: '/contacts',
                    color: 'bg-blue-500',
                  },
                  {
                    step: '2',
                    title: 'Create a deal',
                    desc: 'Track an opportunity in your pipeline.',
                    href: '/deals',
                    color: 'bg-violet-500',
                  },
                  {
                    step: '3',
                    title: 'Set a task',
                    desc: 'Schedule your first follow-up or action.',
                    href: '/tasks',
                    color: 'bg-amber-500',
                  },
                ].map((item) => (
                  <Link
                    key={item.step}
                    to={item.href}
                    className="flex items-start gap-3 p-3.5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-sm transition-all group"
                  >
                    <div className={`w-6 h-6 ${item.color} rounded-full flex items-center justify-center shrink-0 mt-0.5`}>
                      <span className="text-white text-xs font-bold">{item.step}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                        {item.title}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{item.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Stat cards (clickable) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">

        <StatCard
          label="Total Contacts"
          value={totalContacts.toLocaleString()}
          sub={totalContacts === 0 ? 'Add your first contact' : `${totalContacts} in your CRM`}
          subPositive={null}
          iconBg="bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
          active={activeChart === 'contacts'}
          onClick={() => toggleChart('contacts')}
        />

        <StatCard
          label="Pipeline Value"
          value={pipelineValue > 0 ? formatCurrency(pipelineValue) : '$0'}
          sub={wonDeals > 0 ? `${wonDeals} deal${wonDeals !== 1 ? 's' : ''} won` : openDeals > 0 ? 'Excluding lost deals' : 'No deals yet'}
          subPositive={wonDeals > 0 ? true : null}
          iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          active={activeChart === 'pipeline'}
          onClick={() => toggleChart('pipeline')}
        />

        <StatCard
          label="Open Deals"
          value={openDeals.toLocaleString()}
          sub={
            deals.length === 0 ? 'No deals yet' :
            wonDeals > 0 || lostDeals > 0 ? `${wonDeals} won · ${lostDeals} lost` : 'Active pipeline'
          }
          subPositive={null}
          iconBg="bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
          active={activeChart === 'deals'}
          onClick={() => toggleChart('deals')}
        />

        <StatCard
          label="Tasks Due Today"
          value={tasksDueToday.toLocaleString()}
          sub={
            overdueCount > 0 ? `${overdueCount} overdue` :
            tasks.length === 0 ? 'No tasks yet' : 'All caught up'
          }
          subPositive={overdueCount > 0 ? false : tasks.length > 0 ? true : null}
          iconBg="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }
          active={activeChart === 'tasks'}
          onClick={() => toggleChart('tasks')}
        />

      </div>

      {/* ── Inline chart panel ── */}
      <ChartPanel />

      {/* ── Bottom grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Pipeline by Stage */}
        <div className="lg:col-span-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-5">Pipeline by Stage</h2>

          {!hasPipelineData ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">No deals yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Add your first deal to see the pipeline.</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {pipelineSummary.map(p => (
                <div key={p.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[13px] text-gray-700 dark:text-gray-300 font-medium">{p.label}</span>
                    <div className="flex items-center gap-3">
                      {p.value > 0 && (
                        <span className="text-[13px] text-gray-500 dark:text-gray-400">
                          {formatCurrency(p.value)}
                        </span>
                      )}
                      <span className={`text-[13px] font-semibold w-5 text-right tabular-nums ${p.count > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-700'}`}>
                        {p.count}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${p.count > 0 ? p.bar : ''}`}
                      style={{ width: `${(p.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-5">Recent Activity</h2>

          {recentActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">No activity yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Activity will appear as you add contacts and deals.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentActivity.map((item, i) => {
                const isContact = item.type === 'contact'
                return (
                  <div key={`${item.type}-${item.id}-${i}`} className="flex items-start gap-3">
                    <div className={`
                      w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5
                      ${isContact
                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                        : 'bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400'
                      }
                    `}>
                      {isContact ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate leading-snug">
                        {item.title}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{item.sub}</p>
                    </div>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0 mt-0.5 tabular-nums">
                      {timeAgo(item.created_at)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
