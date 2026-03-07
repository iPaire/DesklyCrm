import { useState, useEffect, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import type { Deal, Contact } from '../types'
import DealModal from '../components/DealModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Toast } from '../components/Toast'
import { useAuthStore } from '../store/authStore'
import { getTeamAutomations, isEnabled, runDealProposalTask } from '../lib/automations'
import { useBillingStore } from '../store/billingStore'
import { logTeamActivity } from '../lib/billing'

// ─── Stage config ─────────────────────────────────────────────────────────────

type StageId = Deal['stage']

const STAGES: { id: StageId; label: string }[] = [
  { id: 'lead',        label: 'Lead' },
  { id: 'qualified',   label: 'Qualified' },
  { id: 'proposal',    label: 'Proposal' },
  { id: 'negotiation', label: 'Negotiation' },
  { id: 'closed_won',  label: 'Closed Won' },
  { id: 'closed_lost', label: 'Closed Lost' },
]

const STAGE_IDS = new Set<string>(STAGES.map(s => s.id))

interface StageCfg {
  dot: string
  label: string
  column: string
  columnOver: string
  border: string
  badge: string
  value: string
}

const CFG: Record<StageId, StageCfg> = {
  lead: {
    dot:        'bg-gray-400 dark:bg-gray-500',
    label:      'text-gray-600 dark:text-gray-300',
    column:     'bg-gray-200 dark:bg-gray-800/30',
    columnOver: 'bg-gray-300 dark:bg-gray-700/40',
    border:     'border-l-gray-300 dark:border-l-gray-600',
    badge:      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    value:      'text-gray-700 dark:text-gray-200',
  },
  qualified: {
    dot:        'bg-blue-500',
    label:      'text-blue-700 dark:text-blue-300',
    column:     'bg-blue-100 dark:bg-blue-950/20',
    columnOver: 'bg-blue-200 dark:bg-blue-900/30',
    border:     'border-l-blue-500',
    badge:      'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300',
    value:      'text-blue-700 dark:text-blue-300',
  },
  proposal: {
    dot:        'bg-violet-500',
    label:      'text-violet-700 dark:text-violet-300',
    column:     'bg-violet-100 dark:bg-violet-950/20',
    columnOver: 'bg-violet-200 dark:bg-violet-900/30',
    border:     'border-l-violet-500',
    badge:      'bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300',
    value:      'text-violet-700 dark:text-violet-300',
  },
  negotiation: {
    dot:        'bg-amber-500',
    label:      'text-amber-700 dark:text-amber-300',
    column:     'bg-amber-100 dark:bg-amber-950/20',
    columnOver: 'bg-amber-200 dark:bg-amber-900/30',
    border:     'border-l-amber-500',
    badge:      'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
    value:      'text-amber-700 dark:text-amber-300',
  },
  closed_won: {
    dot:        'bg-emerald-500',
    label:      'text-emerald-700 dark:text-emerald-300',
    column:     'bg-emerald-100 dark:bg-emerald-950/20',
    columnOver: 'bg-emerald-200 dark:bg-emerald-900/30',
    border:     'border-l-emerald-500',
    badge:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300',
    value:      'text-emerald-700 dark:text-emerald-300',
  },
  closed_lost: {
    dot:        'bg-red-400 dark:bg-red-500',
    label:      'text-red-600 dark:text-red-400',
    column:     'bg-red-100 dark:bg-red-950/20',
    columnOver: 'bg-red-200 dark:bg-red-900/30',
    border:     'border-l-red-400 dark:border-l-red-500',
    badge:      'bg-red-100 text-red-600 dark:bg-red-900/60 dark:text-red-300',
    value:      'text-red-600 dark:text-red-400',
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toLocaleString()}`
}

function buildItems(deals: Deal[]): Record<StageId, string[]> {
  const r: Record<StageId, string[]> = {
    lead: [], qualified: [], proposal: [],
    negotiation: [], closed_won: [], closed_lost: [],
  }
  deals.forEach(d => r[d.stage].push(d.id))
  return r
}

function findContainer(id: string, items: Record<StageId, string[]>): StageId | undefined {
  if (STAGE_IDS.has(id)) return id as StageId
  return (Object.keys(items) as StageId[]).find(s => items[s].includes(id))
}

// ─── Deal card (pure display) ─────────────────────────────────────────────────

interface CardDisplayProps {
  deal: Deal
  contacts: Contact[]
  overlay?: boolean
}

function DealCardDisplay({ deal, contacts, overlay }: CardDisplayProps) {
  const contact = contacts.find(c => c.id === deal.contact_id)
  const cfg = CFG[deal.stage]

  return (
    <div
      className={`
        bg-white dark:bg-gray-900 rounded-xl
        border border-gray-200/80 dark:border-gray-700/60
        border-l-4 ${cfg.border}
        p-3.5 select-none
        ${overlay
          ? 'shadow-2xl ring-2 ring-primary-500/20'
          : 'shadow-sm group-hover:shadow-md transition-shadow duration-150'}
      `}
    >
      {/* Grip dots */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-snug flex-1">
          {deal.name}
        </p>
        <svg
          className="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0 mt-0.5"
          fill="currentColor" viewBox="0 0 20 20"
        >
          <circle cx="7"  cy="4"  r="1.5" />
          <circle cx="13" cy="4"  r="1.5" />
          <circle cx="7"  cy="10" r="1.5" />
          <circle cx="13" cy="10" r="1.5" />
          <circle cx="7"  cy="16" r="1.5" />
          <circle cx="13" cy="16" r="1.5" />
        </svg>
      </div>

      {deal.value > 0 && (
        <p className={`text-base font-bold mb-2 ${cfg.value}`}>
          {formatCurrency(deal.value)}
        </p>
      )}

      {contact && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <div className="w-4 h-4 rounded-full bg-primary-100 dark:bg-primary-950 flex items-center justify-center shrink-0">
            <span className="text-[9px] font-bold text-primary-700 dark:text-primary-300">
              {contact.name[0].toUpperCase()}
            </span>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{contact.name}</span>
        </div>
      )}
    </div>
  )
}

// ─── Sortable deal card ────────────────────────────────────────────────────────

interface DealCardProps {
  deal: Deal
  contacts: Contact[]
  onEdit: (d: Deal) => void
  onDelete: (d: Deal) => void
}

function DealCard({ deal, contacts, onEdit, onDelete }: DealCardProps) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: deal.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(deal)}
      className={`relative group cursor-pointer ${isDragging ? 'opacity-25 scale-[0.98]' : ''} transition-opacity duration-100`}
    >
      <DealCardDisplay deal={deal} contacts={contacts} />

      {/* Delete button - stopPropagation so card click (edit) doesn't fire */}
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onDelete(deal) }}
        className="absolute bottom-2.5 right-2.5 p-1 rounded-lg
          opacity-0 group-hover:opacity-100
          text-gray-400 dark:text-gray-500
          hover:text-red-500 dark:hover:text-red-400
          hover:bg-red-50 dark:hover:bg-red-950
          transition-all duration-150"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  )
}

// ─── Kanban column ─────────────────────────────────────────────────────────────

interface ColumnProps {
  stage: { id: StageId; label: string }
  dealIds: string[]
  allDeals: Deal[]
  contacts: Contact[]
  onEdit: (d: Deal) => void
  onDelete: (d: Deal) => void
  onAdd: (stage: StageId) => void
}

function KanbanColumn({ stage, dealIds, allDeals, contacts, onEdit, onDelete, onAdd }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const cfg = CFG[stage.id]

  const stageDeals = dealIds
    .map(id => allDeals.find(d => d.id === id))
    .filter((d): d is Deal => !!d)

  const totalValue = stageDeals.reduce((s, d) => s + d.value, 0)

  return (
    <div
      className={`
        w-[264px] shrink-0 flex flex-col rounded-2xl
        ${isOver ? cfg.columnOver : cfg.column}
        transition-colors duration-150
      `}
    >
      {/* Column header */}
      <div className="px-3.5 pt-3.5 pb-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <span className={`text-xs font-bold uppercase tracking-wider ${cfg.label}`}>
              {stage.label}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 bg-white/70 dark:bg-gray-900/70 px-1.5 py-0.5 rounded-md tabular-nums">
            {dealIds.length}
          </span>
        </div>
        {totalValue > 0 && (
          <p className={`text-sm font-bold pl-4 mt-0.5 ${cfg.label}`}>
            {formatCurrency(totalValue)}
          </p>
        )}
      </div>

      {/* Cards */}
      <SortableContext items={dealIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className="flex-1 min-h-0 overflow-y-auto px-2 pb-1 space-y-2 scrollbar-thin"
        >
          {stageDeals.map(deal => (
            <DealCard
              key={deal.id}
              deal={deal}
              contacts={contacts}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}

          {/* Empty state */}
          {dealIds.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <p className="text-xs text-gray-400 dark:text-gray-600">No deals</p>
            </div>
          )}
        </div>
      </SortableContext>

      {/* Quick add */}
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={() => onAdd(stage.id)}
        className="m-2 shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl
          text-xs font-medium text-gray-500 dark:text-gray-400
          hover:text-gray-800 dark:hover:text-gray-200
          hover:bg-white/70 dark:hover:bg-gray-900/60
          transition-colors duration-150"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add deal
      </button>
    </div>
  )
}

// ─── Main Deals page ──────────────────────────────────────────────────────────

export default function Deals() {
  const user = useAuthStore(s => s.user)
  const team = useBillingStore(s => s.team)
  const [deals,    setDeals]    = useState<Deal[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [items,      setItems]      = useState<Record<StageId, string[]>>(buildItems([]))
  const [loading,    setLoading]    = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [retryKey,   setRetryKey]   = useState(0)

  // Always-current items for async drag end handler
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null)

  // Modal state
  const [modalOpen,     setModalOpen]     = useState(false)
  const [editDeal,      setEditDeal]      = useState<Deal | null>(null)
  const [defaultStage,  setDefaultStage]  = useState<StageId>('lead')

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null)
  const [isDeleting,   setIsDeleting]   = useState(false)

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // DnD sensors - mouse/trackpad: 8px distance; touch: 250ms hold then drag
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [{ data: dealData, error: dealErr }, { data: contactData, error: contactErr }] = await Promise.all([
        supabase.from('deals').select('*').eq('archived', false).order('created_at', { ascending: true }),
        supabase.from('contacts').select('*').order('name', { ascending: true }),
      ])
      if (dealErr || contactErr) {
        setFetchError((dealErr ?? contactErr)!.message)
        setLoading(false)
        return
      }
      const d = (dealData ?? []) as Deal[]
      const c = (contactData ?? []) as Contact[]
      setDeals(d)
      setContacts(c)
      setItems(buildItems(d))
      setLoading(false)
    }
    load()
  }, [retryKey])

  const activeDeal = activeId ? deals.find(d => d.id === activeId) ?? null : null

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id as string)
  }

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    const activeId = active.id as string
    const overId   = over.id   as string

    setItems(prev => {
      const activeContainer = findContainer(activeId, prev)
      const overContainer   = STAGE_IDS.has(overId)
        ? (overId as StageId)
        : findContainer(overId, prev)

      if (!activeContainer || !overContainer || activeContainer === overContainer) return prev

      const src = [...prev[activeContainer]]
      const dst = [...prev[overContainer]]
      const srcIdx = src.indexOf(activeId)
      src.splice(srcIdx, 1)

      // Drop at end of column if over the column itself, else before the hovered card
      const dstIdx = STAGE_IDS.has(overId) ? dst.length : Math.max(0, dst.indexOf(overId))
      dst.splice(dstIdx, 0, activeId)

      return { ...prev, [activeContainer]: src, [overContainer]: dst }
    })
  }

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    const activeId    = active.id as string
    const currentItems = itemsRef.current

    if (!over) {
      // Dropped outside board - revert visual state
      setItems(buildItems(deals))
      setActiveId(null)
      return
    }

    const overId = over.id as string

    // Handle reorder within same column
    const activeContainer = findContainer(activeId, currentItems)
    const overContainer   = STAGE_IDS.has(overId)
      ? (overId as StageId)
      : findContainer(overId, currentItems)

    if (activeContainer && overContainer && activeContainer === overContainer) {
      const col   = currentItems[activeContainer]
      const aIdx  = col.indexOf(activeId)
      const oIdx  = col.indexOf(overId)
      if (aIdx !== -1 && oIdx !== -1 && aIdx !== oIdx) {
        setItems(prev => ({
          ...prev,
          [activeContainer]: arrayMove(prev[activeContainer], aIdx, oIdx),
        }))
      }
    }

    // Persist stage change to Supabase if needed
    const deal     = deals.find(d => d.id === activeId)
    const newStage = findContainer(activeId, currentItems)

    if (deal && newStage && deal.stage !== newStage) {
      const { error } = await supabase
        .from('deals')
        .update({ stage: newStage })
        .eq('id', activeId)

      if (!error) {
        const updatedDeal = { ...deal, stage: newStage }
        setDeals(prev => prev.map(d => d.id === activeId ? updatedDeal : d))
        setToast({ message: `Moved to ${STAGES.find(s => s.id === newStage)?.label ?? newStage}`, type: 'success' })
        if (team && user) logTeamActivity({ teamId: team.id, userId: user.id, userEmail: user.email ?? '', action: 'stage_changed', entityType: 'deal', entityId: deal.id, entityName: deal.name, details: { from: deal.stage, to: newStage } })

        // Automation: deal_proposal_task
        if (newStage === 'proposal' && user && team) {
          const automations = await getTeamAutomations(team.id)
          if (isEnabled(automations, 'deal_proposal_task')) {
            await runDealProposalTask(updatedDeal, contacts, user.id)
          }
        }
      } else {
        setItems(buildItems(deals))
        setToast({ message: error.message, type: 'error' })
      }
    }

    setActiveId(null)
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const openAdd = (stage: StageId = 'lead') => {
    setEditDeal(null)
    setDefaultStage(stage)
    setModalOpen(true)
  }

  const openEdit = (deal: Deal) => {
    setEditDeal(deal)
    setModalOpen(true)
  }

  const handleSaved = async (saved: Deal, isNew: boolean) => {
    if (isNew) {
      setDeals(prev => {
        const next = [...prev, saved]
        setItems(buildItems(next))
        return next
      })
      setToast({ message: 'Deal created!', type: 'success' })
    } else {
      const prev = deals.find(d => d.id === saved.id)
      setDeals(p => {
        const next = p.map(d => d.id === saved.id ? saved : d)
        setItems(buildItems(next))
        return next
      })
      setToast({ message: 'Deal updated!', type: 'success' })

      // Automation: deal moved to proposal via modal
      if (saved.stage === 'proposal' && prev?.stage !== 'proposal' && user && team) {
        const automations = await getTeamAutomations(team.id)
        if (isEnabled(automations, 'deal_proposal_task')) {
          await runDealProposalTask(saved, contacts, user.id)
        }
      }
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    const { error } = await supabase.from('deals').delete().eq('id', deleteTarget.id)
    if (!error) {
      if (team && user) logTeamActivity({ teamId: team.id, userId: user.id, userEmail: user.email ?? '', action: 'deleted', entityType: 'deal', entityId: deleteTarget.id, entityName: deleteTarget.name })
      setDeals(prev => {
        const next = prev.filter(d => d.id !== deleteTarget.id)
        setItems(buildItems(next))
        return next
      })
      setToast({ message: 'Deal deleted.', type: 'success' })
    } else {
      setToast({ message: error.message, type: 'error' })
    }
    setIsDeleting(false)
    setDeleteTarget(null)
  }

  // ── Summary stats ──────────────────────────────────────────────────────────
  const pipeline = deals
    .filter(d => !['closed_won', 'closed_lost'].includes(d.stage))
    .reduce((s, d) => s + d.value, 0)
  const won      = deals.filter(d => d.stage === 'closed_won').reduce((s, d) => s + d.value, 0)
  const wonCount = deals.filter(d => d.stage === 'closed_won').length

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
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Failed to load deals</p>
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

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950">

      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Deals</h1>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {deals.length} deal{deals.length !== 1 ? 's' : ''}
              </span>
              {pipeline > 0 && (
                <>
                  <span className="text-gray-300 dark:text-gray-700">·</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Pipeline{' '}
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      {formatCurrency(pipeline)}
                    </span>
                  </span>
                </>
              )}
              {wonCount > 0 && (
                <>
                  <span className="text-gray-300 dark:text-gray-700">·</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Won{' '}
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(won)}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            onClick={() => openAdd()}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Deal
          </button>
        </div>
      </div>

      {/* ── Board ── */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 h-full">
            {STAGES.map(stage => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                dealIds={items[stage.id]}
                allDeals={deals}
                contacts={contacts}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onAdd={openAdd}
              />
            ))}
          </div>

          {/* Floating card while dragging */}
          <DragOverlay
            dropAnimation={{
              duration: 180,
              easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
            }}
          >
            {activeDeal && (
              <div className="rotate-1 scale-[1.04]">
                <DealCardDisplay deal={activeDeal} contacts={contacts} overlay />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* ── Modals ── */}
      <DealModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        deal={editDeal}
        contacts={contacts}
        defaultStage={defaultStage}
      />

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Deal"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
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
