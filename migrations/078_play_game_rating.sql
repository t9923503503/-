-- 078: Отдельный игровой рейтинг для подтверждённых обычных матчей.
-- Турнирные players.rating_* и rating_history намеренно не используются.

CREATE TABLE IF NOT EXISTS play_game_rating_accounts (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating         INTEGER NOT NULL DEFAULT 1000,
  matches        INTEGER NOT NULL DEFAULT 0,
  wins           INTEGER NOT NULL DEFAULT 0,
  losses         INTEGER NOT NULL DEFAULT 0,
  points_for     INTEGER NOT NULL DEFAULT 0,
  points_against INTEGER NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS play_game_rating_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id     UUID NOT NULL REFERENCES play_game_results(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating_before INTEGER NOT NULL,
  delta         INTEGER NOT NULL,
  rating_after  INTEGER NOT NULL,
  wins          INTEGER NOT NULL DEFAULT 0,
  losses        INTEGER NOT NULL DEFAULT 0,
  points_for    INTEGER NOT NULL DEFAULT 0,
  points_against INTEGER NOT NULL DEFAULT 0,
  reversed_at   TIMESTAMPTZ,
  reversal_reason TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (result_id, user_id)
);

ALTER TABLE play_game_rating_events ADD COLUMN IF NOT EXISTS points_for INTEGER NOT NULL DEFAULT 0;
ALTER TABLE play_game_rating_events ADD COLUMN IF NOT EXISTS points_against INTEGER NOT NULL DEFAULT 0;
ALTER TABLE play_game_rating_events ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE play_game_rating_events ADD COLUMN IF NOT EXISTS reversal_reason TEXT NOT NULL DEFAULT '';

ALTER TABLE play_game_results ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE play_game_results ADD COLUMN IF NOT EXISTS reversed_by TEXT;
ALTER TABLE play_game_results ADD COLUMN IF NOT EXISTS reversal_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE play_game_results DROP CONSTRAINT IF EXISTS play_game_results_status_check;
ALTER TABLE play_game_results ADD CONSTRAINT play_game_results_status_check
  CHECK (status IN ('pending', 'confirmed', 'disputed', 'cancelled'));

CREATE TABLE IF NOT EXISTS play_game_rating_opponents (
  result_id       UUID NOT NULL REFERENCES play_game_results(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (result_id, user_id, opponent_user_id),
  CHECK (user_id <> opponent_user_id)
);

CREATE INDEX IF NOT EXISTS play_game_rating_events_user_idx ON play_game_rating_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS play_game_rating_opponents_pair_idx ON play_game_rating_opponents(user_id, opponent_user_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE play_game_rating_accounts, play_game_rating_events, play_game_rating_opponents TO lpbvolley';
  END IF;
END $$;
