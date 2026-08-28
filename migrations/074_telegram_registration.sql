-- 074: Telegram-first player registration, moderated player claims and web login.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN password_hash DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS telegram_user_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_private_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS telegram_onboarding_status TEXT NOT NULL DEFAULT 'legacy';

CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_user_id_unique
  ON users(telegram_user_id)
  WHERE telegram_user_id ~ '^[1-9][0-9]*$';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_auth_identity_check') THEN
    -- Transitional and intentionally NOT VALID: existing legacy rows are
    -- audited with aggregate counts in 075 before the final validated check is
    -- installed. PostgreSQL still enforces this constraint for new writes.
    ALTER TABLE users ADD CONSTRAINT users_auth_identity_check CHECK (
      (
        NULLIF(btrim(email), '') IS NOT NULL
        AND NULLIF(btrim(password_hash), '') IS NOT NULL
      )
      OR (telegram_user_id IS NOT NULL AND telegram_user_id ~ '^[1-9][0-9]*$')
      OR (telegram_chat_id IS NOT NULL AND telegram_chat_id ~ '^[1-9][0-9]*$')
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_gender_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_gender_check
      CHECK (gender IS NULL OR gender IN ('M', 'W'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_telegram_onboarding_status_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_telegram_onboarding_status_check
      CHECK (telegram_onboarding_status IN ('legacy', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

UPDATE users u
SET telegram_user_id = telegram_chat_id,
    telegram_private_chat_id = telegram_chat_id,
    telegram_onboarding_status = CASE WHEN player_id IS NOT NULL THEN 'approved' ELSE 'legacy' END
WHERE COALESCE(u.telegram_chat_id, '') <> ''
  AND u.telegram_chat_id ~ '^[1-9][0-9]*$'
  AND u.telegram_user_id IS NULL
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

CREATE TABLE IF NOT EXISTS telegram_onboarding_sessions (
  telegram_user_id TEXT PRIMARY KEY,
  private_chat_id TEXT NOT NULL,
  step TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  proposed_name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('M', 'W')),
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by TEXT,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS player_claims_one_open_per_user
  ON player_claims(user_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS telegram_web_login_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_admin_outbox (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  callback_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedup_key TEXT NOT NULL UNIQUE,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registration_closes_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON telegram_onboarding_sessions,
      player_claims, telegram_web_login_tokens, telegram_admin_outbox TO lpbvolley;
    GRANT USAGE, SELECT ON SEQUENCE telegram_admin_outbox_id_seq TO lpbvolley;
  END IF;
END $$;
