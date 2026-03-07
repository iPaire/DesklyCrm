-- ============================================================
--  Deskly CRM - Team join notification trigger
--  Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Creates in-app notifications (bypassing RLS via SECURITY DEFINER) when:
--   1. A team member accepts an invitation  → notify the new member + the owner
-- ============================================================

CREATE OR REPLACE FUNCTION notify_on_team_join()
RETURNS TRIGGER AS $$
DECLARE
  v_team_name TEXT;
  v_owner_id  UUID;
BEGIN
  -- Only fire when status flips to active and user_id is set
  IF NEW.status = 'active'
     AND NEW.user_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'active')
  THEN
    SELECT COALESCE(t.name, t.owner_email, 'your team'), t.owner_id
      INTO v_team_name, v_owner_id
      FROM teams t
     WHERE t.id = NEW.team_id;

    -- Notify the new member
    INSERT INTO notifications (user_id, title, body, link_to)
    VALUES (
      NEW.user_id,
      'Ai fost adăugat în echipă!',
      'Ai acceptat invitația și te-ai alăturat echipei ' || v_team_name || '. Bun venit!',
      '/dashboard'
    );

    -- Notify the team owner (only if different from the new member)
    IF v_owner_id IS NOT NULL AND v_owner_id <> NEW.user_id THEN
      INSERT INTO notifications (user_id, title, body, link_to)
      VALUES (
        v_owner_id,
        NEW.email || ' s-a alăturat echipei',
        'Invitația a fost acceptată. Noul membru a acces acum la spațiul de lucru.',
        '/settings'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old trigger if exists, then recreate
DROP TRIGGER IF EXISTS trg_team_member_join ON team_members;

CREATE TRIGGER trg_team_member_join
  AFTER UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_team_join();
