-- KOTC Next: add judge module settings to tournaments table

BEGIN;

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS kotc_judge_module           TEXT    DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS kotc_judge_bootstrap_sig    TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS kotc_raund_count            INT     DEFAULT 2,
  ADD COLUMN IF NOT EXISTS kotc_raund_timer_minutes    INT     DEFAULT 10,
  ADD COLUMN IF NOT EXISTS kotc_ppc                    INT     DEFAULT 4,
  ADD COLUMN IF NOT EXISTS kotc_spectator_snapshot     JSONB   DEFAULT NULL;

-- Constraints (applied only if col just added and has no violating rows yet)
ALTER TABLE tournaments
  ADD CONSTRAINT IF NOT EXISTS kotc_judge_module_check
    CHECK (kotc_judge_module IN ('legacy', 'next')),
  ADD CONSTRAINT IF NOT EXISTS kotc_raund_count_check
    CHECK (kotc_raund_count BETWEEN 1 AND 4),
  ADD CONSTRAINT IF NOT EXISTS kotc_raund_timer_check
    CHECK (kotc_raund_timer_minutes BETWEEN 9 AND 20),
  ADD CONSTRAINT IF NOT EXISTS kotc_ppc_check
    CHECK (kotc_ppc BETWEEN 3 AND 5);

COMMIT;
