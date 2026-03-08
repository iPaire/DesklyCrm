import { create } from 'zustand'
import { getTeamAndRole, getTeamMembers, getTrialInfo, isSubscribed, ensureTeam, checkAndRestoreSubscription } from '../lib/billing'
import type { Team, TeamMember, TrialInfo } from '../lib/billing'
import { supabase } from '../lib/supabase'

interface BillingState {
  team: Team | null
  members: TeamMember[]
  trialInfo: TrialInfo | null
  memberTrialInfo: TrialInfo | null  // trial personal al userului curent (pt membri)
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

    // Per-member trial: based on their joined_at date
    const memberTrialInfo = (role === 'member' && memberJoinedAt)
      ? getTrialInfo(memberJoinedAt)
      : null

    const activeSeats = members.filter(m => m.status === 'active').length || 1
    const teamWithSeats = activeSeats !== team.seats ? { ...team, seats: activeSeats } : team
    if (activeSeats !== team.seats) {
      supabase.from('teams').update({ seats: activeSeats }).eq('id', team.id)
    }

    // Auto-restore: if owner isn't subscribed but may have paid in Stripe, silently sync
    if (role === 'owner' && team.subscription_status !== 'active') {
      const { restored } = await checkAndRestoreSubscription()
      if (restored) {
        // Re-fetch team from DB now that it's updated
        const { data: updatedTeam } = await supabase.from('teams').select('*').eq('id', team.id).single()
        if (updatedTeam) {
          set({ team: updatedTeam as typeof team, members, trialInfo: getTrialInfo(updatedTeam.trial_start, updatedTeam.trial_extended_days), memberTrialInfo, hasPaidSeat: true, isOwner: true, isLoading: false })
          return
        }
      }
    }

    set({ team: teamWithSeats, members, trialInfo, memberTrialInfo, hasPaidSeat, isOwner: role === 'owner', isLoading: false })
  },

  setTeam: (team) => {
    if (!team) { set({ team: null, trialInfo: null }); return }
    const trialInfo = getTrialInfo(team.trial_start, team.trial_extended_days)
    set({ team, trialInfo })
  },

  setMembers: (members) => set({ members }),

  clearBilling: () => set({ team: null, members: [], trialInfo: null, memberTrialInfo: null, hasPaidSeat: false, isOwner: false, isLoading: false }),
}))

// Owner: trial expirat și neabonat
export const selectIsSubscribed = (s: BillingState) => isSubscribed(s.team)
export const selectTrialExpired = (s: BillingState) => {
  if (s.hasPaidSeat) return false  // has paid seat → never blocked
  if (s.isOwner) {
    // Owner: blocked if team trial expired and not subscribed
    return s.trialInfo?.isExpired === true && !isSubscribed(s.team)
  } else {
    // Member: blocked if their personal trial expired and no paid seat
    return s.memberTrialInfo?.isExpired === true
  }
}
