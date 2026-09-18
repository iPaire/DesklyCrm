import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processStripeEvent, mapStripeStatus } from './process-stripe-event'

/** Builds a fake Supabase client. Each table gets one canned `{ data, error }` result,
 *  and every `.update()`/`.insert()` call made against it is recorded in `calls[table]`
 *  so tests can assert on what would have been written. */
function makeSupabase(tableResults: Record<string, { data: any; error?: any }>) {
  const calls: Record<string, Array<{ method: string; payload?: any }>> = {}
  const from = vi.fn((table: string) => {
    const result = tableResults[table] ?? { data: null, error: null }
    const record = (method: string, payload?: any) => {
      ;(calls[table] ??= []).push({ method, payload })
    }
    const c: any = {
      update: (payload: any) => { record('update', payload); return c },
      insert: (payload: any) => { record('insert', payload); return c },
      select: () => c,
      eq: () => c,
      single: () => c,
      maybeSingle: () => c,
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    }
    return c
  })
  return { from, calls } as any
}

describe('mapStripeStatus', () => {
  it.each([
    ['active', 'active'],
    ['trialing', 'active'],
    ['past_due', 'past_due'],
    ['canceled', 'canceled'],
    ['unpaid', 'canceled'],
    ['incomplete_expired', 'canceled'],
    ['incomplete', 'incomplete'],
  ])('maps Stripe status "%s" to app status "%s"', (input, expected) => {
    expect(mapStripeStatus(input as any)).toBe(expected)
  })
})

describe('processStripeEvent', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ current_period_end: 1_700_000_000 }) }) as any
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('checkout.session.completed activates the team and marks active members as paid seats', async () => {
    const supabase = makeSupabase({ teams: { data: null }, team_members: { data: null } })
    const event = {
      type: 'checkout.session.completed',
      data: { object: { metadata: { team_id: 'team-1' }, client_reference_id: null, customer: 'cus_1', subscription: 'sub_1' } },
    } as any

    await processStripeEvent(event, supabase)

    const teamUpdate = supabase.calls.teams.find((c: any) => c.method === 'update')
    expect(teamUpdate.payload).toMatchObject({ stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', subscription_status: 'active' })

    const memberUpdate = supabase.calls.team_members.find((c: any) => c.method === 'update')
    expect(memberUpdate.payload).toMatchObject({ has_paid_seat: true, stripe_subscription_id: 'sub_1' })
  })

  it('checkout.session.completed falls back to the owner\'s team when metadata has no team_id', async () => {
    const supabase = makeSupabase({
      teams: { data: { id: 'resolved-team' } }, // used both for the owner-lookup select and the update-by-owner call
      team_members: { data: null },
    })
    const event = {
      type: 'checkout.session.completed',
      data: { object: { metadata: {}, client_reference_id: 'user-1', customer: 'cus_2', subscription: 'sub_2' } },
    } as any

    await processStripeEvent(event, supabase)

    const memberUpdate = supabase.calls.team_members.find((c: any) => c.method === 'update')
    expect(memberUpdate).toBeDefined()
    expect(memberUpdate.payload.has_paid_seat).toBe(true)
  })

  it('customer.subscription.updated applies the mapped status and seat count to the team', async () => {
    const supabase = makeSupabase({ teams: { data: null }, team_members: { data: null } })
    const event = {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_3', status: 'past_due', metadata: { team_id: 'team-1' }, items: { data: [{ quantity: 3 }] }, current_period_end: 1_700_000_000 } },
    } as any

    await processStripeEvent(event, supabase)

    const teamUpdate = supabase.calls.teams.find((c: any) => c.method === 'update')
    expect(teamUpdate.payload).toMatchObject({ subscription_status: 'past_due', seats: 3 })
    // past_due members should NOT be marked paid - that only happens on 'active'
    expect(supabase.calls.team_members).toBeUndefined()
  })

  it('customer.subscription.deleted cancels the team subscription', async () => {
    const supabase = makeSupabase({ teams: { data: null } })
    const event = {
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_4' } },
    } as any

    await processStripeEvent(event, supabase)

    const teamUpdate = supabase.calls.teams.find((c: any) => c.method === 'update')
    expect(teamUpdate.payload).toEqual({ subscription_status: 'canceled' })
  })

  it('invoice.payment_failed marks the team past_due', async () => {
    const supabase = makeSupabase({ teams: { data: null } })
    const event = {
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_5' } },
    } as any

    await processStripeEvent(event, supabase)

    const teamUpdate = supabase.calls.teams.find((c: any) => c.method === 'update')
    expect(teamUpdate.payload).toEqual({ subscription_status: 'past_due' })
  })

  it('ignores event types it does not handle, without throwing', async () => {
    const supabase = makeSupabase({})
    const event = { type: 'payment_intent.succeeded', data: { object: {} } } as any
    await expect(processStripeEvent(event, supabase)).resolves.toBeUndefined()
  })
})
