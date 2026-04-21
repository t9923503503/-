-- ============================================================
-- 024: Thai judge point history for server-aware rally feeds
-- ============================================================

ALTER TABLE thai_match
  ADD COLUMN IF NOT EXISTS point_history JSONB NOT NULL DEFAULT '[]'::jsonb;
