// Supabase Edge Function - stripe-webhook
// Handles Stripe webhook events to keep subscription status in sync.
// Requires secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// Deploy: supabase functions deploy stripe-webhook
// Add webhook in Stripe dashboard → endpoint: https://<project>.supabase.co/functions/v1/stripe-webhook
// Events to listen: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

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

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const teamId = session.metadata?.team_id
        const userId = session.client_reference_id ?? session.metadata?.user_id
        const customerId = session.customer as string
        const subscriptionId = session.subscription as string

        // Fetch the subscription to get current_period_end
        let currentPeriodEnd: string | null = null
        if (subscriptionId) {
          const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
            headers: { Authorization: `Bearer ${stripeSecretKey}` },
          })
          if (subRes.ok) {
            const sub = await subRes.json()
            if (sub.current_period_end) {
              currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString()
            }
          }
        }

        const checkoutUpdate = {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_status: 'active',
          ...(currentPeriodEnd ? { current_period_end: currentPeriodEnd } : {}),
        }

        if (teamId) {
          await supabase.from('teams').update(checkoutUpdate).eq('id', teamId)
        } else if (userId) {
          await supabase.from('teams').update(checkoutUpdate).eq('owner_id', userId)
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const teamId = sub.metadata?.team_id
        const status = mapStripeStatus(sub.status)
        const seats = sub.items.data[0]?.quantity ?? 1
        const currentPeriodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null

        const updatePayload = { subscription_status: status, seats, current_period_end: currentPeriodEnd }

        if (teamId) {
          await supabase.from('teams').update(updatePayload).eq('id', teamId)
        } else {
          await supabase.from('teams').update(updatePayload).eq('stripe_subscription_id', sub.id)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await supabase
          .from('teams')
          .update({ subscription_status: 'canceled' })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subId = typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id
        if (subId) {
          await supabase
            .from('teams')
            .update({ subscription_status: 'past_due' })
            .eq('stripe_subscription_id', subId)
        }
        break
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Webhook handler error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})

function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'canceled'
    default:
      return status
  }
}
