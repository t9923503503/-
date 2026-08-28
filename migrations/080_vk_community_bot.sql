-- 080: VK community bot delivery, callback deduplication and one-time web login.

CREATE TABLE IF NOT EXISTS vk_bot_login_codes (
  id          BIGSERIAL PRIMARY KEY,
  code_hash   CHAR(64) NOT NULL UNIQUE,
  vk_user_id  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vk_bot_login_codes_active_idx
  ON vk_bot_login_codes (vk_user_id, expires_at DESC)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS vk_bot_callback_events (
  event_id     TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vk_bot_login_rate_limits (
  key_hash          CHAR(64) PRIMARY KEY,
  attempts          INTEGER NOT NULL DEFAULT 1,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE vk_bot_login_codes TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE vk_bot_callback_events TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE vk_bot_login_rate_limits TO lpbvolley';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE vk_bot_login_codes_id_seq TO lpbvolley';
  END IF;
END $$;
