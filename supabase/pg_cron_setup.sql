-- ============================================================
--  Deskly CRM - pg_cron Setup for Server-Side Automations
--  Run in: Supabase Dashboard → SQL Editor → New query
--
--  Prerequisites:
--    1. Enable pg_cron extension: Dashboard → Database → Extensions → pg_cron ON
--    2. Enable pg_net  extension: Dashboard → Database → Extensions → pg_net ON
--    3. Deploy the edge function:
--         supabase functions deploy run-daily-automations --no-verify-jwt
--
--  Replace the two placeholders below before running:
--    <project-ref>   → your Supabase project ref (e.g. abcxyzabcxyz)
--    <service-key>   → your service role key (Settings → API → service_role)
-- ============================================================

-- Enable required extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing schedule if re-running this script
SELECT cron.unschedule('run-daily-automations') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'run-daily-automations'
);

-- Schedule: every hour, process a batch of 100 users
-- At 100 users/hour this handles up to 2,400 daily users.
-- Scale: increase batch_size or switch to '*/30 * * * *' (every 30 min) for more users.
SELECT cron.schedule(
  'run-daily-automations',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://<project-ref>.supabase.co/functions/v1/run-daily-automations',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <service-key>',
        'Content-Type',  'application/json'
      ),
      body    := '{"batch_size": 100}'::jsonb
    )
  $$
);

-- Verify the schedule was created
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname = 'run-daily-automations';
