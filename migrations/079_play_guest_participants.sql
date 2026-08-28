-- 079: tournament players without an LPVolley account may join ordinary games.

CREATE SEQUENCE IF NOT EXISTS play_participant_result_key_seq START WITH 1000000000;

ALTER TABLE play_post_participants ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE play_post_participants ADD COLUMN IF NOT EXISTS result_key BIGINT;
ALTER TABLE play_post_participants
  ALTER COLUMN result_key SET DEFAULT nextval('play_participant_result_key_seq');

UPDATE play_post_participants
   SET result_key = nextval('play_participant_result_key_seq')
 WHERE result_key IS NULL;

ALTER TABLE play_post_participants ALTER COLUMN result_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS play_participants_post_result_key_unique
  ON play_post_participants(post_id, result_key);
CREATE UNIQUE INDEX IF NOT EXISTS play_participants_post_player_unique
  ON play_post_participants(post_id, player_id) WHERE player_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE play_participant_result_key_seq TO lpbvolley';
  END IF;
END $$;
