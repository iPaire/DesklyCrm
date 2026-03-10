// Supabase Edge Function - send-trial-emails
// Runs daily via pg_cron. Sends trial reminder emails at day 7, 12, and 14.
// Requires: RESEND_API_KEY edge function secret
// Deploy: supabase functions deploy send-trial-emails

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const resendApiKey = Deno.env.get('RESEND_API_KEY')!
const appUrl = Deno.env.get('APP_URL') ?? 'https://desklycrm.com'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const TRIAL_DAYS = 14

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Pedro from Deskly <pedro@desklycrm.com>',
      to: [to],
      subject,
      html,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error(`Resend error for ${to}:`, body)
  }
  return res.ok
}

function getEmailContent(
  type: 'day7' | 'day12' | 'day14',
  name: string,
  upgradeUrl: string,
): { subject: string; html: string } {
  const btn = (text: string) =>
    `<a href="${upgradeUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${text}</a>`

  if (type === 'day7') {
    return {
      subject: "You're halfway through your Deskly trial 🎯",
      html: `
        <p>Hi ${name},</p>
        <p>You've got 7 days left in your trial.</p>
        <p>Quick check-in: How's Deskly working for you?</p>
        <p>If you have any questions or need help, just reply to this email.</p>
        <p>Cheers,<br>Pedro<br>Founder, Deskly</p>
        <p><em>P.S. Don't forget to connect Gmail and enable automations - they're game-changers!</em></p>
      `,
    }
  }

  if (type === 'day12') {
    return {
      subject: 'Your Deskly trial ends in 2 days',
      html: `
        <p>Hi ${name},</p>
        <p>Just a heads up - your 14-day trial ends in 2 days.</p>
        <p>To keep your data and continue using Deskly:</p>
        <ul>
          <li>Add your payment info (takes 30 seconds)</li>
          <li>$10/user/month, cancel anytime</li>
        </ul>
        <p>${btn('Upgrade Now →')}</p>
        <p>Questions? Just reply!</p>
        <p>Cheers,<br>Pedro</p>
      `,
    }
  }

  // day14
  return {
    subject: 'Your Deskly trial has ended',
    html: `
      <p>Hi ${name},</p>
      <p>Your 14-day trial just ended.</p>
      <p>Your data is safe - upgrade now to access your CRM again.</p>
      <p>${btn('Upgrade Now →')}</p>
      <p>Cheers,<br>Pedro</p>
    `,
  }
}

Deno.serve(async (_req) => {
  try {
    // Fetch all trialing teams
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('id, owner_id, owner_email, trial_start, trial_extended_days, subscription_status')
      .eq('subscription_status', 'trialing')

    if (teamsErr) {
      return new Response(JSON.stringify({ error: teamsErr.message }), { status: 500 })
    }

    const results: string[] = []

    for (const team of teams ?? []) {
      const email = team.owner_email
      if (!email) continue

      const trialStart = new Date(team.trial_start)
      const totalDays = TRIAL_DAYS + (team.trial_extended_days ?? 0)
      const daysElapsed = Math.floor(
        (Date.now() - trialStart.getTime()) / (1000 * 60 * 60 * 24),
      )

      let emailType: 'day7' | 'day12' | 'day14' | null = null
      if (daysElapsed === 7) emailType = 'day7'
      else if (daysElapsed === totalDays - 2) emailType = 'day12'
      else if (daysElapsed >= totalDays) emailType = 'day14'

      if (!emailType) continue

      // Check if already sent
      const { data: alreadySent } = await supabase
        .from('trial_emails_sent')
        .select('id')
        .eq('user_id', team.owner_id)
        .eq('email_type', emailType)
        .maybeSingle()

      if (alreadySent) continue

      const name = email.split('@')[0]
      const upgradeUrl = `${appUrl}/settings`
      const { subject, html } = getEmailContent(emailType, name, upgradeUrl)

      const sent = await sendEmail(email, subject, html)
      if (sent) {
        await supabase
          .from('trial_emails_sent')
          .insert({ user_id: team.owner_id, email_type: emailType })
        results.push(`sent:${emailType}:${email}`)
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
