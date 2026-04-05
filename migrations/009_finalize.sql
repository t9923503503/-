-- ============================================================
-- 009: Finalize Tournament RPC
-- Phase 8 (S8.3)
-- ============================================================

-- Accepts tournament results, writes them to tournament_results,
-- updates player ratings, and records rating history snapshots.
--
-- p_results: JSONB array of { player_id, placement, points, format?, division? }
--
-- Returns: { ok: true, results_count: N } or { ok: false, error: '...' }

CREATE OR REPLACE FUNCTION finalize_tournament(
  p_tournament_id TEXT,
  p_results       JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
  v_row   RECORD;
BEGIN
  -- Validate inputs
  IF p_tournament_id IS NULL OR p_tournament_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOURNAMENT_ID_REQUIRED');
  END IF;
  IF p_results IS NULL OR jsonb_array_length(p_results) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RESULTS_REQUIRED');
  END IF;

  -- Check for duplicate finalization
  IF EXISTS (SELECT 1 FROM tournament_results WHERE tournament_id = p_tournament_id LIMIT 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_FINALIZED');
  END IF;

  -- 1. Insert results into tournament_results
  INSERT INTO tournament_results (tournament_id, player_id, placement, points, format, division)
  SELECT
    p_tournament_id,
    r->>'player_id',
    (r->>'placement')::int,
    coalesce((r->>'points')::numeric, 0),
    coalesce(r->>'format', ''),
    coalesce(r->>'division', '')
  FROM jsonb_array_elements(p_results) r
  ON CONFLICT (tournament_id, player_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 2. Update player ratings (if players table exists and has the columns)
  -- We use a dynamic approach: sum points per player from this tournament
  BEGIN
    UPDATE players p
       SET total_pts    = coalesce(p.total_pts, 0) + tr.points,
           tournaments  = coalesce(p.tournaments, 0) + 1,
           updated_at   = now()
      FROM tournament_results tr
     WHERE tr.tournament_id = p_tournament_id
       AND tr.player_id = p.id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    -- players table may not have these columns yet — skip silently
    NULL;
  END;

  -- 3. Record rating history snapshots
  BEGIN
    INSERT INTO rating_history (player_id, tournament_id, delta, new_total, recorded_at)
    SELECT
      tr.player_id,
      p_tournament_id,
      tr.points,
      coalesce(p.total_pts, tr.points),
      now()
    FROM tournament_results tr
    LEFT JOIN players p ON p.id = tr.player_id
    WHERE tr.tournament_id = p_tournament_id;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok',            true,
    'results_count', v_count,
    'tournament_id', p_tournament_id
  );
END;
$$;

-- ── List tournament results ─────────────────────────────────
CREATE OR REPLACE FUNCTION get_tournament_results(p_tournament_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN coalesce(
    (SELECT jsonb_agg(jsonb_build_object(
      'player_id',  tr.player_id,
      'placement',  tr.placement,
      'points',     tr.points,
      'format',     tr.format,
      'division',   tr.division
    ) ORDER BY tr.placement)
    FROM tournament_results tr
    WHERE tr.tournament_id = p_tournament_id),
    '[]'::jsonb
  );
END;
$$;

-- ── Get player rating history ───────────────────────────────
CREATE OR REPLACE FUNCTION get_rating_history(p_player_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN coalesce(
    (SELECT jsonb_agg(jsonb_build_object(
      'tournament_id', rh.tournament_id,
      'delta',         rh.delta,
      'new_total',     rh.new_total,
      'recorded_at',   rh.recorded_at
    ) ORDER BY rh.recorded_at DESC)
    FROM rating_history rh
    WHERE rh.player_id = p_player_id),
    '[]'::jsonb
  );
END;
$$;

-- ── Get full rating leaderboard ─────────────────────────────
CREATE OR REPLACE FUNCTION get_rating_leaderboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN coalesce(
    (SELECT jsonb_agg(jsonb_build_object(
      'player_id',   p.id,
      'name',        p.name,
      'gender',      p.gender,
      'total_pts',   coalesce(p.total_pts, 0),
      'tournaments', coalesce(p.tournaments, 0)
    ) ORDER BY coalesce(p.total_pts, 0) DESC)
    FROM players p
    WHERE p.status = 'active'),
    '[]'::jsonb
  );
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION finalize_tournament(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tournament_results(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_rating_history(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_rating_leaderboard() TO authenticated;
