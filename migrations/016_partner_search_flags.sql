-- ============================================================
-- 016: Partner search flags for tournament registration
-- ============================================================

ALTER TABLE player_requests
  ADD COLUMN IF NOT EXISTS registration_type TEXT NOT NULL DEFAULT 'solo'
    CHECK (registration_type IN ('solo', 'with_partner'));

ALTER TABLE player_requests
  ADD COLUMN IF NOT EXISTS partner_wanted BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE player_requests
  ADD COLUMN IF NOT EXISTS partner_name TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_pr_partner_feed
  ON player_requests (status, registration_type, partner_wanted, tournament_id);
