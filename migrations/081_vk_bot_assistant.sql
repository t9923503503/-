-- 081: VK personal tournament assistant, reminders and protected broadcasts.

CREATE TABLE IF NOT EXISTS vk_bot_deliveries (
  dedup_key      TEXT PRIMARY KEY,
  kind           TEXT NOT NULL,
  tournament_id  TEXT,
  vk_user_id     TEXT NOT NULL,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vk_bot_deliveries_sent_idx
  ON vk_bot_deliveries (sent_at DESC);

CREATE TABLE IF NOT EXISTS vk_bot_tournament_snapshots (
  tournament_id  TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  date_value     DATE,
  time_value     TEXT NOT NULL DEFAULT '',
  location       TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vk_bot_broadcast_drafts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_vk_id    TEXT NOT NULL,
  text           TEXT NOT NULL,
  confirm_hash   CHAR(64) NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ NOT NULL,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE vk_bot_deliveries TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE vk_bot_tournament_snapshots TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE vk_bot_broadcast_drafts TO lpbvolley';
  END IF;
END $$;
