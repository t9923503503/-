-- Telegram Mini App MVP invariants.
-- Prerequisites: 061_play_hub.sql, 074_telegram_registration.sql and
-- 075_telegram_web_auth.sql. Apply to the existing LPVOLLEY database.

BEGIN;

-- A single account-originated request can have only one active state for one
-- tournament. Historical requests without requester_user_id stay untouched.
CREATE UNIQUE INDEX IF NOT EXISTS player_requests_active_account_tournament_unique
  ON player_requests (requester_user_id, tournament_id)
  WHERE requester_user_id IS NOT NULL
    AND tournament_id IS NOT NULL
    AND status IN ('pending', 'approved');

-- Profile ownership must remain one account ↔ one player even when two Mini
-- App requests race. Existing conflicts intentionally stop this migration so
-- they can be resolved manually instead of assigning an arbitrary owner.
CREATE UNIQUE INDEX IF NOT EXISTS player_requests_approved_profile_unique
  ON player_requests (approved_player_id)
  WHERE tournament_id IS NULL
    AND status = 'approved'
    AND requester_user_id IS NOT NULL
    AND approved_player_id IS NOT NULL
    AND btrim(approved_player_id::text) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS player_requests_account_profile_unique
  ON player_requests (requester_user_id)
  WHERE tournament_id IS NULL
    AND status = 'approved'
    AND requester_user_id IS NOT NULL;

COMMIT;
