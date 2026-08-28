-- 075: website -> Telegram bot -> website passwordless authentication.
-- Keeps the requested same-origin return path on the server and consumes every
-- browser intent at most once. The Telegram deep link is not a login
-- credential: the initiating browser must also prove the code sent by the bot.

-- The deferred player-card matcher in telegram-registration.ts uses similarity().
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS privacy_consent_version TEXT,
  ADD COLUMN IF NOT EXISTS privacy_consented_at TIMESTAMPTZ;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_privacy_consent_pair_check;

ALTER TABLE users
  ADD CONSTRAINT users_privacy_consent_pair_check CHECK (
    (privacy_consent_version IS NULL AND privacy_consented_at IS NULL)
    OR (
      COALESCE(btrim(privacy_consent_version), '') <> ''
      AND privacy_consented_at IS NOT NULL
    )
  );

CREATE TABLE IF NOT EXISTS telegram_web_auth_intents (
  token TEXT PRIMARY KEY,
  return_to TEXT NOT NULL DEFAULT '/profile',
  request_fingerprint TEXT,
  browser_secret_hash TEXT NOT NULL,
  confirmation_code_hash TEXT,
  confirmation_attempts INTEGER NOT NULL DEFAULT 0,
  challenge_issued_at TIMESTAMPTZ,
  pending_telegram_user_id TEXT,
  pending_private_chat_id TEXT,
  pending_display_name TEXT,
  pending_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  pending_at TIMESTAMPTZ,
  confirmed_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  confirmed_telegram_user_id TEXT,
  confirmed_private_chat_id TEXT,
  confirmed_display_name TEXT,
  confirmed_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE telegram_web_auth_intents
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS browser_secret_hash TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS challenge_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_telegram_user_id TEXT,
  ADD COLUMN IF NOT EXISTS pending_private_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS pending_display_name TEXT,
  ADD COLUMN IF NOT EXISTS pending_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pending_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_user_id INTEGER,
  ADD COLUMN IF NOT EXISTS confirmed_telegram_user_id TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_private_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_display_name TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Every intent is short lived. Invalidate all intents from the pre-release
-- bearer-link/plaintext-code protocols before changing the constraint. This is
-- intentionally unconditional: none can be proven to follow the final
-- browser-secret + HMAC-code protocol.
ALTER TABLE telegram_web_auth_intents
  DROP CONSTRAINT IF EXISTS telegram_web_auth_intents_confirmation_check;

DELETE FROM telegram_web_auth_intents;

ALTER TABLE telegram_web_auth_intents
  DROP COLUMN IF EXISTS confirmation_code;

ALTER TABLE telegram_web_auth_intents
  ALTER COLUMN browser_secret_hash SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'telegram_web_auth_intents_confirmed_user_id_fkey'
  ) THEN
    ALTER TABLE telegram_web_auth_intents
      ADD CONSTRAINT telegram_web_auth_intents_confirmed_user_id_fkey
      FOREIGN KEY (confirmed_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE telegram_web_auth_intents
  ADD CONSTRAINT telegram_web_auth_intents_confirmation_check CHECK (
    confirmation_attempts BETWEEN 0 AND 5
    AND (confirmation_code_hash IS NULL OR confirmation_code_hash ~ '^[0-9a-f]{64}$')
    AND (
      (
        pending_telegram_user_id IS NULL
        AND pending_private_chat_id IS NULL
        AND pending_at IS NULL
      )
      OR (
        pending_telegram_user_id ~ '^[1-9][0-9]*$'
        AND pending_private_chat_id IS NOT DISTINCT FROM pending_telegram_user_id
        AND confirmation_code_hash IS NOT NULL
        AND challenge_issued_at IS NOT NULL
        AND pending_at IS NOT NULL
      )
    )
    AND (
      (
        confirmed_telegram_user_id IS NULL
        AND confirmed_private_chat_id IS NULL
        AND confirmed_user_id IS NULL
        AND confirmed_at IS NULL
      )
      OR (
        confirmed_telegram_user_id ~ '^[1-9][0-9]*$'
        AND confirmed_private_chat_id IS NOT DISTINCT FROM confirmed_telegram_user_id
        AND confirmed_at IS NOT NULL
      )
    )
  );

CREATE INDEX IF NOT EXISTS telegram_web_auth_intents_expires_at_idx
  ON telegram_web_auth_intents(expires_at);

CREATE INDEX IF NOT EXISTS telegram_web_auth_intents_rate_limit_idx
  ON telegram_web_auth_intents(request_fingerprint, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_web_auth_intents_browser_secret_unique
  ON telegram_web_auth_intents(browser_secret_hash);

ALTER TABLE telegram_web_login_tokens
  ADD COLUMN IF NOT EXISTS return_to TEXT NOT NULL DEFAULT '/profile';

-- Legacy rows are bearer credentials accepted only by the pre-OTP runtime.
-- Burn every unused token at cutover so even an accidental rollback cannot
-- make an old URL usable again.
UPDATE telegram_web_login_tokens
   SET used_at = COALESCE(used_at, now())
 WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS telegram_web_login_tokens_expires_at_idx
  ON telegram_web_login_tokens(expires_at);

-- Migration 061 populated users.player_id without recording provenance. Never
-- guess or clear those links here: stop atomically and require a manual audit
-- when authentication or canonical ownership cannot be proven.
DO $$
DECLARE
  authless_count BIGINT;
  invalid_telegram_subjects BIGINT;
  canonical_conflicts BIGINT;
  unsupported_canonical BIGINT;
  cross_account_approvals BIGINT;
BEGIN
  SELECT COUNT(*) INTO authless_count
    FROM users
   WHERE (
       COALESCE(btrim(email), '') = ''
       OR COALESCE(btrim(password_hash), '') = ''
     )
     AND COALESCE(telegram_user_id, '') !~ '^[1-9][0-9]*$';

  SELECT COUNT(*) INTO invalid_telegram_subjects
    FROM users
   WHERE telegram_user_id IS NOT NULL
     AND telegram_user_id !~ '^[1-9][0-9]*$';

  SELECT COUNT(*) INTO canonical_conflicts
    FROM users u
   WHERE u.player_id IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM player_requests pr
         JOIN players p ON p.id::text = lower(trim(pr.approved_player_id::text))
        WHERE pr.requester_user_id = u.id
          AND pr.tournament_id IS NULL
          AND pr.status = 'approved'
          AND p.id IS DISTINCT FROM u.player_id
     );

  SELECT COUNT(*) INTO unsupported_canonical
    FROM users u
   WHERE u.player_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM player_requests pr
         JOIN players p ON p.id::text = lower(trim(pr.approved_player_id::text))
        WHERE pr.requester_user_id = u.id
          AND pr.status = 'approved'
          AND p.id = u.player_id
     )
     AND NOT EXISTS (
       SELECT 1
         FROM player_claims pc
        WHERE pc.user_id = u.id
          AND pc.status = 'approved'
          AND pc.requested_player_id = u.player_id
     );

  SELECT COUNT(*) INTO cross_account_approvals
    FROM (
      SELECT pr.requester_user_id AS user_id, p.id AS player_id
        FROM player_requests pr
        JOIN players p ON p.id::text = lower(trim(pr.approved_player_id::text))
        JOIN users owner ON owner.player_id = p.id
       WHERE pr.requester_user_id IS NOT NULL
         AND pr.status = 'approved'
         AND owner.id <> pr.requester_user_id
      UNION ALL
      SELECT pc.user_id, pc.requested_player_id
        FROM player_claims pc
        JOIN users owner ON owner.player_id = pc.requested_player_id
       WHERE pc.status = 'approved'
         AND pc.requested_player_id IS NOT NULL
         AND owner.id <> pc.user_id
    ) conflicts;

  IF authless_count > 0
     OR invalid_telegram_subjects > 0
     OR canonical_conflicts > 0
     OR unsupported_canonical > 0
     OR cross_account_approvals > 0 THEN
    RAISE EXCEPTION
      'Telegram auth preflight failed: authless=%, invalid_subjects=%, canonical_conflicts=%, unsupported_canonical=%, cross_account_approvals=%',
      authless_count,
      invalid_telegram_subjects,
      canonical_conflicts,
      unsupported_canonical,
      cross_account_approvals;
  END IF;
END $$;

-- Historical personal outbox rows have no user_id/provenance. Capture a
-- one-time cutoff under a write-conflicting lock and invalidate every older
-- pending message. The persistent marker makes a later migration rerun safe:
-- notifications created after the first successful cutover are left intact.
CREATE TABLE IF NOT EXISTS telegram_auth_migration_state (
  key TEXT PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL
);

LOCK TABLE telegram_outbox IN ACCESS EXCLUSIVE MODE;

INSERT INTO telegram_auth_migration_state (key, captured_at)
VALUES ('075_legacy_outbox_cutoff', clock_timestamp())
ON CONFLICT (key) DO NOTHING;

-- A rerun may already have the final constraints. Drop them before the
-- temporary identity rewrite below; both are restored after reconciliation.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_telegram_private_identity_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_identity_check;

-- Current ownership is guarded by users.player_id. Approved claims remain an
-- audit trail and must not permanently lock a released card.
DROP INDEX IF EXISTS player_claims_one_approved_player;

-- telegram_user_id is the immutable authentication subject. chat ids are only
-- delivery destinations and must never point at another account.
UPDATE users u
SET telegram_chat_id = NULL,
    telegram_private_chat_id = NULL
WHERE u.telegram_user_id IS NULL
  AND EXISTS (
    SELECT 1
      FROM users owner
     WHERE owner.id <> u.id
       AND owner.telegram_user_id = u.telegram_chat_id
  );

UPDATE users u
SET telegram_user_id = u.telegram_chat_id,
    telegram_private_chat_id = u.telegram_chat_id
WHERE u.telegram_user_id IS NULL
  AND COALESCE(u.telegram_chat_id, '') ~ '^[1-9][0-9]*$'
  AND NOT EXISTS (
    SELECT 1
      FROM users owner
     WHERE owner.id <> u.id
       AND owner.telegram_user_id = u.telegram_chat_id
  )
  AND NOT EXISTS (
    SELECT 1
      FROM users peer
     WHERE peer.id <> u.id
       AND peer.telegram_user_id IS NULL
       AND peer.telegram_chat_id = u.telegram_chat_id
  );

-- A delivery destination without the immutable Telegram subject is not a
-- credential and may be a legacy group/foreign chat. Fail closed for privacy.
UPDATE users
SET telegram_chat_id = NULL,
    telegram_private_chat_id = NULL
WHERE telegram_user_id IS NULL;

-- Clear delivery destinations first so swapped legacy values cannot collide
-- with the existing unique telegram_chat_id index during reconciliation.
UPDATE users
SET telegram_chat_id = NULL,
    telegram_private_chat_id = NULL
WHERE telegram_user_id IS NOT NULL;

UPDATE users
SET telegram_chat_id = telegram_user_id,
    telegram_private_chat_id = telegram_user_id
WHERE telegram_user_id IS NOT NULL;

-- Reconcile any approved account/player links created after migration 061.
-- Only unambiguous one-account/one-player pairs are promoted to the canonical
-- users.player_id column.
WITH account_candidates AS (
  SELECT
    pr.requester_user_id AS user_id,
    MIN(p.id::text)::uuid AS player_id
  FROM player_requests pr
  JOIN players p ON p.id::text = lower(trim(pr.approved_player_id::text))
  WHERE pr.requester_user_id IS NOT NULL
    AND pr.tournament_id IS NULL
    AND pr.status = 'approved'
  GROUP BY pr.requester_user_id
  HAVING COUNT(DISTINCT p.id) = 1
), unique_candidates AS (
  SELECT MIN(user_id) AS user_id, player_id
  FROM account_candidates
  GROUP BY player_id
  HAVING COUNT(*) = 1
)
UPDATE users u
SET player_id = c.player_id,
    telegram_onboarding_status = CASE
      WHEN u.telegram_user_id IS NOT NULL THEN 'approved'
      ELSE u.telegram_onboarding_status
    END
FROM unique_candidates c
WHERE u.id = c.user_id
  AND u.player_id IS NULL
  AND NOT EXISTS (
    SELECT 1
      FROM users owner
     WHERE owner.id <> u.id
       AND owner.player_id = c.player_id
  );

-- Historical approved claims no longer represent ownership after unlink or
-- reassignment. Keep them for audit but remove their active status.
UPDATE player_claims pc
SET status = 'cancelled',
    updated_at = now()
FROM users u
WHERE pc.user_id = u.id
  AND pc.status = 'approved'
  AND (
    pc.requested_player_id IS NULL
    OR u.player_id IS DISTINCT FROM pc.requested_player_id
  );

-- Do not deliver any pre-cutover personal message after the relay restarts.
-- Legacy rows cannot be attributed safely because telegram_outbox had no
-- immutable user/Telegram subject column.
UPDATE telegram_outbox o
SET sent_at = COALESCE(o.sent_at, now()),
    attempts = GREATEST(o.attempts, 5)
FROM telegram_auth_migration_state state
WHERE state.key = '075_legacy_outbox_cutoff'
  AND o.sent_at IS NULL
  AND o.created_at <= state.captured_at;

DROP INDEX IF EXISTS users_telegram_user_id_unique;
CREATE UNIQUE INDEX users_telegram_user_id_unique
  ON users(telegram_user_id)
  WHERE telegram_user_id ~ '^[1-9][0-9]*$';

ALTER TABLE users ADD CONSTRAINT users_auth_identity_check CHECK (
  (
    NULLIF(btrim(email), '') IS NOT NULL
    AND NULLIF(btrim(password_hash), '') IS NOT NULL
  )
  OR (
    telegram_user_id IS NOT NULL
    AND telegram_user_id ~ '^[1-9][0-9]*$'
  )
);

ALTER TABLE users ADD CONSTRAINT users_telegram_private_identity_check CHECK (
  (
    telegram_user_id IS NULL
    AND telegram_chat_id IS NULL
    AND telegram_private_chat_id IS NULL
  )
  OR (
    telegram_user_id ~ '^[1-9][0-9]*$'
    AND telegram_chat_id IS NOT DISTINCT FROM telegram_user_id
    AND telegram_private_chat_id IS NOT DISTINCT FROM telegram_user_id
  )
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON telegram_web_auth_intents TO lpbvolley;
  END IF;
END $$;
