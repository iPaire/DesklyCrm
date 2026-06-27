-- ─────────────────────────────────────────────────────────────────────────────
-- Add member_trial_start to team_members
-- Tracks when a member first joined for trial purposes.
-- Set once at invite acceptance, never overwritten - immune to account
-- deletion + re-registration (which would otherwise reset user.created_at).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS member_trial_start TIMESTAMPTZ;

-- Backfill existing active members using joined_at (best available proxy).
-- New members will get this set precisely from user.created_at at acceptance time.
UPDATE team_members
SET member_trial_start = COALESCE(joined_at, invited_at)
WHERE member_trial_start IS NULL
  AND status = 'active';
