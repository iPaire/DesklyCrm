// Supabase Edge Function - stripe-webhook
// Handles Stripe webhook events to keep subscription status in sync.
// Requires secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// Deploy: supabase functions deploy stripe-webhook
// Add webhook in Stripe dashboard → endpoint: https://<project>.supabase.co/functions/v1/stripe-webhook
// Events to listen: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { processStripeEvent } from '../_shared/process-stripe-event.ts'

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })
const supabase = createClient(supabaseUrl, supabaseServiceKey)

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing signature', { status: 400 })
  }

  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  // Idempotency check - skip events already successfully processed
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('status')
    .eq('stripe_event_id', event.id)
    .maybeSingle()

  if (existing?.status === 'processed') {
    return new Response(JSON.stringify({ received: true, skipped: 'already_processed' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Log the event before processing so retries can pick it up if we crash
  await supabase.from('webhook_events').upsert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event,
    status: 'pending',
  }, { onConflict: 'stripe_event_id', ignoreDuplicates: false })

  try {
    await processStripeEvent(event, supabase)

    await supabase.from('webhook_events').update({
      status: 'processed',
      processed_at: new Date().toISOString(),
      error_message: null,
    }).eq('stripe_event_id', event.id)
  } catch (err) {
    console.error('Webhook handler error:', err)

    // Mark as failed so retry-webhooks picks it up with exponential backoff.
    // Return 200 to Stripe - we own the retry, not Stripe.
    await supabase.from('webhook_events').update({
      status: 'failed',
      error_message: String(err),
      next_retry_at: new Date(Date.now() + 60_000).toISOString(), // first retry in 1 min
    }).eq('stripe_event_id', event.id)
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
