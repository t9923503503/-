-- Пул рейтинга: novice = половина очков от POINTS_TABLE(place), pro/NULL = полные очки.
ALTER TABLE tournament_results
  ADD COLUMN IF NOT EXISTS rating_pool TEXT;

COMMENT ON COLUMN tournament_results.rating_pool IS 'pro или NULL — полные очки за место; novice — round(очки/2).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_results_rating_pool_check'
  ) THEN
    ALTER TABLE tournament_results
      ADD CONSTRAINT tournament_results_rating_pool_check
      CHECK (rating_pool IS NULL OR rating_pool IN ('pro', 'novice'));
  END IF;
END $$;
