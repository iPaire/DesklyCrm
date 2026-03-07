// Supabase Edge Function - update-subscription
// Updates the Stripe subscription quantity to match the team's active member count.
// Called from the frontend after adding or removing a member.
// Deploy: supabase functions deploy update-subscription

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
    // Authenticate caller
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const body = await req.json().catch(() => ({}))
    const teamId = body.team_id as string | undefined

    // Get the team - caller must be owner or active member
    let team: Record<string, unknown> | null = null
    if (teamId) {
      // Verify the caller belongs to this team
      const { data: membership } = await supabase
        .from('team_members')
        .select('role')
        .eq('team_id', teamId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (!membership) {
        return new Response(JSON.stringify({ error: 'Not a team member' }), { status: 403, headers: corsHeaders })
      }

      const { data } = await supabase.from('teams').select('*').eq('id', teamId).single()
      team = data
    } else {
      // Fall back to the team owned by the caller
      const { data } = await supabase.from('teams').select('*').eq('owner_id', user.id).maybeSingle()
      team = data
    }

    if (!team) {
      return new Response(JSON.stringify({ error: 'Team not found' }), { status: 404, headers: corsHeaders })
    }

    // Count active members
    const { count } = await supabase
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', team.id as string)
      .eq('status', 'active')

    const seats = Math.max(1, count ?? 1)

    // Always keep DB seats in sync
    await supabase.from('teams').update({ seats }).eq('id', team.id as string)

    // If no Stripe subscription, nothing more to do
    const subscriptionId = team.stripe_subscription_id as string | null
    if (!subscriptionId) {
      return new Response(JSON.stringify({ ok: true, seats, stripe_updated: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch the subscription to get the subscription item ID
    const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    })
    const sub = await subRes.json()
    if (!subRes.ok) {
      console.error('Stripe fetch subscription error:', sub)
      return new Response(JSON.stringify({ error: sub.error?.message ?? 'Stripe error' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const itemId = sub.items?.data?.[0]?.id
    if (!itemId) {
      return new Response(JSON.stringify({ error: 'No subscription item found' }), { status: 400, headers: corsHeaders })
    }

    // Update quantity
    const updateRes = await fetch(`https://api.stripe.com/v1/subscription_items/${itemId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `quantity=${seats}&proration_behavior=always_invoice`,
    })
    const updated = await updateRes.json()
    if (!updateRes.ok) {
      console.error('Stripe update quantity error:', updated)
      return new Response(JSON.stringify({ error: updated.error?.message ?? 'Stripe error' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    return new Response(JSON.stringify({ ok: true, seats, stripe_updated: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
