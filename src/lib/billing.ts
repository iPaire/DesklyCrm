import { supabase } from './supabase'

export const TRIAL_DAYS = 14

export interface Team {
  id: string
  owner_id: string
  owner_email: string | null
  name: string | null
  trial_start: string
  trial_extended_days: number
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: 'trialing' | 'active' | 'canceled' | 'past_due' | 'unpaid' | 'ended'
  seats: number
  current_period_end: string | null
  created_at: string
  updated_at: string
}

export interface TeamMember {
  id: string
  team_id: string
  user_id: string | null
  email: string
  role: 'owner' | 'member'
  status: 'pending' | 'active' | 'denied'
  invite_token: string
  invited_at: string
  joined_at: string | null
  has_paid_seat: boolean
}

export interface TeamActivityLog {
  id: string
  team_id: string
  user_id: string | null
  user_email: string | null
  action: 'created' | 'updated' | 'deleted' | 'completed' | 'stage_changed'
  entity_type: 'contact' | 'deal' | 'task'
  entity_id: string | null
  entity_name: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export interface TrialInfo {
  daysElapsed: number
  daysRemaining: number
  isExpired: boolean
  progress: number // 0-100
  totalDays: number
}

export function getTrialInfo(trialStart: string, extendedDays = 0): TrialInfo {
  const totalDays = TRIAL_DAYS + extendedDays
  const daysElapsed = Math.floor(
    (Date.now() - new Date(trialStart).getTime()) / (1000 * 60 * 60 * 24),
  )
  const daysRemaining = Math.max(0, totalDays - daysElapsed)
  const isExpired = daysElapsed >= totalDays
  const progress = Math.min(100, Math.round((daysElapsed / totalDays) * 100))
  return { daysElapsed, daysRemaining, isExpired, progress, totalDays }
}

export function isSubscribed(team: Team | null): boolean {
  return team?.subscription_status === 'active'
}

// ─── Team CRUD ────────────────────────────────────────────────────────────────

/** Ensure a team exists for the user. Idempotent - handles the case where a team exists but
 *  the owner team_members row is missing (e.g. after being removed from another team).
 *  Pass userCreatedAt (from auth.users.created_at) so the trial starts from the real signup date. */
export async function ensureTeam(userId: string, userEmail: string, userCreatedAt?: string): Promise<Team | null> {
  const now = new Date().toISOString()

  // Check if team already exists for this user (avoids 409 conflict on insert)
  const { data: existing } = await supabase
    .from('teams')
    .select('*')
    .eq('owner_id', userId)
    .maybeSingle()

  if (existing) {
    // Ensure the owner membership row exists (may be absent if trigger had issues)
    await supabase
      .from('team_members')
      .upsert(
        { team_id: existing.id, user_id: userId, email: userEmail, role: 'owner', status: 'active', joined_at: now },
        { onConflict: 'team_id,email' },
      )
    return existing as Team
  }

  // No team exists - create one. Use the real signup date so the trial isn't reset to today.
  const trialStart = userCreatedAt ?? now
  const { data, error } = await supabase
    .from('teams')
    .insert({ owner_id: userId, owner_email: userEmail, name: userEmail, trial_start: trialStart })
    .select()
    .single()
  if (error) return null

  await supabase
    .from('team_members')
    .insert({ team_id: data.id, user_id: userId, email: userEmail, role: 'owner', status: 'active', joined_at: now })

  return data as Team
}

/** Fetch team where the user is the owner. */
export async function getTeam(userId: string) {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('owner_id', userId)
    .maybeSingle()
  return { team: data as Team | null, error }
}

/**
 * Unified team + role lookup for both owners and members.
 * Returns the team the user belongs to and their role in it.
 *
 * Priority: if the user is an active MEMBER of someone else's team (invited),
 * that team takes precedence over their auto-created solo owned team.
 * This prevents the trigger-created solo team from shadowing the real team.
 */
export async function getTeamAndRole(
  userId: string,
): Promise<{ team: Team | null; role: 'owner' | 'member' | null; membershipFound: boolean; hasPaidSeat: boolean; memberJoinedAt: string | null }> {
  const { data: memberships } = await supabase
    .from('team_members')
    .select('team_id, role, has_paid_seat, joined_at')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (!memberships || memberships.length === 0) {
    return { team: null, role: null, membershipFound: false, hasPaidSeat: false, memberJoinedAt: null }
  }

  const membership = memberships.find(m => m.role === 'member') ?? memberships[0]

  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('id', membership.team_id)
    .single()

  // Owner always has paid seat if team is subscribed
  const hasPaidSeat = membership.role === 'owner'
    ? (team as Team | null)?.subscription_status === 'active'
    : (membership.has_paid_seat ?? false)

  return {
    team: team as Team | null,
    role: membership.role as 'owner' | 'member',
    membershipFound: true,
    hasPaidSeat,
    memberJoinedAt: membership.role === 'member' ? (membership.joined_at ?? null) : null,
  }
}

export async function getTeamMembers(teamId: string) {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('team_id', teamId)
    .order('invited_at', { ascending: true })
  return { members: (data ?? []) as TeamMember[], error }
}

export async function inviteMember(teamId: string, email: string) {
  const { data, error } = await supabase
    .from('team_members')
    .insert({ team_id: teamId, email: email.toLowerCase().trim(), role: 'member', status: 'pending' })
    .select()
    .single()
  return { member: data as TeamMember | null, error }
}

export async function resendInvite(memberId: string) {
  // Fresh token + reset invited_at timestamp
  const { data, error } = await supabase
    .from('team_members')
    .update({
      invite_token: crypto.randomUUID(),
      invited_at: new Date().toISOString(),
    })
    .eq('id', memberId)
    .select()
    .single()
  return { member: data as TeamMember | null, error }
}

export async function removeMember(memberId: string) {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', memberId)
  return { error }
}

export async function cancelInvite(memberId: string) {
  return removeMember(memberId)
}

export async function declineInvite(inviteToken: string) {
  const { error } = await supabase
    .from('team_members')
    .update({ status: 'denied' })
    .eq('invite_token', inviteToken)
    .eq('status', 'pending')
  return { error }
}

export async function acceptInvite(inviteToken: string, userId: string) {
  const { data, error } = await supabase
    .from('team_members')
    .update({ status: 'active', user_id: userId, joined_at: new Date().toISOString() })
    .eq('invite_token', inviteToken)
    .select()
    .single()
  return { member: data as TeamMember | null, error }
}

export async function getInviteByToken(token: string) {
  const { data, error } = await supabase
    .from('team_members')
    .select('*, teams(name, owner_email)')
    .eq('invite_token', token)
    .single()
  return { invite: data, error }
}

/** Check if user is already a member of any team (other than `excludeTeamId`). */
export async function getUserActiveMembership(userId: string) {
  const { data } = await supabase
    .from('team_members')
    .select('id, team_id, role')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  return data as { id: string; team_id: string; role: string } | null
}

/** Returns the user_id if an account with this email already exists (registered users appear in team_members with a non-null user_id). */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const { data } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('email', email.toLowerCase().trim())
    .not('user_id', 'is', null)
    .maybeSingle()
  return data?.user_id ?? null
}

// ─── Invite email via edge function ──────────────────────────────────────────

export async function sendInviteEmail(params: {
  email: string
  inviteToken: string
  inviterEmail: string
  teamName: string | null
}) {
  const { error } = await supabase.functions.invoke('send-invite', {
    body: {
      ...params,
      siteUrl: window.location.origin,
    },
  })
  return { error }
}

// ─── Team Activity Logs ───────────────────────────────────────────────────────

/** Fire-and-forget: log a member action. Silently ignores failures. */
export async function logTeamActivity(params: {
  teamId: string
  userId: string
  userEmail: string
  action: TeamActivityLog['action']
  entityType: TeamActivityLog['entity_type']
  entityId?: string
  entityName?: string
  details?: Record<string, unknown>
}): Promise<void> {
  try {
    await supabase.from('team_activity_logs').insert({
      team_id:     params.teamId,
      user_id:     params.userId,
      user_email:  params.userEmail,
      action:      params.action,
      entity_type: params.entityType,
      entity_id:   params.entityId ?? null,
      entity_name: params.entityName ?? null,
      details:     params.details ?? null,
    })
  } catch {
    // non-blocking - never disrupt user flow
  }
}

/** Fetch activity logs for a team. If userId is provided, filters to that member. */
export async function getMemberActivity(teamId: string, userId?: string) {
  let query = supabase
    .from('team_activity_logs')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (userId) query = query.eq('user_id', userId)

  const { data, error } = await query
  return { logs: (data ?? []) as TeamActivityLog[], error }
}

// ─── Stripe Subscription Management ──────────────────────────────────────────

/** Fire-and-forget: sync the Stripe subscription quantity to match active member count. */
export async function syncSubscriptionQuantity(teamId: string): Promise<void> {
  try {
    await supabase.functions.invoke('update-subscription', {
      body: { team_id: teamId },
    })
  } catch {
    // non-blocking
  }
}

/** Open the Stripe Customer Portal for the team owner to manage billing. */
export async function getStripePortalUrl(): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('stripe-portal', {
    body: {},
  })
  if (error) {
    let detail = error.message
    try {
      const body = await (error as any).context?.json()
      if (body) detail = body.error ?? body.message ?? detail
    } catch {}
    return { url: null, error: detail ?? 'Failed to open billing portal' }
  }
  return { url: data?.url ?? null, error: null }
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

/** Returns a fresh access_token, refreshing if expired. Never calls refreshSession() blindly. */
async function getFreshToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  // Decode JWT expiry - JWTs use base64URL (- and _), atob needs standard base64 (+ and /)
  try {
    const b64 = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '=')))
    const expiresAt = payload.exp * 1000
    if (expiresAt > Date.now() + 10_000) {
      // Token still valid for at least 10s - use it
      return session.access_token
    }
  } catch { /* malformed token - fall through to refresh */ }

  // Token expired or malformed - refresh
  const { data: refreshed, error } = await supabase.auth.refreshSession()
  if (error || !refreshed.session) return null
  return refreshed.session.access_token
}

/** Silently checks Stripe for an existing active subscription and fixes the DB if out of sync.
 *  Called automatically at login - never creates a checkout session. */
export async function checkAndRestoreSubscription(): Promise<{ restored: boolean }> {
  const token = await getFreshToken()
  if (!token) return { restored: false }
  const { error } = await supabase.functions.invoke('stripe-checkout', {
    body: { check_only: true },
    headers: { Authorization: `Bearer ${token}` },
  })
  if (error) {
    let detail = ''
    try { const b = await (error as any).context?.json(); detail = b?.error ?? '' } catch {}
    return { restored: detail === 'already_subscribed' }
  }
  // data.subscribed === false means no subscription found - nothing to restore
  return { restored: false }
}

// ─── Stripe Checkout ─────────────────────────────────────────────────────────

export async function startStripeCheckout(): Promise<{ url: string | null; error: string | null }> {
  const token = await getFreshToken()
  if (!token) return { url: null, error: 'session_expired' }

  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: { origin: window.location.origin },
    headers: { Authorization: `Bearer ${token}` },
  })
  if (error) {
    let detail = error.message
    try {
      const body = await (error as any).context?.json()
      if (body) detail = body.error ?? body.message ?? detail
    } catch {}
    console.error('stripe-checkout error:', detail)
    if (typeof detail === 'string') {
      if (detail === 'already_subscribed') {
        return { url: null, error: 'already_subscribed' }
      }
      // Only treat as session error when Supabase/JWT gateway explicitly rejects the token
      if (detail.toLowerCase().includes('jwt') || detail === 'Unauthorized') {
        return { url: null, error: 'session_expired' }
      }
    }
    return { url: null, error: detail ?? 'Failed to start checkout' }
  }
  return { url: data?.url ?? null, error: null }
}

/** Activate a paid seat for a specific team member. If subscribed, prorates Stripe immediately. */
export async function activateMemberSeat(
  teamId: string,
  memberId: string,
): Promise<{ error: string | null }> {
  // Mark member as having a paid seat
  const { error: updateErr } = await supabase
    .from('team_members')
    .update({ has_paid_seat: true })
    .eq('id', memberId)
  if (updateErr) return { error: updateErr.message }

  // Sync Stripe subscription quantity (prorated charge happens automatically)
  await syncSubscriptionQuantity(teamId)
  return { error: null }
}
