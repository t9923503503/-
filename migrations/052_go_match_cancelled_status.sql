BEGIN;

ALTER TABLE go_match
  DROP CONSTRAINT IF EXISTS go_match_status_check;

ALTER TABLE go_match
  ADD CONSTRAINT go_match_status_check
  CHECK (status IN ('pending', 'live', 'finished', 'cancelled'));

COMMIT;
