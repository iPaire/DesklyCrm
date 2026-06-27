// Supabase Edge Function - retry-webhooks
// Retries failed Stripe webhook events with exponential backoff.
// Called by pg_cron every minute - picks up events where next_retry_at <= NOW().
//
// Backoff schedule (retry_count → delay before next attempt):
//   0 failed  → retry in  1 min
//   1st retry → retry in  2 min
//   2nd retry → retry in  4 min
//   3rd retry → retry in  8 min
//   4th retry → retry in 16 min
//   5th retry → mark as 'dead' (no more retries)
//
// Deploy: supabase functions deploy retry-webhooks

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type Stripe from 'https://esm.sh/stripe@14?target=deno'
import { processStripeEvent } from '../_shared/process-stripe-event.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const MAX_RETRIES = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  // Fetch all failed events that are ready to retry
  const { data: events, error: fetchErr } = await supabase
    .from('webhook_events')
    .select('stripe_event_id, event_type, payload, retry_count')
    .eq('status', 'failed')
    .lte('next_retry_at', new Date().toISOString())
    .lt('retry_count', MAX_RETRIES)
    .order('next_retry_at', { ascending: true })
    .limit(20)

  if (fetchErr) {
    console.error('Failed to fetch retry events:', fetchErr)
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 })
  }

  if (!events || events.length === 0) {
    return new Response(JSON.stringify({ retried: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let succeeded = 0
  let failed = 0

  for (const row of events) {
    try {
      await processStripeEvent(row.payload as Stripe.Event, supabase)

      await supabase.from('webhook_events').update({
        status: 'processed',
        processed_at: new Date().toISOString(),
        error_message: null,
      }).eq('stripe_event_id', row.stripe_event_id)

      succeeded++
    } catch (err) {
      const newRetryCount = (row.retry_count ?? 0) + 1
      const isDead = newRetryCount >= MAX_RETRIES
      // Exponential backoff: 2^retry_count minutes
      const delayMs = Math.pow(2, newRetryCount) * 60_000

      await supabase.from('webhook_events').update({
        status: isDead ? 'dead' : 'failed',
        error_message: String(err),
        retry_count: newRetryCount,
        next_retry_at: isDead ? null : new Date(Date.now() + delayMs).toISOString(),
      }).eq('stripe_event_id', row.stripe_event_id)

      if (isDead) {
        console.error(`Event ${row.stripe_event_id} (${row.event_type}) permanently failed after ${MAX_RETRIES} retries:`, err)
      }

      failed++
    }
  }

  return new Response(JSON.stringify({ retried: events.length, succeeded, failed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
