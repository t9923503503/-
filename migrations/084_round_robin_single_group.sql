ALTER TABLE rr_tournament
  DROP CONSTRAINT IF EXISTS rr_tournament_group_count_check;

ALTER TABLE rr_tournament
  ADD CONSTRAINT rr_tournament_group_count_check
  CHECK (group_count BETWEEN 1 AND 4);
