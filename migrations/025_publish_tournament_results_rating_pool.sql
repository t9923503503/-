-- Расширение RPC: сохранение rating_pool из JSON (для PostgREST / admin-postgrest).
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
AS $$
DECLARE
  v_trn_id  UUID;
  v_rec     RECORD;
  v_player  players%ROWTYPE;
  v_count   INT := 0;
BEGIN
  INSERT INTO tournaments (name, date, format, division, status, capacity, external_id)
  VALUES (
    trim(p_name),
    NULLIF(trim(p_date), '')::DATE,
    COALESCE(NULLIF(trim(p_format), ''), 'King of the Court'),
    COALESCE(NULLIF(trim(p_division), ''), 'Мужской'),
    'finished',
    jsonb_array_length(p_results),
    p_external_id
  )
  ON CONFLICT (external_id) DO UPDATE
    SET name   = EXCLUDED.name,
        date   = EXCLUDED.date,
        status = 'finished'
  RETURNING id INTO v_trn_id;

  IF v_trn_id IS NULL THEN
    SELECT id INTO v_trn_id
      FROM tournaments
     WHERE external_id = p_external_id
     LIMIT 1;
  END IF;

  IF v_trn_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOURNAMENT_UPSERT_FAILED');
  END IF;

  FOR v_rec IN
    SELECT *
    FROM jsonb_to_recordset(p_results) AS x(
      name              TEXT,
      gender            TEXT,
      place             INT,
      game_pts          INT,
      rating_pts        INT,
      rating_type       TEXT,
      rating_pool       TEXT,
      rating_m          INT,
      rating_w          INT,
      rating_mix        INT,
      tournaments_m     INT,
      tournaments_w     INT,
      tournaments_mix   INT,
      wins              INT,
      last_seen         TEXT,
      total_pts         INT,
      tournaments_played INT
    )
  LOOP
    INSERT INTO players (
      name, gender, status,
      rating_m, rating_w, rating_mix,
      tournaments_m, tournaments_w, tournaments_mix,
      wins, last_seen, tournaments_played, total_pts
    )
    VALUES (
      trim(v_rec.name), v_rec.gender, 'active',
      COALESCE(v_rec.rating_m,  0),
      COALESCE(v_rec.rating_w,  0),
      COALESCE(v_rec.rating_mix,0),
      COALESCE(v_rec.tournaments_m,   0),
      COALESCE(v_rec.tournaments_w,   0),
      COALESCE(v_rec.tournaments_mix, 0),
      COALESCE(v_rec.wins, 0),
      CASE WHEN v_rec.last_seen IS NOT NULL AND v_rec.last_seen <> ''
           THEN v_rec.last_seen::DATE ELSE NULL END,
      COALESCE(v_rec.tournaments_played, 0),
      COALESCE(v_rec.total_pts, 0)
    )
    ON CONFLICT (lower(trim(name)), gender) DO UPDATE SET
      status            = 'active',
      rating_m          = EXCLUDED.rating_m,
      rating_w          = EXCLUDED.rating_w,
      rating_mix        = EXCLUDED.rating_mix,
      tournaments_m     = EXCLUDED.tournaments_m,
      tournaments_w     = EXCLUDED.tournaments_w,
      tournaments_mix   = EXCLUDED.tournaments_mix,
      wins              = EXCLUDED.wins,
      last_seen         = CASE
                            WHEN EXCLUDED.last_seen IS NOT NULL
                            THEN GREATEST(players.last_seen, EXCLUDED.last_seen)
                            ELSE players.last_seen
                          END,
      tournaments_played = EXCLUDED.tournaments_played,
      total_pts         = EXCLUDED.total_pts
    RETURNING * INTO v_player;

    IF v_player.id IS NULL THEN
      SELECT * INTO v_player FROM players
       WHERE lower(trim(name)) = lower(trim(v_rec.name))
         AND gender = v_rec.gender
       LIMIT 1;
    END IF;

    IF v_player.id IS NULL THEN CONTINUE; END IF;

    INSERT INTO tournament_results
      (tournament_id, player_id, place, game_pts, rating_pts, gender, rating_type, rating_pool)
    VALUES
      (v_trn_id, v_player.id,
       v_rec.place,
       COALESCE(v_rec.game_pts,   0),
       COALESCE(v_rec.rating_pts, 0),
       v_rec.gender,
       COALESCE(NULLIF(v_rec.rating_type, ''), 'M'),
       CASE
         WHEN NULLIF(TRIM(COALESCE(v_rec.rating_pool, '')), '') = 'novice' THEN 'novice'
         ELSE NULL
       END)
    ON CONFLICT (tournament_id, player_id) DO UPDATE SET
      place      = EXCLUDED.place,
      game_pts   = EXCLUDED.game_pts,
      rating_pts = EXCLUDED.rating_pts,
      rating_pool = EXCLUDED.rating_pool;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',            true,
    'tournament_id', v_trn_id,
    'results_saved', v_count
  );
END;
$$;
