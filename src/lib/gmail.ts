// ─── Gmail OAuth + REST API helpers ──────────────────────────────────────────
//
// Setup:
//  1. Create a project in Google Cloud Console
//  2. Enable the Gmail API
//  3. Create OAuth 2.0 credentials (Web application)
//  4. Add authorized redirect URI: http://localhost:5173/settings/gmail/callback
//  5. Add to .env:
//       VITE_GOOGLE_CLIENT_ID=your_client_id
//       VITE_GOOGLE_CLIENT_SECRET=your_client_secret   ← keep backend-only in production
//
// Note: In production, the token exchange (exchangeCode / refreshAccessToken)
// should be proxied through a backend endpoint to keep the client_secret secure.
// ─────────────────────────────────────────────────────────────────────────────

const CLIENT_ID     = import.meta.env.VITE_GOOGLE_CLIENT_ID as string
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string
const REDIRECT_URI  = `${window.location.origin}/settings/gmail/callback`

const AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

// ── OAuth URL ─────────────────────────────────────────────────────────────────

export function buildAuthUrl(): string {
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
  })
  return `${AUTH_URL}?${params}`
}

// ── Token types ───────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token:   string
  refresh_token?: string
  expires_in:     number
  token_type:     string
}

// ── Token exchange (authorization code → tokens) ──────────────────────────────

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed: ${text}`)
  }
  return res.json()
}

// ── Token refresh ─────────────────────────────────────────────────────────────

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token refresh failed: ${text}`)
  }
  return res.json()
}

// ── Gmail profile ─────────────────────────────────────────────────────────────

export async function getGmailProfile(accessToken: string): Promise<{ emailAddress: string; messagesTotal: number }> {
  const res = await fetch(`${GMAIL_API}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Gmail profile error: ${await res.text()}`)
  return res.json()
}

// ── List messages ─────────────────────────────────────────────────────────────

export interface GmailMessageRef {
  id:       string
  threadId: string
}

export async function listMessages(
  accessToken: string,
  query: string,
  maxResults = 500,
): Promise<GmailMessageRef[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) })
  const res = await fetch(`${GMAIL_API}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`List messages error: ${await res.text()}`)
  const data = await res.json()
  return data.messages ?? []
}

// ── Parsed email ──────────────────────────────────────────────────────────────

export interface ParsedEmail {
  messageId: string
  threadId:  string
  subject:   string
  from:      string
  to:        string
  date:      string
  bodyPlain: string
  bodyHtml:  string
}

// Decode Gmail's URL-safe base64
function decodeBase64Url(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    )
  } catch {
    return atob(base64)
  }
}

// Recursively extract text/plain and text/html parts from MIME payload
function extractBody(payload: Record<string, any>): { plain: string; html: string } {
  let plain = ''
  let html  = ''

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data)
    if (payload.mimeType === 'text/html')  html  = decoded
    else                                   plain = decoded
  }

  if (payload.parts) {
    for (const part of payload.parts as Record<string, any>[]) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        plain = decodeBase64Url(part.body.data)
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        html = decodeBase64Url(part.body.data)
      } else if (part.parts) {
        const nested = extractBody(part)
        if (!plain && nested.plain) plain = nested.plain
        if (!html  && nested.html)  html  = nested.html
      }
    }
  }

  return { plain, html }
}

// ── Get full message detail ───────────────────────────────────────────────────

export async function getMessageDetail(
  accessToken: string,
  messageId: string,
): Promise<ParsedEmail> {
  const res = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Get message error: ${await res.text()}`)
  const msg = await res.json()

  const headers: Record<string, string> = {}
  for (const h of (msg.payload?.headers ?? []) as { name: string; value: string }[]) {
    headers[h.name.toLowerCase()] = h.value
  }

  const { plain, html } = extractBody(msg.payload ?? {})

  return {
    messageId: msg.id,
    threadId:  msg.threadId,
    subject:   headers['subject'] ?? '(no subject)',
    from:      headers['from']    ?? '',
    to:        headers['to']      ?? '',
    date:      headers['date']    ?? '',
    bodyPlain: plain,
    bodyHtml:  html,
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

// Extract bare email address from "Display Name <email@example.com>"
export function extractEmailAddress(str: string): string {
  const match = str.match(/<([^>]+)>/)
  return (match ? match[1] : str).toLowerCase().trim()
}

// Strip HTML tags for plain-text preview
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
