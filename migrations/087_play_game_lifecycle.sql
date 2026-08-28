-- 087: Rated/friendly ordinary games and organizer-approved, revision-safe results.

ALTER TABLE play_posts
  ADD COLUMN IF NOT EXISTS rating_mode TEXT NOT NULL DEFAULT 'rated',
  ADD COLUMN IF NOT EXISTS result_format TEXT NOT NULL DEFAULT 'legacy_custom',
  ADD COLUMN IF NOT EXISTS result_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS result_entry_mode TEXT NOT NULL DEFAULT 'after_game';

UPDATE play_posts SET rating_mode = 'friendly' WHERE kind = 'training';

UPDATE play_posts
   SET result_format = CASE
     WHEN lower(COALESCE(format_label, '')) ~ '2[[:space:]]*[x×][[:space:]]*2' THEN 'classic_2x2'
     WHEN lower(COALESCE(format_label, '')) LIKE '%thai%'
       OR lower(COALESCE(format_label, '')) LIKE '%тай%' THEN 'thai_8'
     WHEN lower(COALESCE(format_label, '')) LIKE '%king%'
       OR lower(COALESCE(format_label, '')) LIKE '%сайд%' THEN 'king_sideout'
     ELSE 'legacy_custom'
   END
 WHERE result_format = 'legacy_custom';

UPDATE play_posts
   SET result_config = CASE result_format
     WHEN 'classic_2x2' THEN '{"pointLimit":21,"decidingPointLimit":15,"pairingMode":"fixed","bestOf":1}'::jsonb
     WHEN 'thai_8' THEN '{"pointLimit":15,"pairingMode":"random","tourCount":4}'::jsonb
     WHEN 'king_sideout' THEN '{"pointLimit":15,"pairingMode":"random","roundDurationMinutes":10}'::jsonb
     ELSE '{}'::jsonb
   END
 WHERE result_config = '{}'::jsonb;

ALTER TABLE play_posts DROP CONSTRAINT IF EXISTS play_posts_rating_mode_check;
ALTER TABLE play_posts ADD CONSTRAINT play_posts_rating_mode_check
  CHECK (rating_mode IN ('rated', 'friendly'));
ALTER TABLE play_posts DROP CONSTRAINT IF EXISTS play_posts_result_format_check;
ALTER TABLE play_posts ADD CONSTRAINT play_posts_result_format_check
  CHECK (result_format IN ('classic_2x2', 'thai_8', 'king_sideout', 'legacy_custom'));
ALTER TABLE play_posts DROP CONSTRAINT IF EXISTS play_posts_result_config_object_check;
ALTER TABLE play_posts ADD CONSTRAINT play_posts_result_config_object_check
  CHECK (jsonb_typeof(result_config) = 'object');
ALTER TABLE play_posts DROP CONSTRAINT IF EXISTS play_posts_result_entry_mode_check;
ALTER TABLE play_posts ADD CONSTRAINT play_posts_result_entry_mode_check
  CHECK (result_entry_mode IN ('after_game', 'live_lite'));

ALTER TABLE play_game_results
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS entered_by_admin_actor TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_admin_actor TEXT;

ALTER TABLE play_game_results ALTER COLUMN auto_confirm_at DROP NOT NULL;
ALTER TABLE play_game_results ALTER COLUMN entered_by DROP NOT NULL;
UPDATE play_game_results
   SET approved_at = COALESCE(approved_at, updated_at, created_at),
       approved_by_user_id = COALESCE(approved_by_user_id, entered_by)
 WHERE status = 'confirmed';
UPDATE play_game_results SET auto_confirm_at = NULL WHERE status = 'pending';

ALTER TABLE play_game_results DROP CONSTRAINT IF EXISTS play_game_results_revision_check;
ALTER TABLE play_game_results ADD CONSTRAINT play_game_results_revision_check CHECK (revision > 0);
ALTER TABLE play_game_results DROP CONSTRAINT IF EXISTS play_game_results_approval_actor_check;
ALTER TABLE play_game_results ADD CONSTRAINT play_game_results_approval_actor_check
  CHECK (approved_by_user_id IS NULL OR approved_by_admin_actor IS NULL);
ALTER TABLE play_game_results DROP CONSTRAINT IF EXISTS play_game_results_entry_actor_check;
ALTER TABLE play_game_results ADD CONSTRAINT play_game_results_entry_actor_check
  CHECK ((entered_by IS NULL) <> (entered_by_admin_actor IS NULL));

CREATE TABLE IF NOT EXISTS play_result_revisions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id             UUID NOT NULL REFERENCES play_game_results(id) ON DELETE CASCADE,
  revision              INTEGER NOT NULL CHECK (revision > 0),
  payload               JSONB NOT NULL,
  entered_by_user_id    INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  entered_by_admin_actor TEXT,
  lifecycle_status      TEXT NOT NULL DEFAULT 'pending'
                        CHECK (lifecycle_status IN ('pending', 'confirmed', 'disputed', 'cancelled')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (result_id, revision)
);

ALTER TABLE play_result_revisions ALTER COLUMN entered_by_user_id DROP NOT NULL;
ALTER TABLE play_result_revisions ADD COLUMN IF NOT EXISTS entered_by_admin_actor TEXT;
ALTER TABLE play_result_revisions DROP CONSTRAINT IF EXISTS play_result_revisions_entry_actor_check;
ALTER TABLE play_result_revisions ADD CONSTRAINT play_result_revisions_entry_actor_check
  CHECK ((entered_by_user_id IS NULL) <> (entered_by_admin_actor IS NULL));

INSERT INTO play_result_revisions
  (result_id, revision, payload, entered_by_user_id, entered_by_admin_actor, lifecycle_status, created_at)
SELECT id, revision, payload, entered_by, entered_by_admin_actor, status, created_at
  FROM play_game_results
ON CONFLICT (result_id, revision) DO NOTHING;

CREATE TABLE IF NOT EXISTS play_result_correction_requests (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id              UUID NOT NULL REFERENCES play_game_results(id) ON DELETE CASCADE,
  result_revision        INTEGER NOT NULL CHECK (result_revision > 0),
  requested_by_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment                TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  resolution_comment     TEXT NOT NULL DEFAULT '',
  resolved_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_by_admin_actor TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at            TIMESTAMPTZ,
  CHECK (length(btrim(comment)) BETWEEN 3 AND 500),
  CHECK (resolved_by_user_id IS NULL OR resolved_by_admin_actor IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS play_result_correction_one_pending_idx
  ON play_result_correction_requests(result_id, requested_by_user_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS play_result_correction_result_idx
  ON play_result_correction_requests(result_id, created_at DESC);

ALTER TABLE play_game_rating_events
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

UPDATE play_game_rating_events event
   SET revision = result.revision
  FROM play_game_results result
 WHERE result.id = event.result_id;

ALTER TABLE play_game_rating_events
  DROP CONSTRAINT IF EXISTS play_game_rating_events_result_id_user_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'play_game_rating_events_result_revision_user_key'
  ) THEN
    ALTER TABLE play_game_rating_events
      ADD CONSTRAINT play_game_rating_events_result_revision_user_key
      UNIQUE (result_id, revision, user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE play_result_revisions TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE play_result_correction_requests TO lpbvolley';
  END IF;
END $$;
