-- KOTC Next: allow 5-round/5-ppc cycle in DB constraints.
-- Keep backward compatibility for old rows with rounds < 3 by allowing 1..5.

BEGIN;

ALTER TABLE tournaments
  DROP CONSTRAINT IF EXISTS kotc_raund_count_check;

ALTER TABLE tournaments
  ADD CONSTRAINT kotc_raund_count_check
  CHECK (kotc_raund_count BETWEEN 1 AND 5);

ALTER TABLE tournaments
  DROP CONSTRAINT IF EXISTS kotc_ppc_check;

ALTER TABLE tournaments
  ADD CONSTRAINT kotc_ppc_check
  CHECK (kotc_ppc BETWEEN 3 AND 5);

COMMIT;

