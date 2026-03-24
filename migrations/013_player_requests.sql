-- ============================================================
-- 013: Player Requests (заявки игроков на турниры)
-- ============================================================

CREATE TABLE IF NOT EXISTS player_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  gender              TEXT NOT NULL DEFAULT 'M',
  phone               TEXT NOT NULL DEFAULT '',
  tournament_id       TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_player_id  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pr_status       ON player_requests(status);
CREATE INDEX IF NOT EXISTS idx_pr_tournament   ON player_requests(tournament_id);
CREATE INDEX IF NOT EXISTS idx_pr_created      ON player_requests(created_at DESC);
