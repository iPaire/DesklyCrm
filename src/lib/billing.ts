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
  subscription_status: 'trialing' | 'active' | 'canceled' | 'past_due' | 'unpaid'
  seats: number
  created_at: string
  updated_at: string
}

export interface TeamMember {
  id: string
  team_id: string
  user_id: string | null
  email: string
  role: 'owner' | 'member'
  status: 'pending' | 'active'
  invite_token: string
  invited_at: string
  joined_at: string | null
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

export async function getTeam(userId: string) {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('owner_id', userId)
    .maybeSingle()
  return { team: data as Team | null, error }
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

export async function removeMember(memberId: string) {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', memberId)
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

// ─── Stripe Checkout ─────────────────────────────────────────────────────────

export async function startStripeCheckout(): Promise<{ url: string | null; error: string | null }> {
  // Refresh session first to ensure token is valid (prevents Invalid JWT)
  await supabase.auth.refreshSession()

  const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: {} })
  if (error) {
    let detail = error.message
    try {
      const body = await (error as any).context?.json()
      if (body) detail = body.error ?? body.message ?? detail
    } catch {}
    console.error('stripe-checkout error:', detail)
    return { url: null, error: detail ?? 'Failed to start checkout' }
  }
  return { url: data?.url ?? null, error: null }
}
