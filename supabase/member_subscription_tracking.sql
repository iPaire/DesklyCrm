-- Add per-member subscription tracking to team_members
-- Tracks which Stripe subscription covers each member

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT DEFAULT NULL;
