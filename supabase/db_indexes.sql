-- ============================================================
--  Deskly CRM - Missing Performance Indexes
--  Run in: Supabase Dashboard → SQL Editor → New query
--
--  All statements are idempotent (IF NOT EXISTS).
-- ============================================================


-- ─── team_members ─────────────────────────────────────────────────────────────
--
-- MOST CRITICAL: get_user_team_id(user_id) is a SECURITY DEFINER function
-- called inside every RLS policy on contacts, deals, tasks, email_logs,
-- activity_logs, and notifications. Without this index every single DB
-- read/write does a full table scan of team_members.

CREATE INDEX IF NOT EXISTS team_members_user_id_status_idx
  ON public.team_members (user_id, status);

-- Team listing and member count queries
CREATE INDEX IF NOT EXISTS team_members_team_id_status_idx
  ON public.team_members (team_id, status);


-- ─── deals ────────────────────────────────────────────────────────────────────
--
-- Main board query: WHERE user_id IN (...) AND archived = false
-- The single-column indexes on user_id and archived exist, but the planner
-- often picks a sequential scan for combined filters at scale.

CREATE INDEX IF NOT EXISTS deals_user_id_archived_idx
  ON public.deals (user_id, archived)
  WHERE archived = false;   -- partial index - only non-archived rows

-- Pipeline value aggregation per stage
CREATE INDEX IF NOT EXISTS deals_user_id_stage_archived_idx
  ON public.deals (user_id, stage, archived);


-- ─── tasks ────────────────────────────────────────────────────────────────────
--
-- Overdue task check: WHERE user_id = ? AND completed = false AND due_date < today
-- Individual indexes on completed and due_date exist but a compound index is
-- more selective and avoids a second filter pass.

CREATE INDEX IF NOT EXISTS tasks_user_id_completed_due_date_idx
  ON public.tasks (user_id, completed, due_date)
  WHERE completed = false;  -- partial index - only incomplete tasks


-- ─── notifications ────────────────────────────────────────────────────────────
--
-- Unread count badge query: WHERE user_id = ? AND read = false
-- The (user_id, read) index already exists - no action needed.


-- ─── automations ──────────────────────────────────────────────────────────────
--
-- Team automation lookup: WHERE team_id = ? AND enabled = true
-- team_id index exists (from automations_team_patch.sql).
-- Add compound for the enabled filter used in run-daily-automations.

CREATE INDEX IF NOT EXISTS automations_team_id_enabled_idx
  ON public.automations (team_id, enabled)
  WHERE enabled = true AND team_id IS NOT NULL;
