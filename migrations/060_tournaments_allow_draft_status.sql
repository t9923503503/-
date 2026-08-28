ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check;

ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_status_check
  CHECK (status IN ('draft', 'open', 'full', 'finished', 'cancelled'));
