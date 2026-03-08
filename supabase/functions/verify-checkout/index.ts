// Supabase Edge Function - verify-checkout
// Called when user returns from Stripe Checkout with ?session_id=cs_...
// Directly verifies the session with Stripe and updates the team's subscription_status.
// This is a fallback so activation works even if the webhook hasn't fired yet.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authenticate the user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const { session_id } = await req.json()
    if (!session_id) {
      return new Response(JSON.stringify({ error: 'Missing session_id' }), { status: 400, headers: corsHeaders })
    }

    // Fetch the checkout session from Stripe
    const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session_id}?expand[]=subscription`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    })
    if (!stripeRes.ok) {
      const err = await stripeRes.json()
      return new Response(JSON.stringify({ error: err.error?.message ?? 'Stripe error' }), { status: 400, headers: corsHeaders })
    }

    const session = await stripeRes.json()

    // Only process completed sessions
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return new Response(JSON.stringify({ error: 'Payment not completed' }), { status: 400, headers: corsHeaders })
    }

    const teamId = session.metadata?.team_id
    const customerId = session.customer
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
    const currentPeriodEnd = session.subscription?.current_period_end
      ? new Date(session.subscription.current_period_end * 1000).toISOString()
      : null

    const update = {
      subscription_status: 'active' as const,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      ...(currentPeriodEnd ? { current_period_end: currentPeriodEnd } : {}),
    }

    if (teamId) {
      await supabase.from('teams').update(update).eq('id', teamId)
    } else {
      await supabase.from('teams').update(update).eq('owner_id', user.id)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('verify-checkout error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
