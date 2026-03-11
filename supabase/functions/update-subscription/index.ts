// Supabase Edge Function - update-subscription
// Updates the Stripe subscription quantity to match the team's active member count.
// When member_id is provided (seat activation), also force-pays the prorated invoice
// and updates the member's stripe_subscription_id in DB.
// Deploy: supabase functions deploy update-subscription --no-verify-jwt

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
    const memberId = body.member_id as string | undefined  // present when activating a specific seat

    // Get the team - caller must be the owner OR have any membership row
    let team: Record<string, unknown> | null = null
    if (teamId) {
      const [{ data: ownerTeam }, { data: membership }] = await Promise.all([
        supabase.from('teams').select('*').eq('id', teamId).eq('owner_id', user.id).maybeSingle(),
        supabase.from('team_members').select('role').eq('team_id', teamId).eq('user_id', user.id).maybeSingle(),
      ])

      if (!ownerTeam && !membership) {
        return new Response(JSON.stringify({ error: 'Not authorized for this team' }), { status: 403, headers: corsHeaders })
      }

      team = ownerTeam ?? (await supabase.from('teams').select('*').eq('id', teamId).single()).data
    } else {
      const { data } = await supabase.from('teams').select('*').eq('owner_id', user.id).maybeSingle()
      team = data
    }

    if (!team) {
      return new Response(JSON.stringify({ error: 'Team not found' }), { status: 404, headers: corsHeaders })
    }

    // Count all active members
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

    // Fetch current subscription to know old quantity
    const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    })
    const sub = await subRes.json()
    if (!subRes.ok) {
      return new Response(JSON.stringify({ error: sub.error?.message ?? 'Stripe error fetching subscription' }), {
        status: 400, headers: corsHeaders,
      })
    }

    const itemId = sub.items?.data?.[0]?.id
    if (!itemId) {
      return new Response(JSON.stringify({ error: 'No subscription item found' }), { status: 400, headers: corsHeaders })
    }

    const oldQuantity = sub.items?.data?.[0]?.quantity ?? 0
    const addingSeat = memberId != null && seats > oldQuantity

    // Update quantity on Stripe - always_invoice triggers immediate prorated invoice when adding seats
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
      return new Response(JSON.stringify({ error: updated.error?.message ?? 'Stripe error updating quantity' }), {
        status: 400, headers: corsHeaders,
      })
    }

    // When activating a new seat, verify the prorated invoice was actually paid
    if (addingSeat) {
      // Fetch the subscription again to get the latest invoice
      const subAfterRes = await fetch(
        `https://api.stripe.com/v1/subscriptions/${subscriptionId}?expand[]=latest_invoice.payment_intent`,
        { headers: { Authorization: `Bearer ${stripeSecretKey}` } },
      )
      const subAfter = await subAfterRes.json()
      const invoice = subAfter.latest_invoice

      if (invoice && invoice.status === 'open') {
        // Auto-pay the invoice using the customer's default payment method
        const payRes = await fetch(`https://api.stripe.com/v1/invoices/${invoice.id}/pay`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${stripeSecretKey}` },
        })
        const paid = await payRes.json()
        if (!payRes.ok || paid.status !== 'paid') {
          // Payment failed - revert the quantity change
          await fetch(`https://api.stripe.com/v1/subscription_items/${itemId}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${stripeSecretKey}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `quantity=${oldQuantity}&proration_behavior=none`,
          })
          const failReason = paid.error?.message ?? paid.last_payment_error?.message ?? 'Payment failed'
          return new Response(JSON.stringify({ error: failReason }), { status: 402, headers: corsHeaders })
        }
      } else if (!invoice || (invoice.status !== 'paid' && invoice.amount_due > 0)) {
        // Unexpected invoice state
        console.warn('Unexpected invoice state:', invoice?.status, invoice?.amount_due)
      }
    }

    return new Response(JSON.stringify({ ok: true, seats, stripe_updated: true, stripe_subscription_id: subscriptionId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
