-- 082: Cross-channel tournament assistant: waitlist offers, weather, content and media.

CREATE TABLE IF NOT EXISTS tournament_waitlist_offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id        UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token_hash       CHAR(64) NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  expires_at       TIMESTAMPTZ NOT NULL,
  responded_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tournament_waitlist_one_pending_offer_idx
  ON tournament_waitlist_offers (tournament_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS tournament_waitlist_player_idx
  ON tournament_waitlist_offers (player_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tournament_weather_snapshots (
  tournament_id       UUID PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  forecast_for        TIMESTAMPTZ NOT NULL,
  temperature_c       NUMERIC(5,2),
  precipitation_pct   INTEGER,
  wind_mps            NUMERIC(6,2),
  severity            TEXT NOT NULL DEFAULT 'ok' CHECK (severity IN ('ok', 'watch', 'warning')),
  forecast_payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  warning_version      TEXT,
  checked_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournament_media (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id         UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  submitted_by_user_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  kind                  TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  source                TEXT NOT NULL DEFAULT 'site' CHECK (source IN ('site', 'vk', 'telegram', 'admin')),
  storage_url           TEXT NOT NULL,
  original_name         TEXT NOT NULL DEFAULT '',
  caption               TEXT NOT NULL DEFAULT '',
  consent_given         BOOLEAN NOT NULL DEFAULT false,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  moderated_by          TEXT,
  moderated_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tournament_media_gallery_idx
  ON tournament_media (tournament_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS tournament_content_drafts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  version           INTEGER NOT NULL DEFAULT 1,
  vk_text           TEXT NOT NULL,
  telegram_text     TEXT NOT NULL,
  facts             JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'archived')),
  vk_post_id         TEXT,
  telegram_post_id  BIGINT,
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, version)
);

CREATE INDEX IF NOT EXISTS tournament_content_drafts_status_idx
  ON tournament_content_drafts (status, created_at DESC);

CREATE TABLE IF NOT EXISTS tournament_assistant_deliveries (
  dedup_key       TEXT PRIMARY KEY,
  tournament_id  UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('vk', 'telegram', 'email')),
  recipient       TEXT NOT NULL,
  kind            TEXT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tournament_waitlist_offers TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tournament_weather_snapshots TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tournament_media TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tournament_content_drafts TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tournament_assistant_deliveries TO lpbvolley';
  END IF;
END $$;
