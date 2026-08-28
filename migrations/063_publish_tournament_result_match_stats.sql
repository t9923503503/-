-- Preserve per-tournament Thai statistics when results are published through
-- the PostgREST fallback. The existing RPC's `wins` field belongs to the
-- player's lifetime aggregate, so result wins use a separate JSON key.

ALTER FUNCTION publish_tournament_results(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
  RENAME TO publish_tournament_results_without_match_stats;

CREATE OR REPLACE FUNCTION publish_tournament_results(
  p_external_id  TEXT,
  p_name         TEXT,
  p_date         TEXT,
  p_format       TEXT,
  p_division     TEXT,
  p_results      JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_response JSONB;
  v_tournament_id UUID;
  v_existing_player_wins JSONB;
BEGIN
  SELECT COALESCE(
           jsonb_agg(jsonb_build_object('id', p.id, 'wins', p.wins)),
           '[]'::JSONB
         )
    INTO v_existing_player_wins
    FROM players p
    JOIN jsonb_to_recordset(p_results) AS src(name TEXT, gender TEXT)
      ON LOWER(TRIM(p.name)) = LOWER(TRIM(src.name))
     AND p.gender = src.gender;

  v_response := publish_tournament_results_without_match_stats(
    p_external_id,
    p_name,
    p_date,
    p_format,
    p_division,
    p_results
  );

  IF COALESCE((v_response->>'ok')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RETURN v_response;
  END IF;

  v_tournament_id := NULLIF(v_response->>'tournament_id', '')::UUID;
  IF v_tournament_id IS NULL THEN
    RETURN v_response;
  END IF;

  UPDATE players p
     SET wins = saved.wins
    FROM jsonb_to_recordset(v_existing_player_wins) AS saved(id UUID, wins INT)
   WHERE p.id = saved.id;

  UPDATE tournament_results tr
     SET wins = COALESCE(src.result_wins, 0),
         diff = COALESCE(src.diff, 0),
         balls = COALESCE(src.balls, 0)
    FROM players p,
         jsonb_to_recordset(p_results) AS src(
           name TEXT,
           gender TEXT,
           result_wins INT,
           diff INT,
           balls INT
         )
   WHERE tr.tournament_id = v_tournament_id
     AND p.id = tr.player_id
     AND LOWER(TRIM(p.name)) = LOWER(TRIM(src.name))
     AND p.gender = src.gender;

  RETURN v_response;
END;
$$;
