import { describe, it, expect, vi, beforeEach } from 'vitest'

// `supabase.ts` builds a real client, so we mock it before importing anything
// that pulls it in - `getTeamAndRole`/`getFreshToken` never touch the network.
vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getSession: vi.fn(), refreshSession: vi.fn() },
  },
}))

import { supabase } from './supabase'
import { getTrialInfo, isSubscribed, getTeamAndRole, getFreshToken, type Team } from './billing'

/** Builds a Supabase query-builder stand-in: every chain method returns itself,
 *  and awaiting it resolves to the given `{ data, error }`. */
function chain(result: { data: unknown; error?: unknown }) {
  const c: any = {
    select: () => c,
    eq: () => c,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  }
  return c
}

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fakeJwt(exp: number): string {
  return `${b64url({ alg: 'none' })}.${b64url({ exp })}.sig`
}

describe('getTrialInfo', () => {
  it('reports a fresh trial as 0% elapsed with the full window remaining', () => {
    const info = getTrialInfo(new Date().toISOString())
    expect(info.daysElapsed).toBe(0)
    expect(info.daysRemaining).toBe(14)
    expect(info.isExpired).toBe(false)
  })

  it('reports halfway through a 14-day trial at 50% progress', () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const info = getTrialInfo(sevenDaysAgo)
    expect(info.daysRemaining).toBe(7)
    expect(info.progress).toBe(50)
    expect(info.isExpired).toBe(false)
  })

  it('marks a trial expired once elapsed days reach the total, without going negative', () => {
    const twentyDaysAgo = new Date(Date.now() - 20 * 86_400_000).toISOString()
    const info = getTrialInfo(twentyDaysAgo)
    expect(info.isExpired).toBe(true)
    expect(info.daysRemaining).toBe(0)
    expect(info.progress).toBe(100)
  })

  it('extends the window when extendedDays is granted, keeping an expired-looking trial active', () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000 - 1000).toISOString()
    const withoutExtension = getTrialInfo(fourteenDaysAgo)
    const withExtension = getTrialInfo(fourteenDaysAgo, 7)
    expect(withoutExtension.isExpired).toBe(true)
    expect(withExtension.isExpired).toBe(false)
    expect(withExtension.totalDays).toBe(21)
  })
})

describe('isSubscribed', () => {
  it('is true only when subscription_status is exactly "active"', () => {
    expect(isSubscribed({ subscription_status: 'active' } as Team)).toBe(true)
  })

  it('is false for trialing, past_due, canceled, or a missing team', () => {
    expect(isSubscribed({ subscription_status: 'trialing' } as Team)).toBe(false)
    expect(isSubscribed({ subscription_status: 'past_due' } as Team)).toBe(false)
    expect(isSubscribed(null)).toBe(false)
  })
})

describe('getTeamAndRole', () => {
  beforeEach(() => vi.mocked(supabase.from).mockReset())

  it('returns membershipFound=false when the user has no active membership row', async () => {
    vi.mocked(supabase.from).mockReturnValue(chain({ data: [], error: null }))
    const result = await getTeamAndRole('user-1')
    expect(result.membershipFound).toBe(false)
    expect(result.team).toBeNull()
  })

  it('reports membershipFound=true on a network error, so callers never create a duplicate team', async () => {
    vi.mocked(supabase.from).mockReturnValue(chain({ data: null, error: new Error('network down') }))
    const result = await getTeamAndRole('user-1')
    expect(result.membershipFound).toBe(true)
    expect(result.team).toBeNull()
  })

  it('prefers an invited "member" row over the user\'s own auto-created "owner" team', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'team_members') {
        return chain({
          data: [
            { team_id: 'owned-team', role: 'owner', has_paid_seat: false, joined_at: null, member_trial_start: null },
            { team_id: 'invited-team', role: 'member', has_paid_seat: true, joined_at: '2026-01-01', member_trial_start: '2026-01-01' },
          ],
          error: null,
        })
      }
      return chain({ data: { id: 'invited-team', subscription_status: 'trialing' }, error: null })
    })
    const result = await getTeamAndRole('user-1')
    expect(result.role).toBe('member')
    expect((result.team as Team).id).toBe('invited-team')
    expect(result.hasPaidSeat).toBe(true)
  })

  it("derives an owner's hasPaidSeat from the team's subscription status, not a stored flag", async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'team_members') {
        return chain({ data: [{ team_id: 't1', role: 'owner', has_paid_seat: false, joined_at: null, member_trial_start: null }], error: null })
      }
      return chain({ data: { id: 't1', subscription_status: 'active' }, error: null })
    })
    const result = await getTeamAndRole('user-1')
    expect(result.role).toBe('owner')
    expect(result.hasPaidSeat).toBe(true)
  })
})

describe('getFreshToken', () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.getSession).mockReset()
    vi.mocked(supabase.auth.refreshSession).mockReset()
  })

  it('returns the current access_token without refreshing when it is not close to expiry', async () => {
    const token = fakeJwt(Math.floor(Date.now() / 1000) + 3600)
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { access_token: token } } } as any)
    const result = await getFreshToken()
    expect(result).toBe(token)
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled()
  })

  it('refreshes the session when the token is expired', async () => {
    const expired = fakeJwt(Math.floor(Date.now() / 1000) - 10)
    const refreshed = 'new-token'
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { access_token: expired } } } as any)
    vi.mocked(supabase.auth.refreshSession).mockResolvedValue({ data: { session: { access_token: refreshed } }, error: null } as any)
    const result = await getFreshToken()
    expect(supabase.auth.refreshSession).toHaveBeenCalled()
    expect(result).toBe(refreshed)
  })

  it('returns null when there is no session at all', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as any)
    const result = await getFreshToken()
    expect(result).toBeNull()
  })
})
