import { create } from 'zustand'
import { getTeamAndRole, getTeamMembers, getTrialInfo, isSubscribed } from '../lib/billing'
import type { Team, TeamMember, TrialInfo } from '../lib/billing'

interface BillingState {
  team: Team | null
  members: TeamMember[]
  trialInfo: TrialInfo | null
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
  isOwner: false,
  isLoading: false,

  fetchBilling: async (userId: string) => {
    set({ isLoading: true })
    const { team, role } = await getTeamAndRole(userId)
    if (!team) {
      set({ isLoading: false })
      return
    }
    const { members } = await getTeamMembers(team.id)
    const trialInfo = getTrialInfo(team.trial_start, team.trial_extended_days)
    set({ team, members, trialInfo, isOwner: role === 'owner', isLoading: false })
  },

  setTeam: (team) => {
    if (!team) { set({ team: null, trialInfo: null }); return }
    const trialInfo = getTrialInfo(team.trial_start, team.trial_extended_days)
    set({ team, trialInfo })
  },

  setMembers: (members) => set({ members }),

  clearBilling: () => set({ team: null, members: [], trialInfo: null, isOwner: false, isLoading: false }),
}))

// Convenience selector
export const selectIsSubscribed = (s: BillingState) => isSubscribed(s.team)
export const selectTrialExpired = (s: BillingState) =>
  s.trialInfo?.isExpired === true && !isSubscribed(s.team)
