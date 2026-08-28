-- 089: one-time account claim links for named guests in ordinary games.

BEGIN;

ALTER TABLE play_post_participants
  ADD COLUMN IF NOT EXISTS name_snapshot TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS guest_claim_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS guest_claim_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guest_claimed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION fill_play_participant_name_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name_snapshot = ''
     OR TG_OP = 'INSERT'
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.player_id IS DISTINCT FROM OLD.player_id
     OR NEW.guest_name IS DISTINCT FROM OLD.guest_name THEN
    NEW.name_snapshot := COALESCE(
      NULLIF(NEW.guest_name, ''),
      NULLIF((SELECT player.name FROM players player WHERE player.id = NEW.player_id), ''),
      NULLIF((SELECT app_user.full_name FROM users app_user WHERE app_user.id = NEW.user_id), ''),
      'Игрок'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS play_participant_name_snapshot_trigger ON play_post_participants;
CREATE TRIGGER play_participant_name_snapshot_trigger
BEFORE INSERT OR UPDATE OF user_id, player_id, guest_name, name_snapshot
ON play_post_participants
FOR EACH ROW EXECUTE FUNCTION fill_play_participant_name_snapshot();

UPDATE play_post_participants participant
   SET name_snapshot = COALESCE(
     NULLIF(participant.guest_name, ''),
     NULLIF((SELECT player.name FROM players player WHERE player.id = participant.player_id), ''),
     NULLIF((SELECT app_user.full_name FROM users app_user WHERE app_user.id = participant.user_id), ''),
     'Игрок'
   )
 WHERE participant.name_snapshot = '';

CREATE UNIQUE INDEX IF NOT EXISTS play_participants_guest_claim_token_unique
  ON play_post_participants(guest_claim_token_hash)
  WHERE guest_claim_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS play_participants_guest_claim_expiry_idx
  ON play_post_participants(guest_claim_expires_at)
  WHERE guest_claim_token_hash IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, UPDATE ON TABLE play_post_participants TO lpbvolley';
    EXECUTE 'GRANT EXECUTE ON FUNCTION fill_play_participant_name_snapshot() TO lpbvolley';
  END IF;
END $$;

COMMIT;
