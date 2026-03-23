-- ============================================================
-- 007: Judge Sessions — multi-judge support (4 judges × 4 courts)
-- Phase 7 (S7.1)
-- ============================================================

-- Each row = one judge assigned to one court for one tournament.
-- Token is used in the URL: index.html?trnId=X&court=0&token=AAA
CREATE TABLE IF NOT EXISTS judge_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id TEXT NOT NULL,
  court_index   INT NOT NULL CHECK (court_index BETWEEN 0 AND 7),
  judge_name    TEXT NOT NULL DEFAULT '',
  token         TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
  UNIQUE(tournament_id, court_index)
);

ALTER TABLE judge_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE judge_sessions FROM PUBLIC, anon, authenticated;

-- ── Admin creates judge session for a court ─────────────────
-- Returns token for sharing with the judge.
-- If session already exists for this court — regenerates token.
CREATE OR REPLACE FUNCTION create_judge_session(
  p_trn_id  TEXT,
  p_court   INT,
  p_name    TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row judge_sessions%ROWTYPE;
BEGIN
  IF p_trn_id IS NULL OR p_trn_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOURNAMENT_ID_REQUIRED');
  END IF;
  IF p_court < 0 OR p_court > 7 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_COURT_INDEX');
  END IF;

  INSERT INTO judge_sessions (tournament_id, court_index, judge_name)
  VALUES (p_trn_id, p_court, coalesce(p_name, ''))
  ON CONFLICT (tournament_id, court_index) DO UPDATE
    SET judge_name = coalesce(EXCLUDED.judge_name, judge_sessions.judge_name),
        token      = encode(gen_random_bytes(24), 'hex'),
        expires_at = now() + interval '24 hours',
        created_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok',         true,
    'id',         v_row.id,
    'token',      v_row.token,
    'court',      v_row.court_index,
    'judge_name', v_row.judge_name,
    'expires_at', v_row.expires_at
  );
END;
$$;

-- ── Judge validates their token at SPA load ──────────────────
-- Returns tournament_id + court assignment if valid.
CREATE OR REPLACE FUNCTION validate_judge_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row judge_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_row
    FROM judge_sessions
   WHERE token = p_token
     AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_OR_EXPIRED_TOKEN');
  END IF;

  RETURN jsonb_build_object(
    'ok',            true,
    'tournament_id', v_row.tournament_id,
    'court_index',   v_row.court_index,
    'judge_name',    v_row.judge_name,
    'expires_at',    v_row.expires_at
  );
END;
$$;

-- ── List all judge sessions for a tournament ─────────────────
-- Used by admin panel to show assigned judges.
CREATE OR REPLACE FUNCTION list_judge_sessions(p_trn_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN coalesce(
    (SELECT jsonb_agg(jsonb_build_object(
      'court',      js.court_index,
      'judge_name', js.judge_name,
      'token',      js.token,
      'expires_at', js.expires_at
    ) ORDER BY js.court_index)
    FROM judge_sessions js
    WHERE js.tournament_id = p_trn_id
      AND js.expires_at > now()),
    '[]'::jsonb
  );
END;
$$;

-- Permissions: admin can create, anyone with token can validate
GRANT EXECUTE ON FUNCTION create_judge_session(TEXT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_judge_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION list_judge_sessions(TEXT) TO authenticated;
