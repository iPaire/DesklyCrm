import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import ContactModal from '../components/ContactModal';

const API = 'http://localhost:5000/api/contacts';

const STATUS_BADGE = {
  lead:     'bg-yellow-100 text-yellow-700',
  prospect: 'bg-blue-100 text-blue-700',
  customer: 'bg-green-100 text-green-700',
  churned:  'bg-slate-100 text-slate-500',
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // contact to edit
  const [deleteTarget, setDeleteTarget] = useState(null); // contact to delete
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // Fetch contacts
  const fetchContacts = useCallback(async (query = '') => {
    setLoading(true);
    setApiError('');
    try {
      const { data } = await axios.get(API, { params: { search: query } });
      setContacts(data);
    } catch {
      setApiError('Could not connect to the server. Is it running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const delay = setTimeout(() => fetchContacts(search), 300);
    return () => clearTimeout(delay);
  }, [search, fetchContacts]);

  // Save (create or update)
  const handleSave = async (form) => {
    if (editing) {
      await axios.put(`${API}/${editing.id}`, form);
    } else {
      await axios.post(API, form);
    }
    setEditing(null);
    fetchContacts(search);
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await axios.delete(`${API}/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchContacts(search);
    } finally {
      setDeleteLoading(false);
    }
  };

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (c) => { setEditing(c); setModalOpen(true); };

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Contacts</h1>
          <p className="text-slate-500 text-sm mt-0.5">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={openAdd}
          className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-xl text-sm transition-colors shadow-sm"
        >
          + Add Contact
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">🔍</span>
        <input
          type="text"
          placeholder="Search by name, email or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xl leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Error banner */}
      {apiError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
          {apiError}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Loading...</div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-400 text-4xl mb-3">👥</p>
            <p className="text-slate-600 font-medium">No contacts found</p>
            <p className="text-slate-400 text-sm mt-1">
              {search ? 'Try a different search term' : 'Click "Add Contact" to get started'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 font-medium text-slate-500">Name</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Email</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Phone</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Company</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {contacts.map((c, i) => (
                <tr
                  key={c.id}
                  className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i === contacts.length - 1 ? 'border-0' : ''}`}
                >
                  <td className="px-5 py-3.5 font-medium text-slate-900">
                    {c.first_name} {c.last_name}
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">{c.email || '-'}</td>
                  <td className="px-5 py-3.5 text-slate-500">{c.phone || '-'}</td>
                  <td className="px-5 py-3.5 text-slate-500">{c.company || '-'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[c.status] || ''}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(c)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit Modal */}
      <ContactModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        contact={editing}
      />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setDeleteTarget(null)}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Delete Contact</h2>
            <p className="text-slate-500 text-sm mb-6">
              Are you sure you want to delete{' '}
              <span className="font-medium text-slate-800">
                {deleteTarget.first_name} {deleteTarget.last_name}
              </span>
              ? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
