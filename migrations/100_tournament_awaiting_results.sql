-- Keep tournaments reviewable until verified results are published.
DO $$
BEGIN
  ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check;
  ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_status_check
    CHECK (status IN ('draft', 'open', 'full', 'in_progress', 'awaiting_results', 'finished', 'cancelled'));
END $$;
