-- KOTC Next: separate timers for Round 1 and Round 2 (R1/R2)

BEGIN;

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS kotc_r1_timer_minutes INT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS kotc_r2_timer_minutes INT DEFAULT 10;

UPDATE tournaments
SET
  kotc_r1_timer_minutes = COALESCE(kotc_raund_timer_minutes, kotc_r1_timer_minutes, 10),
  kotc_r2_timer_minutes = COALESCE(kotc_raund_timer_minutes, kotc_r2_timer_minutes, 10)
WHERE kotc_raund_timer_minutes IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kotc_r1_timer_check'
  ) THEN
    ALTER TABLE tournaments
      ADD CONSTRAINT kotc_r1_timer_check
      CHECK (kotc_r1_timer_minutes BETWEEN 9 AND 20);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kotc_r2_timer_check'
  ) THEN
    ALTER TABLE tournaments
      ADD CONSTRAINT kotc_r2_timer_check
      CHECK (kotc_r2_timer_minutes BETWEEN 9 AND 20);
  END IF;
END $$;

COMMIT;
