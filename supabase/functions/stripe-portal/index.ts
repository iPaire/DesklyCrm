// Supabase Edge Function - stripe-portal
// Creates a Stripe Customer Portal session so the team owner can manage billing.
// Requires secrets: STRIPE_SECRET_KEY
// Deploy: supabase functions deploy stripe-portal

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!
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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // Get the team owned by this user
    const { data: team } = await supabase
      .from('teams')
      .select('stripe_customer_id')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!team?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: 'No Stripe customer found. Please subscribe first.' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // Create a Stripe Customer Portal session
    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `customer=${encodeURIComponent(team.stripe_customer_id)}&return_url=${encodeURIComponent(`${appUrl}/settings`)}`,
    })

    const session = await portalRes.json()
    if (!portalRes.ok) {
      console.error('Stripe portal error:', session)
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
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
