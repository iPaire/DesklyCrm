-- ============================================================
--  Team RLS Patch
--  Run this in: Supabase Dashboard → SQL Editor → New query
--  Fixes: team members can't see each other's contacts/deals/tasks
-- ============================================================

-- ─── Helper: check if two users share an active team membership ────────────────
-- SECURITY DEFINER so it bypasses RLS on team_members (no circular policy loops)
CREATE OR REPLACE FUNCTION are_in_same_team(viewer_id uuid, record_owner_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM team_members tm1
    JOIN team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = viewer_id
      AND tm2.user_id = record_owner_id
      AND tm1.status = 'active'
      AND tm2.status = 'active'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Contacts ─────────────────────────────────────────────────────────────────

-- Replace the own-only select policy with a team-aware one
DROP POLICY IF EXISTS "contacts: select own" ON public.contacts;
CREATE POLICY "contacts: select team"
  ON public.contacts FOR SELECT
  USING (
    auth.uid() = user_id
    OR are_in_same_team(auth.uid(), user_id)
  );

-- Allow team members to update any contact in their team
DROP POLICY IF EXISTS "contacts: update own" ON public.contacts;
CREATE POLICY "contacts: update team"
  ON public.contacts FOR UPDATE
  USING (
    auth.uid() = user_id
    OR are_in_same_team(auth.uid(), user_id)
  );

-- Allow team members to delete any contact in their team
DROP POLICY IF EXISTS "contacts: delete own" ON public.contacts;
CREATE POLICY "contacts: delete team"
  ON public.contacts FOR DELETE
  USING (
    auth.uid() = user_id
    OR are_in_same_team(auth.uid(), user_id)
  );

-- ─── Deals ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "deals: select own" ON public.deals;
CREATE POLICY "deals: select team"
  ON public.deals FOR SELECT
  USING (
    auth.uid() = user_id
    OR are_in_same_team(auth.uid(), user_id)
  );

DROP POLICY IF EXISTS "deals: update own" ON public.deals;
CREATE POLICY "deals: update team"
  ON public.deals FOR UPDATE
  USING (
    auth.uid() = user_id
    OR are_in_same_team(auth.uid(), user_id)
  );

DROP POLICY IF EXISTS "deals: delete own" ON public.deals;
CREATE POLICY "deals: delete team"
  ON public.deals FOR DELETE
  USING (
    auth.uid() = user_id
    OR are_in_same_team(auth.uid(), user_id)
  );

-- ─── Tasks ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tasks: select own" ON public.tasks;
CREATE POLICY "tasks: select team"
  ON public.tasks FOR SELECT
  USING (
    auth.uid() = user_id
    OR are_in_same_team(auth.uid(), user_id)
  );

DROP POLICY IF EXISTS "tasks: update own" ON public.tasks;
CREATE POLICY "tasks: update team"
  ON public.tasks FOR UPDATE
  USING (
    auth.uid() = user_id
    OR are_in_same_team(auth.uid(), user_id)
  );

DROP POLICY IF EXISTS "tasks: delete own" ON public.tasks;
CREATE POLICY "tasks: delete team"
  ON public.tasks FOR DELETE
  USING (
    auth.uid() = user_id
    OR are_in_same_team(auth.uid(), user_id)
  );
