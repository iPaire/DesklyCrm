// Supabase Edge Function - delete-account
// Deletes all user data and the auth account.
// Deploy: supabase functions deploy delete-account

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    // Use anon client to verify user token
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    // Use service role client for admin operations
    const admin = createClient(supabaseUrl, supabaseServiceKey)

    // Delete user data (cascades via FK or explicit deletes)
    await admin.from('activity_logs').delete().eq('user_id', user.id)
    await admin.from('email_logs').delete().eq('user_id', user.id)
    await admin.from('gmail_connections').delete().eq('user_id', user.id)
    await admin.from('notifications').delete().eq('user_id', user.id)
    await admin.from('automations').delete().eq('user_id', user.id)
    await admin.from('tasks').delete().eq('user_id', user.id)
    await admin.from('deals').delete().eq('user_id', user.id)
    await admin.from('contacts').delete().eq('user_id', user.id)

    // Delete team membership
    await admin.from('team_members').delete().eq('user_id', user.id)

    // Delete owned team (and cascade members)
    const { data: ownedTeam } = await admin
      .from('teams')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (ownedTeam) {
      await admin.from('team_members').delete().eq('team_id', ownedTeam.id)
      await admin.from('teams').delete().eq('id', ownedTeam.id)
    }

    // Finally delete the auth user
    const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id)
    if (deleteErr) {
      return new Response(JSON.stringify({ error: deleteErr.message }), {
        status: 500,
        headers: corsHeaders,
      })
    }

    return new Response(JSON.stringify({ success: true }), {
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
