import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { Contact } from '../types'
import { ContactModal } from '../components/ContactModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Toast } from '../components/Toast'

type ToastState = { message: string; type: 'success' | 'error' } | null

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

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Toast
  const [toast, setToast] = useState<ToastState>(null)

  useEffect(() => {
    fetchContacts()
  }, [])

  const fetchContacts = async () => {
    setIsLoading(true)
    setFetchError(null)
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setFetchError(error.message)
    } else {
      setContacts(data as Contact[])
    }
    setIsLoading(false)
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return contacts
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q),
    )
  }, [contacts, search])

  const openAddModal = () => {
    setEditContact(null)
    setModalOpen(true)
  }

  const openEditModal = (contact: Contact) => {
    setEditContact(contact)
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

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)

    const { error } = await supabase.from('contacts').delete().eq('id', deleteTarget.id)

    if (error) {
      setToast({ message: error.message, type: 'error' })
    } else {
      setContacts((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      setToast({ message: `${deleteTarget.name} deleted.`, type: 'success' })
    }
    setIsDeleting(false)
    setDeleteTarget(null)
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contacts</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            {contacts.length > 0 ? `${contacts.length} contact${contacts.length !== 1 ? 's' : ''}` : 'Manage your leads and customers.'}
          </p>
        </div>
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

      {/* Search */}
      {contacts.length > 0 && (
        <div className="relative mb-4">
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

      {/* Table card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">

        {/* Loading */}
        {isLoading && (
          <div className="py-16 flex flex-col items-center gap-3">
            <div className="w-7 h-7 border-[3px] border-primary-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400 dark:text-gray-500">Loading contacts...</p>
          </div>
        )}

        {/* Fetch error */}
        {!isLoading && fetchError && (
          <div className="py-12 flex flex-col items-center gap-3 text-center px-4">
            <div className="w-10 h-10 bg-red-100 dark:bg-red-950 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">Failed to load contacts</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{fetchError}</p>
            <button
              onClick={fetchContacts}
              className="mt-1 text-sm text-primary-600 dark:text-primary-400 font-medium hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !fetchError && contacts.length === 0 && (
          <EmptyState onAdd={openAddModal} />
        )}

        {/* No search results */}
        {!isLoading && !fetchError && contacts.length > 0 && filtered.length === 0 && (
          <NoResults />
        )}

        {/* Table */}
        {!isLoading && !fetchError && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden sm:table-cell">Email</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden md:table-cell">Phone</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden lg:table-cell">Company</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {filtered.map((contact) => (
                  <tr
                    key={contact.id}
                    onClick={() => openEditModal(contact)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors group"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={contact.name} />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{contact.name}</p>
                          {/* Show email under name on mobile */}
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
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget(contact)
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-all"
                        title="Delete contact"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <ContactModal
          contact={editContact}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}

      {/* Delete confirmation */}
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

      {/* Toast */}
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
