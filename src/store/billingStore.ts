import { create } from 'zustand'
import { getTeamAndRole, getTeamMembers, getTrialInfo, isSubscribed, ensureTeam, checkAndRestoreSubscription } from '../lib/billing'
import type { Team, TeamMember, TrialInfo } from '../lib/billing'
import { supabase } from '../lib/supabase'

interface BillingState {
  team: Team | null
  members: TeamMember[]
  trialInfo: TrialInfo | null
  memberTrialInfo: TrialInfo | null  // trial personal al userului curent (pt membri)
  memberJoinedAt: string | null      // raw date for live expiry recomputation
  hasPaidSeat: boolean               // are seat plătit (owner subscribed SAU member.has_paid_seat)
  isOwner: boolean
  isLoading: boolean
  fetchBilling: (userId: string) => Promise<void>
  setTeam: (team: Team | null) => void
  setMembers: (members: TeamMember[]) => void
  clearBilling: () => void
}

export const useBillingStore = create<BillingState>((set) => ({
  team: null,
  members: [],
  trialInfo: null,
  memberTrialInfo: null,
  memberJoinedAt: null,
  hasPaidSeat: false,
  isOwner: false,
  isLoading: false,

  fetchBilling: async (userId: string) => {
    set({ isLoading: true })
    let { team, role, membershipFound, hasPaidSeat, memberJoinedAt } = await getTeamAndRole(userId)
    if (!membershipFound) {
      const { data: { user } } = await supabase.auth.getUser()
      const email = user?.email ?? userId
      team = await ensureTeam(userId, email, user?.created_at)
      role = team ? 'owner' : null
      hasPaidSeat = team?.subscription_status === 'active'
    }
    if (!team) {
      set({ isLoading: false })
      return
    }
    const { members } = await getTeamMembers(team.id)
    const trialInfo = getTrialInfo(team.trial_start, team.trial_extended_days)

    // When trial expires, mark it in DB so status is the source of truth
    let currentTeam: Team = team
    if (trialInfo.isExpired && team.subscription_status === 'trialing') {
      supabase.from('teams').update({ subscription_status: 'ended' }).eq('id', team.id)
      currentTeam = { ...team, subscription_status: 'ended' }
    }

    // Per-member trial: based on account creation date (not join date).
    // A user who existed for 10 days before being invited should not get a fresh 14-day trial.
    let storedMemberJoinedAt: string | null = null
    if (role === 'member') {
      const { data: { session } } = await supabase.auth.getSession()
      storedMemberJoinedAt = session?.user?.created_at ?? memberJoinedAt ?? null
    }
    const memberTrialInfo = storedMemberJoinedAt ? getTrialInfo(storedMemberJoinedAt) : null

    const activeSeats = members.filter(m => m.status === 'active').length || 1
    const teamWithSeats: Team = activeSeats !== currentTeam.seats ? { ...currentTeam, seats: activeSeats } : currentTeam
    if (activeSeats !== currentTeam.seats) {
      supabase.from('teams').update({ seats: activeSeats }).eq('id', currentTeam.id)
    }

    // Auto-restore: if owner isn't subscribed but may have paid in Stripe, silently sync
    if (role === 'owner' && currentTeam.subscription_status !== 'active') {
      const { restored } = await checkAndRestoreSubscription()
      if (restored) {
        // Re-fetch team from DB now that it's updated
        const { data: updatedTeam } = await supabase.from('teams').select('*').eq('id', currentTeam.id).single()
        if (updatedTeam) {
          set({ team: updatedTeam as Team, members, trialInfo: getTrialInfo(updatedTeam.trial_start, updatedTeam.trial_extended_days), memberTrialInfo, hasPaidSeat: true, isOwner: true, isLoading: false })
          return
        }
      }
    }

    set({ team: teamWithSeats, members, trialInfo, memberTrialInfo, memberJoinedAt: storedMemberJoinedAt, hasPaidSeat, isOwner: role === 'owner', isLoading: false })
  },

  setTeam: (team) => {
    if (!team) { set({ team: null, trialInfo: null }); return }
    const trialInfo = getTrialInfo(team.trial_start, team.trial_extended_days)
    set({ team, trialInfo })
  },

  setMembers: (members) => set({ members }),

  clearBilling: () => set({ team: null, members: [], trialInfo: null, memberTrialInfo: null, memberJoinedAt: null, hasPaidSeat: false, isOwner: false, isLoading: false }),
}))

// Owner: trial expirat și neabonat
export const selectIsSubscribed = (s: BillingState) => isSubscribed(s.team)
export const selectTrialExpired = (s: BillingState) => {
  if (s.hasPaidSeat) return false  // has paid seat → never blocked
  if (!s.team) return false

  // Always check team-level expiry first - if owner's trial/subscription is gone, everyone is locked out
  const teamEnded = s.team.subscription_status === 'ended'
  const teamTi = getTrialInfo(s.team.trial_start, s.team.trial_extended_days)
  const teamExpired = teamEnded || (teamTi.isExpired && !isSubscribed(s.team))

  if (s.isOwner) {
    return teamExpired
  } else {
    // Member is locked out if the team itself has expired (owner hasn't paid)
    if (teamExpired) return true
    // If team is subscribed, all active members have access - no personal trial check needed
    if (isSubscribed(s.team)) return false
    // Member is also locked out if their personal member trial has expired
    if (!s.memberJoinedAt) return false
    const memberTi = getTrialInfo(s.memberJoinedAt)
    return memberTi.isExpired
  }
}
