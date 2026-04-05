-- ============================================================
-- 022: KOTC live serve state per court
-- ============================================================

ALTER TABLE live_kotc_court_state
  ADD COLUMN IF NOT EXISTS active_slot_idx INTEGER NOT NULL DEFAULT 0;

ALTER TABLE live_kotc_court_state
  ADD COLUMN IF NOT EXISTS server_slots_json JSONB NOT NULL DEFAULT '[null,null,null,null]'::jsonb;

UPDATE live_kotc_court_state
SET active_slot_idx = 0
WHERE active_slot_idx IS NULL
   OR active_slot_idx < 0
   OR active_slot_idx > 3;

UPDATE live_kotc_court_state
SET server_slots_json = '[null,null,null,null]'::jsonb
WHERE jsonb_typeof(server_slots_json) IS DISTINCT FROM 'array';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_live_kotc_court_active_slot_idx'
  ) THEN
    ALTER TABLE live_kotc_court_state
      ADD CONSTRAINT chk_live_kotc_court_active_slot_idx
      CHECK (active_slot_idx BETWEEN 0 AND 3);
  END IF;
END
$$;
