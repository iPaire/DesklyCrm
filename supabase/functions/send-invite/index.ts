// Supabase Edge Function - send-invite
// Sends a team invitation email via Resend.
// Requires secret: RESEND_API_KEY
// Deploy: supabase functions deploy send-invite

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  try {
    const { email, inviteToken, inviterEmail, teamName, siteUrl } = await req.json()

    if (!email || !inviteToken || !siteUrl) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const inviteUrl = `${siteUrl}/invite/${inviteToken}`
    const fromName = inviterEmail?.split('@')[0] ?? 'Someone'
    const displayTeam = teamName && teamName !== inviterEmail ? teamName : `${fromName}'s team`

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center;">
      <div style="width:40px;height:40px;background:rgba(255,255,255,0.2);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
        <span style="color:#fff;font-weight:700;font-size:18px;">D</span>
      </div>
      <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0;">Team Invitation</h1>
      <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">You've been invited to join Deskly</p>
    </div>

    <!-- Body -->
    <div style="padding:32px 40px;">
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Hi there,
      </p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
        <strong>${inviterEmail}</strong> has invited you to join
        <strong>${displayTeam}</strong> on Deskly - a simple CRM for small teams.
      </p>

      <!-- CTA Button -->
      <div style="text-align:center;margin:32px 0;">
        <a href="${inviteUrl}"
           style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:600;">
          Accept Invitation →
        </a>
      </div>

      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 8px;">
        Or copy this link into your browser:
      </p>
      <p style="color:#6b7280;font-size:12px;word-break:break-all;background:#f3f4f6;padding:10px 14px;border-radius:8px;margin:0 0 24px;">
        ${inviteUrl}
      </p>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

      <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">
        This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:16px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">Deskly · Simple CRM for small teams</p>
    </div>
  </div>
</body>
</html>
`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Deskly <noreply@desklycrm.com>',
        to: email,
        subject: `${inviterEmail} invited you to join Deskly`,
        html,
      }),
    })

    if (!res.ok) {
      const body = await res.json()
      console.error('Resend error:', body)
      return new Response(JSON.stringify({ error: body.message ?? 'Email failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-invite error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
