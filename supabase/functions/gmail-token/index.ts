// Supabase Edge Function - gmail-token
// Proxies Google OAuth token exchange and refresh so the client_secret
// never appears in the browser bundle.
//
// Secrets required (Supabase Dashboard → Edge Functions → Secrets):
//   GOOGLE_CLIENT_ID     - same value as VITE_GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET - the secret (do NOT use VITE_ prefix)
//
// Deploy: supabase functions deploy gmail-token

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GOOGLE_CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TOKEN_URL            = 'https://oauth2.googleapis.com/token'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authenticate caller - must be a logged-in user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const { action, code, refresh_token, redirect_uri } = await req.json()

    if (action === 'exchange') {
      if (!code || !redirect_uri) {
        return new Response(JSON.stringify({ error: 'Missing code or redirect_uri' }), { status: 400, headers: corsHeaders })
      }
      const res = await fetch(TOKEN_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({
          code,
          client_id:     GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri,
          grant_type:    'authorization_code',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        return new Response(JSON.stringify({ error: data.error_description ?? data.error ?? 'Token exchange failed' }), {
          status: 400,
          headers: corsHeaders,
        })
      }
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'refresh') {
      if (!refresh_token) {
        return new Response(JSON.stringify({ error: 'Missing refresh_token' }), { status: 400, headers: corsHeaders })
      }
      const res = await fetch(TOKEN_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({
          client_id:     GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token,
          grant_type:    'refresh_token',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        return new Response(JSON.stringify({ error: data.error_description ?? data.error ?? 'Token refresh failed' }), {
          status: 400,
          headers: corsHeaders,
        })
      }
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use "exchange" or "refresh".' }), {
      status: 400,
      headers: corsHeaders,
    })
  } catch (err) {
    console.error('gmail-token error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
