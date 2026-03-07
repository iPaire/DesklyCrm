-- Migration: add current_period_end to teams
-- Run in Supabase SQL editor

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
