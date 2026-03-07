-- ================================================================
--  Deskly CRM - Automations user_id nullable patch
--  Run in: Supabase Dashboard → SQL Editor → New query
--
--  Problem: automations.user_id was created NOT NULL, but team
--  automations only have a team_id (no user_id). The upsert from
--  AutomationsPanel fails with 400 because user_id is required.
-- ================================================================

ALTER TABLE public.automations
  ALTER COLUMN user_id DROP NOT NULL;
