-- 091: explicit pre-game attendance confirmation for registered participants.

BEGIN;

ALTER TABLE play_post_participants
  ADD COLUMN IF NOT EXISTS attendance_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS attendance_responded_at TIMESTAMPTZ;

ALTER TABLE play_post_participants DROP CONSTRAINT IF EXISTS play_participant_attendance_status_check;
ALTER TABLE play_post_participants ADD CONSTRAINT play_participant_attendance_status_check
  CHECK (attendance_status IN ('unknown', 'going', 'not_going', 'attended', 'no_show'));

CREATE OR REPLACE FUNCTION reset_play_participant_attendance_on_rejoin()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('pending', 'confirmed', 'reserve')
     AND NEW.status IS DISTINCT FROM OLD.status
     AND OLD.status IN ('cancelled', 'rejected') THEN
    NEW.attendance_status := 'unknown';
    NEW.attendance_responded_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS play_participant_attendance_rejoin_trigger ON play_post_participants;
CREATE TRIGGER play_participant_attendance_rejoin_trigger
BEFORE UPDATE OF status ON play_post_participants
FOR EACH ROW EXECUTE FUNCTION reset_play_participant_attendance_on_rejoin();

CREATE INDEX IF NOT EXISTS play_participant_attendance_due_idx
  ON play_post_participants(post_id, attendance_status)
  WHERE status = 'confirmed';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, UPDATE ON TABLE play_post_participants TO lpbvolley';
    EXECUTE 'GRANT EXECUTE ON FUNCTION reset_play_participant_attendance_on_rejoin() TO lpbvolley';
  END IF;
END $$;

COMMIT;
