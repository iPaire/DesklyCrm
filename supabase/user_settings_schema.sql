-- ─────────────────────────────────────────────────────────────────────────────
-- User settings: stores per-user preferences (e.g. custom contact columns)
-- Run this in the Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_settings (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_columns jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_settings_select" ON user_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_settings_insert" ON user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_settings_update" ON user_settings
  FOR UPDATE USING (auth.uid() = user_id);
