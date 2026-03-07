-- ─────────────────────────────────────────────────────────────────────────────
-- Team Activity Logs - tracks member actions so the owner can review history
-- Run this in the Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_activity_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email   text,
  action       text NOT NULL, -- 'created' | 'updated' | 'deleted' | 'completed' | 'stage_changed'
  entity_type  text NOT NULL, -- 'contact' | 'deal' | 'task'
  entity_id    uuid,
  entity_name  text,
  details      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE team_activity_logs ENABLE ROW LEVEL SECURITY;

-- Only the team owner can read activity logs
CREATE POLICY "team_owner_activity_select" ON team_activity_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM teams WHERE id = team_activity_logs.team_id AND owner_id = auth.uid())
  );

-- Any active team member (including owner) can insert their own logs
CREATE POLICY "member_activity_insert" ON team_activity_logs
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = team_activity_logs.team_id
        AND user_id = auth.uid()
        AND status = 'active'
    )
  );

-- Index for fast lookups by team + member
CREATE INDEX IF NOT EXISTS idx_team_activity_team_user
  ON team_activity_logs (team_id, user_id, created_at DESC);
