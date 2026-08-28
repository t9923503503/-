-- 071: Telegram outbox for reliable delivery + antispam dedup (TZ-production-play-v3 §1.7)

CREATE TABLE IF NOT EXISTS telegram_outbox (
  id           BIGSERIAL PRIMARY KEY,
  chat_id      TEXT NOT NULL,
  text         TEXT NOT NULL,
  kind         TEXT NOT NULL,
  dedup_key    TEXT UNIQUE,
  attempts     INTEGER NOT NULL DEFAULT 0,
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_outbox_pending_idx
  ON telegram_outbox(created_at) WHERE sent_at IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley'
  ) THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE telegram_outbox TO lpbvolley';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE telegram_outbox_id_seq TO lpbvolley';
  END IF;
END $$;
