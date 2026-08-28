-- Migration 004: Telegram channel announcements
-- Run: psql $DATABASE_URL -f migrations/004_telegram_channel.sql

-- Учёт анонсов в TG-канал: одна сущность = один пост (дедупликация).
CREATE TABLE IF NOT EXISTS telegram_channel_posts (
  id          SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('play_post', 'tournament')),
  entity_id   TEXT NOT NULL,
  message_id  INTEGER,
  posted_at   TIMESTAMP WITH TIME ZONE,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (entity_type, entity_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE telegram_channel_posts TO lpbvolley;
    GRANT USAGE, SELECT ON SEQUENCE telegram_channel_posts_id_seq TO lpbvolley;
  END IF;
END $$;
