-- Allow a member to delete their own team_members row (i.e. "leave team")
-- Run this in the Supabase SQL editor.

CREATE POLICY "member_self_delete" ON team_members
  FOR DELETE USING (
    user_id = auth.uid()
    AND role = 'member'  -- owners cannot leave via this policy (must transfer or delete team)
  );
