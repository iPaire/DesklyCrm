import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import {
  buildAuthUrl,
  listMessages,
  getMessageDetail,
  refreshAccessToken,
  extractEmailAddress,
  stripHtml,
} from '../lib/gmail'
import type { GmailConnection, EmailLog } from '../types'
import { getUserAutomations, isEnabled, runEmailFollowupTask } from '../lib/automations'

interface SyncProgress {
  processed: number
  total:     number
  saved:     number
}

type SyncStatus = 'idle' | 'syncing' | 'done' | 'error'

interface Props {
  onToast: (message: string, type: 'success' | 'error') => void
}

export function GmailSettingsPanel({ onToast }: Props) {
  const user = useAuthStore(s => s.user)
  const [connection, setConnection]         = useState<GmailConnection | null>(null)
  const [loading, setLoading]               = useState(true)
  const [syncStatus, setSyncStatus]         = useState<SyncStatus>('idle')
  const [progress, setProgress]             = useState<SyncProgress>({ processed: 0, total: 0, saved: 0 })
  const [syncError, setSyncError]           = useState('')
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const syncAbortRef = useRef(false)

  useEffect(() => {
    if (!user) return
    loadConnection()
  }, [user])

  const loadConnection = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('gmail_connections')
      .select('*')
      .eq('user_id', user!.id)
      .maybeSingle()
    setConnection(data ?? null)
    setLoading(false)
  }

  // Returns a valid access token, refreshing if expired
  const getValidToken = useCallback(async (conn: GmailConnection): Promise<string> => {
    const now    = Date.now()
    const expiry = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0
    const bufferMs = 5 * 60 * 1000 // refresh 5 min before expiry

    if (conn.access_token && expiry - now > bufferMs) {
      return conn.access_token
    }

    if (!conn.refresh_token) throw new Error('No refresh token - please reconnect Gmail.')

    const tokens   = await refreshAccessToken(conn.refresh_token)
    const newExpiry = new Date(now + tokens.expires_in * 1000).toISOString()

    const { data } = await supabase
      .from('gmail_connections')
      .update({ access_token: tokens.access_token, token_expiry: newExpiry })
      .eq('user_id', user!.id)
      .select()
      .single()

    if (data) setConnection(data as GmailConnection)
    return tokens.access_token
  }, [user])

  const runSync = useCallback(async (conn: GmailConnection) => {
    if (!user) return
    syncAbortRef.current = false
    setSyncStatus('syncing')
    setSyncError('')
    setProgress({ processed: 0, total: 0, saved: 0 })

    try {
      const accessToken = await getValidToken(conn)

      // Load contacts that have an email address (team-wide via RLS)
      const { data: contacts, error: contactsErr } = await supabase
        .from('contacts')
        .select('id, email, name')
        .not('email', 'is', null)

      if (contactsErr) throw new Error(contactsErr.message)
      if (!contacts || contacts.length === 0) {
        onToast('No contacts with email addresses found to match against.', 'error')
        setSyncStatus('idle')
        return
      }

      // Build lookup map: lowercase email → contact
      const contactMap = new Map<string, { id: string; email: string; name: string }>()
      for (const c of contacts) {
        if (c.email) contactMap.set(c.email.toLowerCase().trim(), c)
      }

      // Fetch last 30 days of emails (sent + received)
      const messages = await listMessages(accessToken, 'newer_than:30d', 500)
      setProgress({ processed: 0, total: messages.length, saved: 0 })

      // Load automations once before the loop
      const automations = await getUserAutomations(user.id)
      const followupEnabled = isEnabled(automations, 'email_followup_task')

      let saved = 0

      for (let i = 0; i < messages.length; i++) {
        if (syncAbortRef.current) break

        try {
          const email = await getMessageDetail(accessToken, messages[i].id)

          const fromAddr = extractEmailAddress(email.from)
          const toAddrs  = email.to.split(',').map(a => extractEmailAddress(a.trim()))

          // Find matching contact in this email's participants
          let matchedContact: { id: string; email: string; name: string } | undefined
          matchedContact = contactMap.get(fromAddr)
          if (!matchedContact) {
            for (const addr of toAddrs) {
              matchedContact = contactMap.get(addr)
              if (matchedContact) break
            }
          }

          if (!matchedContact) {
            setProgress(p => ({ ...p, processed: i + 1 }))
            continue
          }

          // Determine direction relative to the connected Gmail account
          const gmailAddr = conn.gmail_email.toLowerCase()
          const direction: 'sent' | 'received' = fromAddr === gmailAddr ? 'sent' : 'received'

          // Build plain-text preview (max 200 chars)
          const bodyText  = email.bodyPlain || stripHtml(email.bodyHtml)
          const preview   = bodyText.trim().slice(0, 200)

          const { data: upserted, error: upsertErr } = await supabase
            .from('email_logs')
            .upsert(
              {
                user_id:          user.id,
                contact_id:       matchedContact.id,
                gmail_message_id: email.messageId,
                thread_id:        email.threadId,
                subject:          email.subject,
                from_email:       email.from,
                to_email:         email.to,
                body_preview:     preview,
                body_full:        email.bodyHtml || email.bodyPlain,
                received_at:      email.date ? new Date(email.date).toISOString() : new Date().toISOString(),
                direction,
              },
              { onConflict: 'user_id,gmail_message_id' },
            )
            .select()
            .single()

          if (!upsertErr) {
            saved++
            // Automation: email_followup_task (only for sent emails, and only when newly inserted)
            if (followupEnabled && direction === 'sent' && upserted) {
              await runEmailFollowupTask(
                upserted as EmailLog,
                matchedContact as any,
                user.id,
              )
            }
          }
        } catch {
          // Skip individual message failures silently
        }

        setProgress({ processed: i + 1, total: messages.length, saved })
      }

      // Update last_sync timestamp
      const { data: updated } = await supabase
        .from('gmail_connections')
        .update({ last_sync: new Date().toISOString() })
        .eq('user_id', user.id)
        .select()
        .single()

      if (updated) setConnection(updated as GmailConnection)

      setSyncStatus('done')
      onToast(`Synced ${saved} email${saved !== 1 ? 's' : ''} from the last 30 days.`, 'success')
    } catch (e: any) {
      setSyncError(e.message ?? 'Sync failed.')
      setSyncStatus('error')
      onToast(e.message ?? 'Email sync failed. Please try again.', 'error')
    }
  }, [user, getValidToken, onToast])

  const handleConnect = () => {
    window.location.href = buildAuthUrl()
  }

  const handleDisconnect = async () => {
    if (!user || !connection) return
    setIsDisconnecting(true)
    await supabase.from('gmail_connections').delete().eq('user_id', user.id)
    setConnection(null)
    setSyncStatus('idle')
    setIsDisconnecting(false)
    onToast('Gmail disconnected.', 'success')
  }

  const handleSyncNow = () => {
    if (connection) runSync(connection)
  }

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-32 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-2.5 w-48 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        </div>
      </div>
    )
  }

  // ── Not connected ──
  if (!connection) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <div className="w-9 h-9 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center shrink-0">
            <GmailIcon />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Not connected</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Connect Gmail to automatically sync emails with your CRM contacts.
            </p>
          </div>
        </div>

        <button
          onClick={handleConnect}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-semibold rounded-xl transition-colors shadow-sm"
        >
          <GmailIcon />
          Connect Gmail Account
        </button>
      </div>
    )
  }

  // ── Connected ──
  const lastSyncLabel = connection.last_sync
    ? formatRelative(connection.last_sync)
    : 'Never synced'

  return (
    <div className="space-y-4">
      {/* Status badge */}
      <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white dark:bg-gray-800 border border-emerald-200 dark:border-emerald-700 flex items-center justify-center shrink-0">
            <GmailIcon />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{connection.gmail_email}</p>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Connected
              </span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Last sync: {lastSyncLabel}</p>
          </div>
        </div>
        <button
          onClick={handleDisconnect}
          disabled={isDisconnecting || syncStatus === 'syncing'}
          className="text-xs font-medium text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-40 transition-colors"
        >
          {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>

      {/* Sync progress / status */}
      {syncStatus === 'syncing' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin inline-block" />
              Syncing emails...
            </span>
            <span>
              {progress.total > 0
                ? `${progress.processed} / ${progress.total} processed · ${progress.saved} saved`
                : 'Fetching email list...'}
            </span>
          </div>
          {progress.total > 0 && (
            <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((progress.processed / progress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {syncStatus === 'done' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
          <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            Synced {progress.saved} email{progress.saved !== 1 ? 's' : ''} from the last 30 days.
          </p>
        </div>
      )}

      {syncStatus === 'error' && syncError && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/30 rounded-lg">
          <svg className="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-red-600 dark:text-red-400">{syncError}</p>
        </div>
      )}

      {/* Sync now button */}
      <button
        onClick={handleSyncNow}
        disabled={syncStatus === 'syncing'}
        className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-300 dark:border-gray-700 hover:border-primary-400 dark:hover:border-primary-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
      >
        {syncStatus === 'syncing' ? (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        )}
        {syncStatus === 'syncing' ? 'Syncing…' : 'Sync Now (Last 30 Days)'}
      </button>

      <p className="text-[11px] text-gray-400 dark:text-gray-600 text-center">
        Only emails to/from your CRM contacts are synced.
      </p>
    </div>
  )
}

// ── Gmail "G" icon (SVG) ──────────────────────────────────────────────────────

function GmailIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
    </svg>
  )
}

// ── Relative time formatter ───────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 2)  return 'Just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}
