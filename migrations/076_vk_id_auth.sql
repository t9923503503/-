-- 076: Public passwordless sign-in through VK ID (OAuth 2.1 + PKCE).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS vk_user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_vk_user_id_unique
  ON users(vk_user_id)
  WHERE vk_user_id ~ '^[1-9][0-9]*$';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_identity_check;
ALTER TABLE users ADD CONSTRAINT users_auth_identity_check CHECK (
  (
    NULLIF(btrim(email), '') IS NOT NULL
    AND NULLIF(btrim(password_hash), '') IS NOT NULL
  )
  OR (
    telegram_user_id IS NOT NULL
    AND telegram_user_id ~ '^[1-9][0-9]*$'
  )
  OR (
    vk_user_id IS NOT NULL
    AND vk_user_id ~ '^[1-9][0-9]*$'
  )
);

CREATE TABLE IF NOT EXISTS vk_auth_intents (
  state_hash TEXT PRIMARY KEY CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  browser_secret_hash TEXT NOT NULL UNIQUE CHECK (browser_secret_hash ~ '^[0-9a-f]{64}$'),
  return_to TEXT NOT NULL DEFAULT '/profile',
  request_fingerprint TEXT,
  privacy_consent_version TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vk_auth_intents_expires_at_idx
  ON vk_auth_intents(expires_at);

CREATE INDEX IF NOT EXISTS vk_auth_intents_rate_limit_idx
  ON vk_auth_intents(request_fingerprint, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON vk_auth_intents TO lpbvolley;
  END IF;
END $$;
