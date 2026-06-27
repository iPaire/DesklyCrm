-- ─────────────────────────────────────────────────────────────────────────────
-- Webhook events log + retry infrastructure
-- Run in Supabase SQL editor after enabling pg_cron and pg_net extensions.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── webhook_events ──────────────────────────────────────────────────────────
-- Stores all incoming Stripe events. Used for idempotency and retry tracking.
-- status: pending → processed (success) | failed → dead (exhausted retries)

CREATE TABLE IF NOT EXISTS webhook_events (
  stripe_event_id  TEXT PRIMARY KEY,
  event_type       TEXT NOT NULL,
  payload          JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | processed | failed | dead
  error_message    TEXT,
  retry_count      INTEGER NOT NULL DEFAULT 0,
  next_retry_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ
);

-- Only service role (edge functions) can read/write
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all" ON webhook_events USING (false);

-- Speeds up the retry query (status = 'failed' AND next_retry_at <= NOW())
CREATE INDEX IF NOT EXISTS webhook_events_retry_idx
  ON webhook_events (next_retry_at)
  WHERE status = 'failed';


-- ─── Trial expiry cron ────────────────────────────────────────────────────────
-- Runs daily at 2 AM UTC. Marks trials as ended so the frontend never needs
-- to write subscription_status - it only reads and derives local UI state.
--
-- Replace ufcgbgyzftigccyltsov and <anon-key> with your Supabase project values.

SELECT cron.schedule(
  'expire-trials',
  '0 2 * * *',
  $$
    UPDATE teams
    SET subscription_status = 'ended'
    WHERE subscription_status = 'trialing'
      AND NOW() > trial_start + ((14 + COALESCE(trial_extended_days, 0)) || ' days')::INTERVAL;
  $$
);


-- ─── Webhook retry cron ───────────────────────────────────────────────────────
-- Runs every minute. Triggers the retry-webhooks edge function which picks up
-- failed events whose next_retry_at has passed and retries them with
-- exponential backoff (1 → 2 → 4 → 8 → 16 min, then marked 'dead').
--
-- Replace ufcgbgyzftigccyltsov and <service-role-key> with your Supabase project values.

SELECT cron.schedule(
  'retry-webhooks',
  '* * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://ufcgbgyzftigccyltsov.supabase.co/functions/v1/retry-webhooks',
      headers := '{"Authorization": "Bearer <service-role-key>", "Content-Type": "application/json"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);
