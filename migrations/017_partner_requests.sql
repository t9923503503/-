-- ============================================================
-- 017: Partner requests + user Telegram fields
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

ALTER TABLE player_requests
  ADD COLUMN IF NOT EXISTS requester_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pr_requester_user
  ON player_requests (requester_user_id);

CREATE TABLE IF NOT EXISTS partner_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id      TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  source_request_id  UUID NOT NULL REFERENCES player_requests(id) ON DELETE CASCADE,
  requester_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_request_id, requester_user_id, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_requests_recipient
  ON partner_requests (recipient_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_requests_requester
  ON partner_requests (requester_user_id, status, created_at DESC);
