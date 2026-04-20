-- Fix trigger_check_achievements(): local PL/pgSQL variable names must not
-- shadow tournament_results columns used in SQL expressions.
CREATE OR REPLACE FUNCTION public.trigger_check_achievements()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_tournament_id uuid;
  v_player_id uuid;
  tournament_stats record;
  recent_streak int;
BEGIN
  v_tournament_id := NEW.tournament_id;
  v_player_id := NEW.player_id;

  -- 1. "Железобетон": минимум пропущенных мячей за турнир.
  SELECT
    MIN(CASE WHEN tr.balls IS NOT NULL THEN tr.balls ELSE NULL END),
    COUNT(*) AS matches_count
  INTO tournament_stats
  FROM tournament_results tr
  WHERE tr.tournament_id = v_tournament_id
    AND tr.player_id = v_player_id
    AND tr.balls IS NOT NULL;

  IF tournament_stats.matches_count > 0 AND tournament_stats.min < 8 THEN
    INSERT INTO player_achievements (player_id, badge_type, metadata)
    VALUES (
      v_player_id,
      'iron_fortress',
      jsonb_build_object('avg_balls_conceded', tournament_stats.min)
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- 2. "Король концовок": 3+ побед с diff 1-2 за турнир.
  SELECT COUNT(*)
  INTO recent_streak
  FROM tournament_results tr
  WHERE tr.tournament_id = v_tournament_id
    AND tr.player_id = v_player_id
    AND tr.diff BETWEEN 1 AND 2
    AND tr.place = 1;

  IF recent_streak >= 3 THEN
    INSERT INTO player_achievements (player_id, badge_type, metadata)
    VALUES (
      v_player_id,
      'closer_king',
      jsonb_build_object('tight_wins', recent_streak)
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- 3. "Каток": победа с diff >= 12.
  IF NEW.place = 1 AND NEW.diff >= 12 THEN
    INSERT INTO player_achievements (player_id, badge_type, metadata)
    VALUES (
      v_player_id,
      'steamroller',
      jsonb_build_object('max_diff', NEW.diff, 'tournament_id', v_tournament_id::text)
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
