import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { useBillingStore } from '../store/billingStore'
import { logTeamActivity } from '../lib/billing'
import type { Contact } from '../types'
import { ContactModal } from '../components/ContactModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Toast } from '../components/Toast'
import {
  type CustomColumnDef,
  MAX_CUSTOM_COLS,
  getColumnDefs,
  saveColumnDefs,
  generateKey,
} from '../lib/contactColumns'

type ToastState = { message: string; type: 'success' | 'error' } | null
type SortBy = 'name' | 'created_at'
type SortDir = 'asc' | 'desc'
type GroupBy = 'none' | 'month' | 'week' | 'company'

// ── Group label helper ────────────────────────────────────────────────────────

function getGroupLabel(dateStr: string, groupBy: GroupBy, company?: string | null): string {
  if (groupBy === 'company') {
    const name = company?.trim()
    return name ? name[0].toUpperCase() + name.slice(1) : '- No Company'
  }
  const date = new Date(dateStr)
  if (groupBy === 'month') {
    return date.toLocaleString('default', { month: 'long', year: 'numeric' })
  }
  if (groupBy === 'week') {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
    const week1 = new Date(d.getFullYear(), 0, 4)
    const weekNum =
      1 +
      Math.round(
        ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
      )
    return `Week ${weekNum}, ${d.getFullYear()}`
  }
  return ''
}

// ── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-950 flex items-center justify-center shrink-0">
      <span className="text-primary-700 dark:text-primary-300 text-xs font-semibold">{initials}</span>
    </div>
  )
}

// ── Empty / No-results ───────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="py-16 flex flex-col items-center justify-center text-center">
      <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">No contacts yet</p>
      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Add your first contact to get started.</p>
      <button
        onClick={onAdd}
        className="mt-4 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
      >
        Add Contact
      </button>
    </div>
  )
}

function NoResults() {
  return (
    <div className="py-12 flex flex-col items-center justify-center text-center">
      <svg className="w-6 h-6 text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <p className="text-sm text-gray-400 dark:text-gray-500">No contacts match your search.</p>
    </div>
  )
}

// ── Manage Columns Modal ─────────────────────────────────────────────────────

function ManageColumnsModal({
  columns,
  onAdd,
  onRemove,
  onClose,
}: {
  columns: CustomColumnDef[]
  onAdd: (label: string) => void
  onRemove: (key: string) => void
  onClose: () => void
}) {
  const [newLabel, setNewLabel] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const MAX_LABEL_LEN = 20

  const handleAdd = () => {
    const trimmed = newLabel.trim()
    if (!trimmed || columns.length >= MAX_CUSTOM_COLS || trimmed.length > MAX_LABEL_LEN) return
    onAdd(trimmed)
    setNewLabel('')
  }

  const inputClass =
    'flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Manage Columns</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Default columns */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Default
            </p>
            <div className="flex flex-wrap gap-1.5">
              {['Name', 'Email', 'Phone', 'Company'].map((col) => (
                <span
                  key={col}
                  className="px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-lg"
                >
                  {col}
                </span>
              ))}
            </div>
          </div>

          {/* Custom columns */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Custom ({columns.length}/{MAX_CUSTOM_COLS})
            </p>
            {columns.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">No custom columns added yet.</p>
            ) : (
              <div className="space-y-1.5">
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300">{col.label}</span>
                    <button
                      onClick={() => onRemove(col.key)}
                      className="p-0.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      title="Remove column"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add new */}
          {columns.length < MAX_CUSTOM_COLS ? (
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value.slice(0, MAX_LABEL_LEN))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                  placeholder="e.g. Location, Status..."
                  maxLength={MAX_LABEL_LEN}
                  autoFocus
                  className={inputClass}
                />
                <button
                  onClick={handleAdd}
                  disabled={!newLabel.trim()}
                  className="px-3 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
              </div>
              <p className={`text-xs text-right pr-1 ${newLabel.length >= MAX_LABEL_LEN ? 'text-amber-500 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`}>
                {newLabel.length}/{MAX_LABEL_LEN}
              </p>
            </div>
          ) : (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg">
              Maximum of {MAX_CUSTOM_COLS} custom columns reached.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Contacts() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const team = useBillingStore((s) => s.team)

  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Sort + group
  const [sortBy, setSortBy] = useState<SortBy>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [groupBy, setGroupBy] = useState<GroupBy>('none')

  // Custom columns
  const [customColumns, setCustomColumns] = useState<CustomColumnDef[]>([])
  const [showManageColumns, setShowManageColumns] = useState(false)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)

  // Single delete
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Bulk selection
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  // Long press detection
  const pressTimerRef = useRef<number | null>(null)
  const longPressActivatedRef = useRef(false)
  const pressStartXRef = useRef(0)

  // Toast
  const [toast, setToast] = useState<ToastState>(null)

  // Horizontal scrollbar (custom, cross-platform)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const customScrollbarRef = useRef<HTMLDivElement>(null)
  const [showStickyScroll, setShowStickyScroll] = useState(false)
  const [scrollbarThumb, setScrollbarThumb] = useState({ width: 0, left: 0 })
  const thumbDragRef = useRef({ active: false, startX: 0, startScrollLeft: 0 })
  const dragScrollRef = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false })

  // Load column defs from Supabase
  useEffect(() => {
    if (user) getColumnDefs(user.id).then(setCustomColumns)
  }, [user])

  useEffect(() => {
    fetchContacts()
  }, [])

  const updateScrollbar = useCallback(() => {
    const el = tableContainerRef.current
    if (!el) return
    const isOverflow = el.scrollWidth > el.clientWidth + 1
    setShowStickyScroll(isOverflow)
    if (!isOverflow) return
    const thumbFrac = el.clientWidth / el.scrollWidth
    const maxScroll = el.scrollWidth - el.clientWidth
    const thumbLeftFrac = maxScroll > 0 ? (el.scrollLeft / maxScroll) * (1 - thumbFrac) : 0
    setScrollbarThumb({ width: thumbFrac * 100, left: thumbLeftFrac * 100 })
  }, [])

  const onTableScroll = useCallback(() => {
    updateScrollbar()
  }, [updateScrollbar])

  const fetchContacts = async () => {
    setIsLoading(true)
    setFetchError(null)
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setFetchError(error.message)
    else setContacts(data as Contact[])
    setIsLoading(false)
  }

  // Filtered + sorted
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const result = q
      ? contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.email?.toLowerCase().includes(q) ||
            c.company?.toLowerCase().includes(q),
        )
      : [...contacts]
    result.sort((a, b) => {
      const cmp =
        sortBy === 'name'
          ? a.name.localeCompare(b.name)
          : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [contacts, search, sortBy, sortDir])

  // Grouped contacts
  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ label: '', contacts: filtered }]
    const map = new Map<string, Contact[]>()
    for (const c of filtered) {
      const label = getGroupLabel(c.created_at, groupBy, c.company)
      if (!map.has(label)) map.set(label, [])
      map.get(label)!.push(c)
    }
    const entries = Array.from(map.entries()).map(([label, contacts]) => ({ label, contacts }))
    if (groupBy === 'company') {
      entries.sort((a, b) => {
        if (a.label === '- No Company') return 1
        if (b.label === '- No Company') return -1
        return a.label.localeCompare(b.label)
      })
    }
    return entries
  }, [filtered, groupBy])

  // Sort toggle
  const toggleSort = (field: SortBy) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortDir(field === 'name' ? 'asc' : 'desc')
    }
  }

  // Group select toggle
  const toggleGroupSelect = (groupContacts: Contact[]) => {
    const ids = groupContacts.map((c) => c.id)
    const allInGroup = ids.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allInGroup) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  // Measure table overflow → update custom scrollbar
  useEffect(() => {
    const el = tableContainerRef.current
    if (!el) return
    updateScrollbar()
    const ro = new ResizeObserver(updateScrollbar)
    ro.observe(el)
    return () => ro.disconnect()
  }, [filtered.length, customColumns.length, selecting, isLoading, updateScrollbar])

  // ── Long press ───────────────────────────────────────────────────────────

  const startPress = useCallback((contactId: string, e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pressStartXRef.current = e.clientX
    longPressActivatedRef.current = false
    pressTimerRef.current = window.setTimeout(() => {
      longPressActivatedRef.current = true
      setSelecting(true)
      setSelectedIds(new Set([contactId]))
    }, 500)
  }, [])

  const cancelPress = useCallback(() => {
    if (pressTimerRef.current !== null) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
  }, [])

  // ── Drag-to-scroll (desktop mouse) + cancel long-press on horizontal move ─

  useEffect(() => {
    const el = tableContainerRef.current
    if (!el) return
    const THRESHOLD = 5

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      dragScrollRef.current = { active: true, startX: e.clientX, scrollLeft: el.scrollLeft, moved: false }
    }

    const handleDocPointerMove = (e: PointerEvent) => {
      // Touch: cancel long-press when finger moves horizontally
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        if (pressTimerRef.current !== null && Math.abs(e.clientX - pressStartXRef.current) > THRESHOLD) {
          cancelPress()
        }
        return
      }
      // Mouse: drag-to-scroll
      if (!dragScrollRef.current.active) return
      const dx = e.clientX - dragScrollRef.current.startX
      if (!dragScrollRef.current.moved && Math.abs(dx) > THRESHOLD) {
        dragScrollRef.current.moved = true
        cancelPress()
      }
      if (dragScrollRef.current.moved) {
        el.scrollLeft = dragScrollRef.current.scrollLeft - dx
        updateScrollbar()
      }
    }

    const handleDocPointerUp = () => {
      dragScrollRef.current.active = false
    }

    el.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('pointermove', handleDocPointerMove)
    document.addEventListener('pointerup', handleDocPointerUp)
    return () => {
      el.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('pointermove', handleDocPointerMove)
      document.removeEventListener('pointerup', handleDocPointerUp)
    }
  }, [cancelPress, updateScrollbar])

  // ── Row click ────────────────────────────────────────────────────────────

  const handleRowClick = (contact: Contact) => {
    if (dragScrollRef.current.moved) return // was a drag, not a click
    if (longPressActivatedRef.current) {
      longPressActivatedRef.current = false
      return
    }
    if (selecting) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(contact.id)) next.delete(contact.id)
        else next.add(contact.id)
        return next
      })
    } else {
      navigate(`/contacts/${contact.id}`)
    }
  }

  const exitSelection = () => {
    setSelecting(false)
    setSelectedIds(new Set())
  }

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map((c) => c.id)))
  }

  // ── Single delete ────────────────────────────────────────────────────────

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    const { error } = await supabase.from('contacts').delete().eq('id', deleteTarget.id)
    if (error) {
      setToast({ message: error.message, type: 'error' })
    } else {
      if (team && user) {
        logTeamActivity({ teamId: team.id, userId: user.id, userEmail: user.email ?? '', action: 'deleted', entityType: 'contact', entityId: deleteTarget.id, entityName: deleteTarget.name })
      }
      setContacts((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      setToast({ message: `${deleteTarget.name} deleted.`, type: 'success' })
    }
    setIsDeleting(false)
    setDeleteTarget(null)
  }

  // ── Bulk delete ──────────────────────────────────────────────────────────

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true)
    const ids = Array.from(selectedIds)
    const { error } = await supabase.from('contacts').delete().in('id', ids)
    if (error) {
      setToast({ message: error.message, type: 'error' })
    } else {
      setContacts((prev) => prev.filter((c) => !selectedIds.has(c.id)))
      setToast({ message: `${ids.length} contact${ids.length !== 1 ? 's' : ''} deleted.`, type: 'success' })
      exitSelection()
    }
    setIsBulkDeleting(false)
    setBulkDeleteOpen(false)
  }

  // ── Modal handlers ───────────────────────────────────────────────────────

  const openAddModal = () => {
    exitSelection()
    setEditContact(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditContact(null)
  }

  const handleSaved = (message: string, saved: Contact) => {
    if (editContact) {
      setContacts((prev) => prev.map((c) => (c.id === saved.id ? saved : c)))
    } else {
      setContacts((prev) => [saved, ...prev])
    }
    closeModal()
    setToast({ message, type: 'success' })
  }

  // ── Column management ────────────────────────────────────────────────────

  const addColumn = (label: string) => {
    if (!user || customColumns.length >= MAX_CUSTOM_COLS) return
    const key = generateKey(label, customColumns.map((c) => c.key))
    const next = [...customColumns, { key, label }]
    setCustomColumns(next)
    saveColumnDefs(user.id, next)
  }

  const removeColumn = (key: string) => {
    if (!user) return
    const next = customColumns.filter((c) => c.key !== key)
    setCustomColumns(next)
    saveColumnDefs(user.id, next)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contacts</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            {contacts.length > 0
              ? `${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`
              : 'Manage your leads and customers.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowManageColumns(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Manage columns"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            Columns
            {customColumns.length > 0 && (
              <span className="w-4 h-4 text-[10px] font-bold bg-primary-600 text-white rounded-full flex items-center justify-center">
                {customColumns.length}
              </span>
            )}
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Contact
          </button>
        </div>
      </div>

      {/* Selection bar */}
      {selecting && (
        <div className="flex items-center justify-between mb-4 px-4 py-2.5 bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800 rounded-xl">
          <div className="flex items-center gap-3">
            <button
              onClick={exitSelection}
              className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Cancel
            </button>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-semibold text-primary-600 dark:text-primary-400">{selectedIds.size}</span>{' '}
              selected
            </span>
          </div>
          <button
            onClick={() => { if (selectedIds.size > 0) setBulkDeleteOpen(true) }}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/70 rounded-lg disabled:opacity-40 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete {selectedIds.size > 0 ? selectedIds.size : ''} selected
          </button>
        </div>
      )}

      {/* Search + Sort/Group toolbar */}
      {contacts.length > 0 && (
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or company..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Sort + Group toolbar */}
      {contacts.length > 0 && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Sort:</span>
            {(['name', 'created_at'] as SortBy[]).map((field) => (
              <button
                key={field}
                onClick={() => toggleSort(field)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  sortBy === field
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {field === 'name' ? 'Name' : 'Date added'}
                {sortBy === field && (
                  <svg
                    className={`w-3 h-3 transition-transform ${sortDir === 'desc' ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

          {/* Group by */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Group:</span>
            {(['none', 'month', 'week', 'company'] as GroupBy[]).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  groupBy === g
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {g === 'none' ? 'None' : g.charAt(0).toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800" style={{ overflow: 'clip' }}>

        {isLoading && (
          <div className="py-16 flex flex-col items-center gap-3">
            <div className="w-7 h-7 border-[3px] border-primary-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400 dark:text-gray-500">Loading contacts...</p>
          </div>
        )}

        {!isLoading && fetchError && (
          <div className="py-12 flex flex-col items-center gap-3 text-center px-4">
            <div className="w-10 h-10 bg-red-100 dark:bg-red-950 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">Failed to load contacts</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{fetchError}</p>
            <button onClick={fetchContacts} className="mt-1 text-sm text-primary-600 dark:text-primary-400 font-medium hover:underline">
              Try again
            </button>
          </div>
        )}

        {!isLoading && !fetchError && contacts.length === 0 && <EmptyState onAdd={openAddModal} />}
        {!isLoading && !fetchError && contacts.length > 0 && filtered.length === 0 && <NoResults />}

        {/* Table */}
        {!isLoading && !fetchError && filtered.length > 0 && (
          <>
            <div
              ref={tableContainerRef}
              onScroll={onTableScroll}
              className="overflow-x-auto select-none [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: 'none', cursor: 'default' }}
            >
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    {selecting && (
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden sm:table-cell">Email</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden md:table-cell">Phone</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden lg:table-cell">Company</th>
                    {customColumns.map((col) => (
                      <th key={col.key} className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                        {col.label}
                      </th>
                    ))}
                    {!selecting && <th className="px-5 py-3 w-10" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {groups.map(({ label, contacts: groupContacts }) => {
                    const colCount =
                      (selecting ? 1 : 0) + 4 + customColumns.length + (!selecting ? 1 : 0)
                    const groupAllSelected =
                      groupContacts.length > 0 && groupContacts.every((c) => selectedIds.has(c.id))
                    return (
                      <Fragment key={label || '__all__'}>
                        {label && (
                          <tr className="bg-gray-50 dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800">
                            <td colSpan={colCount} className="px-5 py-2">
                              <div className="flex items-center gap-3">
                                {selecting && (
                                  <input
                                    type="checkbox"
                                    checked={groupAllSelected}
                                    onChange={() => toggleGroupSelect(groupContacts)}
                                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
                                  />
                                )}
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  {label}
                                </span>
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                  {groupContacts.length} contact{groupContacts.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {groupContacts.map((contact) => {
                          const isSelected = selectedIds.has(contact.id)
                          return (
                            <tr
                              key={contact.id}
                              onClick={() => handleRowClick(contact)}
                              onPointerDown={(e) => startPress(contact.id, e)}
                              onPointerUp={cancelPress}
                              onPointerLeave={cancelPress}
                              onPointerCancel={cancelPress}
                              onContextMenu={(e) => e.preventDefault()}
                              className={`cursor-pointer transition-colors group select-none ${
                                isSelected
                                  ? 'bg-primary-50 dark:bg-primary-950/30 hover:bg-primary-50 dark:hover:bg-primary-950/40'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                              }`}
                            >
                              {selecting && (
                                <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleRowClick(contact)}
                                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
                                  />
                                </td>
                              )}
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <Avatar name={contact.name} />
                                  <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{contact.name}</p>
                                    {contact.email && (
                                      <p className="text-xs text-gray-400 dark:text-gray-500 sm:hidden">{contact.email}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                                {contact.email ?? <span className="text-gray-200 dark:text-gray-700">-</span>}
                              </td>
                              <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">
                                {contact.phone ?? <span className="text-gray-200 dark:text-gray-700">-</span>}
                              </td>
                              <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                                {contact.company ?? <span className="text-gray-200 dark:text-gray-700">-</span>}
                              </td>
                              {customColumns.map((col) => (
                                <td key={col.key} className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell max-w-[160px] truncate">
                                  {contact.custom_fields?.[col.key] || <span className="text-gray-200 dark:text-gray-700">-</span>}
                                </td>
                              ))}
                              {!selecting && (
                                <td className="px-5 py-3.5 text-right">
                                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); navigate(`/contacts/${contact.id}`) }}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/50 transition-colors"
                                      title="View contact"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(contact) }}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                                      title="Delete contact"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

          </>
        )}
      </div>

      {/* Custom horizontal scrollbar - visible on all platforms including mobile */}
      {showStickyScroll && (
        <div className="sticky bottom-4 flex justify-center mt-3 pointer-events-none">
          <div
            ref={customScrollbarRef}
            className="relative pointer-events-auto rounded-full bg-gray-200 dark:bg-gray-700/80"
            style={{ width: '60%', maxWidth: '560px', height: '20px' }}
            onClick={(e) => {
              const el = tableContainerRef.current
              const track = customScrollbarRef.current
              if (!el || !track) return
              const rect = track.getBoundingClientRect()
              const clickPct = (e.clientX - rect.left) / rect.width
              el.scrollLeft = clickPct * (el.scrollWidth - el.clientWidth)
              updateScrollbar()
            }}
          >
            {/* Thumb */}
            <div
              className="absolute top-1.5 bottom-1.5 rounded-full bg-gray-400 dark:bg-gray-500 transition-colors hover:bg-gray-500 dark:hover:bg-gray-400 active:bg-gray-600 dark:active:bg-gray-300 cursor-grab active:cursor-grabbing"
              style={{
                left: `${scrollbarThumb.left}%`,
                width: `${Math.max(scrollbarThumb.width, 8)}%`,
                minWidth: '44px',
              }}
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const el = tableContainerRef.current
                if (!el) return
                thumbDragRef.current = { active: true, startX: e.clientX, startScrollLeft: el.scrollLeft }
                ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                if (!thumbDragRef.current.active) return
                const el = tableContainerRef.current
                const track = customScrollbarRef.current
                if (!el || !track) return
                const dx = e.clientX - thumbDragRef.current.startX
                const thumbFrac = el.clientWidth / el.scrollWidth
                const maxScroll = el.scrollWidth - el.clientWidth
                const availableTrack = track.clientWidth * (1 - thumbFrac)
                const ratio = availableTrack > 0 ? maxScroll / availableTrack : 0
                el.scrollLeft = thumbDragRef.current.startScrollLeft + dx * ratio
                updateScrollbar()
              }}
              onPointerUp={() => { thumbDragRef.current.active = false }}
              onPointerCancel={() => { thumbDragRef.current.active = false }}
            />
          </div>
        </div>
      )}

      {/* Manage columns modal */}
      {showManageColumns && (
        <ManageColumnsModal
          columns={customColumns}
          onAdd={addColumn}
          onRemove={removeColumn}
          onClose={() => setShowManageColumns(false)}
        />
      )}

      {/* Add/edit contact modal */}
      {modalOpen && (
        <ContactModal
          contact={editContact}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}

      {/* Single delete */}
      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${deleteTarget.name}?`}
          message="This action cannot be undone. The contact will be permanently removed."
          confirmLabel="Delete contact"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          isLoading={isDeleting}
        />
      )}

      {/* Bulk delete */}
      {bulkDeleteOpen && (
        <ConfirmDialog
          title={`Delete ${selectedIds.size} contact${selectedIds.size !== 1 ? 's' : ''}?`}
          message="This action cannot be undone. All selected contacts will be permanently removed."
          confirmLabel={`Delete ${selectedIds.size} contact${selectedIds.size !== 1 ? 's' : ''}`}
          onConfirm={handleBulkDelete}
          onCancel={() => setBulkDeleteOpen(false)}
          isLoading={isBulkDeleting}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  )
}
