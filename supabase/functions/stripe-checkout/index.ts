// Supabase Edge Function - stripe-checkout
// Creates a Stripe Checkout Session and returns the URL.
// Requires secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_ID
// Deploy: supabase functions deploy stripe-checkout

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!
const stripePriceId = Deno.env.get('STRIPE_PRICE_ID')!
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const appUrl = Deno.env.get('APP_URL') ?? 'https://desklycrm.com'

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
    // Validate required secrets
    if (!stripePriceId) {
      console.error('STRIPE_PRICE_ID secret is not set')
      return new Response(JSON.stringify({ error: 'Stripe price not configured. Set STRIPE_PRICE_ID secret.' }), {
        status: 500,
        headers: corsHeaders,
      })
    }

    // Authenticate the user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    // Get the user's team (maybeSingle avoids throwing when no row found)
    const { data: team } = await supabase
      .from('teams')
      .select('id, seats, stripe_customer_id')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!team) {
      return new Response(JSON.stringify({ error: 'Team not found. Only team owners can subscribe.' }), {
        status: 404,
        headers: corsHeaders,
      })
    }

    // Always count live active members so checkout quantity is never stale
    const { count } = await supabase
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', team.id)
      .eq('status', 'active')
    const seats = Math.max(1, count ?? 1)

    // Keep the seats column in sync
    if (seats !== team.seats) {
      await supabase.from('teams').update({ seats }).eq('id', team.id)
    }

    // Build Stripe Checkout Session payload
    const params: Record<string, unknown> = {
      mode: 'subscription',
      line_items: [
        {
          price: stripePriceId,
          quantity: seats,
        },
      ],
      success_url: `${appUrl}/settings?billing=success`,
      cancel_url: `${appUrl}/settings?billing=canceled`,
      client_reference_id: user.id,
      customer_email: team.stripe_customer_id ? undefined : user.email,
      metadata: {
        team_id: team.id,
        user_id: user.id,
      },
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          team_id: team.id,
          user_id: user.id,
        },
      },
    }

    // Reuse existing Stripe customer if available
    if (team.stripe_customer_id) {
      params.customer = team.stripe_customer_id
      delete params.customer_email
    }

    // Create checkout session via Stripe API
    const formBody = buildStripeFormBody(params)
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    })

    const session = await stripeRes.json()
    if (!stripeRes.ok) {
      console.error('Stripe error:', session)
      return new Response(JSON.stringify({ error: session.error?.message ?? 'Stripe error' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})

// Flatten nested object to Stripe's form-encoded format
function buildStripeFormBody(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue
    const fullKey = prefix ? `${prefix}[${key}]` : key
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          parts.push(buildStripeFormBody(item as Record<string, unknown>, `${fullKey}[${i}]`))
        } else {
          parts.push(`${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(String(item))}`)
        }
      })
    } else if (typeof value === 'object') {
      parts.push(buildStripeFormBody(value as Record<string, unknown>, fullKey))
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`)
    }
  }
  return parts.join('&')
}
