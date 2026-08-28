-- 068: Game results + participant confirmations (TZ-production-play-v3 §1.3, §1.4)

CREATE TABLE IF NOT EXISTS play_game_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id          UUID NOT NULL UNIQUE REFERENCES play_posts(id) ON DELETE CASCADE,
  entered_by       INTEGER NOT NULL REFERENCES users(id),
  payload          JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'confirmed', 'disputed')),
  auto_confirm_at  TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS play_result_confirmations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id    UUID NOT NULL REFERENCES play_game_results(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verdict      TEXT NOT NULL CHECK (verdict IN ('confirmed', 'disputed')),
  comment      TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (result_id, user_id)
);

CREATE INDEX IF NOT EXISTS play_results_post_idx ON play_game_results(post_id, status);
CREATE INDEX IF NOT EXISTS play_result_confirmations_user_idx
  ON play_result_confirmations(user_id, created_at DESC);

DROP TRIGGER IF EXISTS play_game_results_updated_at ON play_game_results;
CREATE TRIGGER play_game_results_updated_at BEFORE UPDATE ON play_game_results
FOR EACH ROW EXECUTE FUNCTION play_set_updated_at();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley'
  ) THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      play_game_results,
      play_result_confirmations
    TO lpbvolley';
  END IF;
END $$;
