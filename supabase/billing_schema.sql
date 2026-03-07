-- ─────────────────────────────────────────────────────────────────────────────
-- Billing schema: teams, team_members, trial_emails_sent
-- Run this in the Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Teams ────────────────────────────────────────────────────────────────────
-- One team per owner. Tracks subscription & trial state.

CREATE TABLE IF NOT EXISTS teams (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  owner_email            text,
  name                   text,
  trial_start            timestamptz NOT NULL DEFAULT now(),
  trial_extended_days    int NOT NULL DEFAULT 0,
  stripe_customer_id     text,
  stripe_subscription_id text,
  subscription_status    text NOT NULL DEFAULT 'trialing',
  -- values: trialing | active | canceled | past_due | unpaid
  seats                  int NOT NULL DEFAULT 1,
  current_period_end     timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_owner_select" ON teams
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "team_owner_insert" ON teams
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "team_owner_update" ON teams
  FOR UPDATE USING (auth.uid() = owner_id);

-- Note: "team_member_select" policy (referencing team_members) is added AFTER
-- team_members table is created below.

-- ─── Team members ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email        text NOT NULL,
  role         text NOT NULL DEFAULT 'member', -- owner | member
  status       text NOT NULL DEFAULT 'pending', -- pending | active
  invite_token uuid DEFAULT gen_random_uuid() UNIQUE,
  invited_at   timestamptz NOT NULL DEFAULT now(),
  joined_at    timestamptz,
  UNIQUE(team_id, email)
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER function to check team ownership without triggering RLS on teams
-- (avoids circular RLS: teams → team_members → teams → ∞ → 500)
CREATE OR REPLACE FUNCTION get_team_owner_id(p_team_id uuid)
RETURNS uuid AS $$
  SELECT owner_id FROM teams WHERE id = p_team_id
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Team owner can do everything with their team's members
CREATE POLICY "team_owner_member_all" ON team_members
  FOR ALL USING (
    get_team_owner_id(team_members.team_id) = auth.uid()
  );

-- Members can read their own record (so they can see their invite)
CREATE POLICY "member_self_select" ON team_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR email = auth.email()
  );

-- Members can update their own record (to join/accept)
CREATE POLICY "member_self_update" ON team_members
  FOR UPDATE USING (
    user_id = auth.uid()
    OR email = auth.email()
  );

-- Anyone can read by invite_token (for accepting invites before login)
CREATE POLICY "invite_token_select" ON team_members
  FOR SELECT USING (true);

-- ─── Now safe to add the cross-table policy on teams ─────────────────────────

CREATE POLICY "team_member_select" ON teams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = teams.id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
  );

-- ─── Trial emails tracking ────────────────────────────────────────────────────
-- Tracks which reminder emails have been sent to avoid duplicates.

CREATE TABLE IF NOT EXISTS trial_emails_sent (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email_type  text NOT NULL, -- day7 | day12 | day14
  sent_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, email_type)
);

ALTER TABLE trial_emails_sent ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) can access
CREATE POLICY "trial_emails_deny_all" ON trial_emails_sent
  USING (false);

-- ─── Auto-create team when user signs up ─────────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user_team()
RETURNS TRIGGER AS $$
DECLARE
  v_team_id uuid;
BEGIN
  INSERT INTO teams (owner_id, owner_email, name, trial_start)
  VALUES (NEW.id, NEW.email, NEW.email, NEW.created_at)
  ON CONFLICT (owner_id) DO NOTHING
  RETURNING id INTO v_team_id;

  IF v_team_id IS NULL THEN
    SELECT id INTO v_team_id FROM teams WHERE owner_id = NEW.id;
  END IF;

  INSERT INTO team_members (team_id, user_id, email, role, status, joined_at)
  VALUES (v_team_id, NEW.id, NEW.email, 'owner', 'active', NOW())
  ON CONFLICT (team_id, email) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_team();

-- ─── Update updated_at on teams ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_teams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_teams_updated_at();

-- ─── Helper: seat count (active members) ─────────────────────────────────────

CREATE OR REPLACE FUNCTION get_team_seat_count(p_team_id uuid)
RETURNS int AS $$
  SELECT COUNT(*)::int
  FROM team_members
  WHERE team_id = p_team_id
    AND status = 'active';
$$ LANGUAGE sql SECURITY DEFINER;

-- ─── Schedule daily trial email check via pg_cron ─────────────────────────────
-- Run this after enabling the pg_cron extension in Supabase dashboard:
--
-- SELECT cron.schedule(
--   'send-trial-emails',
--   '0 9 * * *',  -- every day at 9am UTC
--   $$
--     SELECT net.http_post(
--       url := 'https://<project-ref>.supabase.co/functions/v1/send-trial-emails',
--       headers := '{"Authorization": "Bearer <anon-key>", "Content-Type": "application/json"}'::jsonb,
--       body := '{}'::jsonb
--     );
--   $$
-- );
