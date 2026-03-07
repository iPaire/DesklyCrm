-- ============================================================
--  Deskly CRM - Team shared data access policies
--  Run in: Supabase Dashboard → SQL Editor → New query
--
--  Fixes: team members can now see and manage the team owner's
--  contacts, deals, and tasks (shared workspace).
-- ============================================================

-- ─── Helper function ─────────────────────────────────────────────────────────
-- Returns the team owner's user_id for the currently authenticated user.
-- For owners → returns their own id.
-- For members → returns their team's owner_id.

CREATE OR REPLACE FUNCTION get_my_team_owner_id()
RETURNS uuid AS $$
  SELECT t.owner_id
  FROM team_members tm
  JOIN teams t ON t.id = tm.team_id
  WHERE tm.user_id = auth.uid()
    AND tm.status = 'active'
  LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Contacts ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "contacts: select own" ON public.contacts;
CREATE POLICY "contacts: select own or team"
  ON public.contacts FOR SELECT
  USING (user_id = auth.uid() OR user_id = get_my_team_owner_id());

DROP POLICY IF EXISTS "contacts: insert own" ON public.contacts;
CREATE POLICY "contacts: insert own or team"
  ON public.contacts FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id = get_my_team_owner_id());

DROP POLICY IF EXISTS "contacts: update own" ON public.contacts;
CREATE POLICY "contacts: update own or team"
  ON public.contacts FOR UPDATE
  USING (user_id = auth.uid() OR user_id = get_my_team_owner_id());

DROP POLICY IF EXISTS "contacts: delete own" ON public.contacts;
CREATE POLICY "contacts: delete own or team"
  ON public.contacts FOR DELETE
  USING (user_id = auth.uid() OR user_id = get_my_team_owner_id());

-- ─── Deals ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "deals: select own" ON public.deals;
CREATE POLICY "deals: select own or team"
  ON public.deals FOR SELECT
  USING (user_id = auth.uid() OR user_id = get_my_team_owner_id());

DROP POLICY IF EXISTS "deals: insert own" ON public.deals;
CREATE POLICY "deals: insert own or team"
  ON public.deals FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id = get_my_team_owner_id());

DROP POLICY IF EXISTS "deals: update own" ON public.deals;
CREATE POLICY "deals: update own or team"
  ON public.deals FOR UPDATE
  USING (user_id = auth.uid() OR user_id = get_my_team_owner_id());

DROP POLICY IF EXISTS "deals: delete own" ON public.deals;
CREATE POLICY "deals: delete own or team"
  ON public.deals FOR DELETE
  USING (user_id = auth.uid() OR user_id = get_my_team_owner_id());

-- ─── Tasks ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tasks: select own" ON public.tasks;
CREATE POLICY "tasks: select own or team"
  ON public.tasks FOR SELECT
  USING (user_id = auth.uid() OR user_id = get_my_team_owner_id());

DROP POLICY IF EXISTS "tasks: insert own" ON public.tasks;
CREATE POLICY "tasks: insert own or team"
  ON public.tasks FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id = get_my_team_owner_id());

DROP POLICY IF EXISTS "tasks: update own" ON public.tasks;
CREATE POLICY "tasks: update own or team"
  ON public.tasks FOR UPDATE
  USING (user_id = auth.uid() OR user_id = get_my_team_owner_id());

DROP POLICY IF EXISTS "tasks: delete own" ON public.tasks;
CREATE POLICY "tasks: delete own or team"
  ON public.tasks FOR DELETE
  USING (user_id = auth.uid() OR user_id = get_my_team_owner_id());

-- ─── Activity logs ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "activity_logs: select own" ON public.activity_logs;
CREATE POLICY "activity_logs: select own or team"
  ON public.activity_logs FOR SELECT
  USING (user_id = auth.uid() OR user_id = get_my_team_owner_id());

DROP POLICY IF EXISTS "activity_logs: insert own" ON public.activity_logs;
CREATE POLICY "activity_logs: insert own or team"
  ON public.activity_logs FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id = get_my_team_owner_id());

DROP POLICY IF EXISTS "activity_logs: update own" ON public.activity_logs;
CREATE POLICY "activity_logs: update own or team"
  ON public.activity_logs FOR UPDATE
  USING (user_id = auth.uid() OR user_id = get_my_team_owner_id());

DROP POLICY IF EXISTS "activity_logs: delete own" ON public.activity_logs;
CREATE POLICY "activity_logs: delete own or team"
  ON public.activity_logs FOR DELETE
  USING (user_id = auth.uid() OR user_id = get_my_team_owner_id());
