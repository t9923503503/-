-- 090: lightweight, revision-safe live scoring for ordinary games.

BEGIN;

CREATE TABLE IF NOT EXISTS play_game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL UNIQUE REFERENCES play_posts(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('classic_2x2', 'thai_8', 'king_sideout')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS play_game_session_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES play_game_sessions(id) ON DELETE CASCADE,
  command_id UUID NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('set_match_score', 'set_pair_points', 'add_set', 'undo')),
  expected_revision INTEGER NOT NULL,
  applied_revision INTEGER NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, command_id)
);

CREATE INDEX IF NOT EXISTS play_game_sessions_active_idx
  ON play_game_sessions(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS play_game_session_commands_session_idx
  ON play_game_session_commands(session_id, applied_revision);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE play_game_sessions TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE play_game_session_commands TO lpbvolley';
  END IF;
END $$;

COMMIT;
