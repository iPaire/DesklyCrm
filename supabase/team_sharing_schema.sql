-- ─────────────────────────────────────────────────────────────────────────────
-- Team data sharing: RLS + helpers
-- Run AFTER billing_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Add expires_at to team_members ──────────────────────────────────────────

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Auto-set 7-day expiry on new pending invites
CREATE OR REPLACE FUNCTION set_invite_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' AND NEW.expires_at IS NULL THEN
    NEW.expires_at = NOW() + INTERVAL '7 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS team_members_set_expiry ON team_members;
CREATE TRIGGER team_members_set_expiry
  BEFORE INSERT ON team_members
  FOR EACH ROW EXECUTE FUNCTION set_invite_expiry();

-- ─── Helper: get team_id for any user ────────────────────────────────────────
-- SECURITY DEFINER avoids RLS loops; used inside other policies.

CREATE OR REPLACE FUNCTION get_user_team_id(p_user_id uuid)
RETURNS uuid AS $$
  SELECT team_id FROM team_members
  WHERE user_id = p_user_id AND status = 'active'
  LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── contacts ────────────────────────────────────────────────────────────────
-- Adds team-member access on top of existing "own" policies.

CREATE POLICY "contacts: team select"
  ON public.contacts FOR SELECT
  USING (
    get_user_team_id(auth.uid()) IS NOT NULL
    AND get_user_team_id(auth.uid()) = get_user_team_id(user_id)
  );

CREATE POLICY "contacts: team update"
  ON public.contacts FOR UPDATE
  USING (
    get_user_team_id(auth.uid()) IS NOT NULL
    AND get_user_team_id(auth.uid()) = get_user_team_id(user_id)
  );

CREATE POLICY "contacts: team delete"
  ON public.contacts FOR DELETE
  USING (
    get_user_team_id(auth.uid()) IS NOT NULL
    AND get_user_team_id(auth.uid()) = get_user_team_id(user_id)
  );

-- ─── deals ───────────────────────────────────────────────────────────────────

CREATE POLICY "deals: team select"
  ON public.deals FOR SELECT
  USING (
    get_user_team_id(auth.uid()) IS NOT NULL
    AND get_user_team_id(auth.uid()) = get_user_team_id(user_id)
  );

CREATE POLICY "deals: team update"
  ON public.deals FOR UPDATE
  USING (
    get_user_team_id(auth.uid()) IS NOT NULL
    AND get_user_team_id(auth.uid()) = get_user_team_id(user_id)
  );

CREATE POLICY "deals: team delete"
  ON public.deals FOR DELETE
  USING (
    get_user_team_id(auth.uid()) IS NOT NULL
    AND get_user_team_id(auth.uid()) = get_user_team_id(user_id)
  );

-- ─── tasks ───────────────────────────────────────────────────────────────────

CREATE POLICY "tasks: team select"
  ON public.tasks FOR SELECT
  USING (
    get_user_team_id(auth.uid()) IS NOT NULL
    AND get_user_team_id(auth.uid()) = get_user_team_id(user_id)
  );

CREATE POLICY "tasks: team update"
  ON public.tasks FOR UPDATE
  USING (
    get_user_team_id(auth.uid()) IS NOT NULL
    AND get_user_team_id(auth.uid()) = get_user_team_id(user_id)
  );

CREATE POLICY "tasks: team delete"
  ON public.tasks FOR DELETE
  USING (
    get_user_team_id(auth.uid()) IS NOT NULL
    AND get_user_team_id(auth.uid()) = get_user_team_id(user_id)
  );

-- ─── email_logs ───────────────────────────────────────────────────────────────
-- Team members see each other's synced emails to shared contacts.

CREATE POLICY "email_logs: team select"
  ON public.email_logs FOR SELECT
  USING (
    get_user_team_id(auth.uid()) IS NOT NULL
    AND get_user_team_id(auth.uid()) = get_user_team_id(user_id)
  );

CREATE POLICY "email_logs: team update"
  ON public.email_logs FOR UPDATE
  USING (
    get_user_team_id(auth.uid()) IS NOT NULL
    AND get_user_team_id(auth.uid()) = get_user_team_id(user_id)
  );

CREATE POLICY "email_logs: team delete"
  ON public.email_logs FOR DELETE
  USING (
    get_user_team_id(auth.uid()) IS NOT NULL
    AND get_user_team_id(auth.uid()) = get_user_team_id(user_id)
  );

-- ─── activity_logs ────────────────────────────────────────────────────────────

CREATE POLICY "activity_logs: team select"
  ON public.activity_logs FOR SELECT
  USING (
    get_user_team_id(auth.uid()) IS NOT NULL
    AND get_user_team_id(auth.uid()) = get_user_team_id(user_id)
  );

CREATE POLICY "activity_logs: team update"
  ON public.activity_logs FOR UPDATE
  USING (
    get_user_team_id(auth.uid()) IS NOT NULL
    AND get_user_team_id(auth.uid()) = get_user_team_id(user_id)
  );

CREATE POLICY "activity_logs: team delete"
  ON public.activity_logs FOR DELETE
  USING (
    get_user_team_id(auth.uid()) IS NOT NULL
    AND get_user_team_id(auth.uid()) = get_user_team_id(user_id)
  );
