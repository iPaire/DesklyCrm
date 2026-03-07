-- ================================================================
--  Deskly CRM - Automations Team Patch
--  Migrates automations from per-user to per-team storage.
--  Run in: Supabase Dashboard → SQL Editor → New query
-- ================================================================

-- 1. Add team_id column (nullable - existing _daily_check rows keep user_id, no team_id)
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE;

-- 2. Unique constraint for team automations
--    PostgreSQL treats NULLs as distinct in UNIQUE constraints, so multiple
--    rows with team_id = NULL (i.e. _daily_check rows) are still allowed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'automations_team_type_key'
  ) THEN
    ALTER TABLE public.automations
      ADD CONSTRAINT automations_team_type_key UNIQUE (team_id, automation_type);
  END IF;
END$$;

-- 3. Fast lookup index
CREATE INDEX IF NOT EXISTS automations_team_id_idx ON public.automations (team_id);

-- 4. RLS - let any active team member read the shared team automation settings
CREATE POLICY "automations: select team member"
  ON public.automations FOR SELECT
  USING (
    team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = automations.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.status = 'active'
    )
  );

-- 5. Only the team owner can write (insert/update/delete) team automation settings
CREATE POLICY "automations: insert team owner"
  ON public.automations FOR INSERT
  WITH CHECK (
    team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = automations.team_id
        AND teams.owner_id = auth.uid()
    )
  );

CREATE POLICY "automations: update team owner"
  ON public.automations FOR UPDATE
  USING (
    team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = automations.team_id
        AND teams.owner_id = auth.uid()
    )
  );

CREATE POLICY "automations: delete team owner"
  ON public.automations FOR DELETE
  USING (
    team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = automations.team_id
        AND teams.owner_id = auth.uid()
    )
  );
