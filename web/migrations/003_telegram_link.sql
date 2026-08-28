-- Migration 003: Telegram bot account linking
-- Run: psql $DATABASE_URL -f migrations/003_telegram_link.sql

-- Одноразовые токены для deep-link привязки Telegram к аккаунту игрока.
-- Кабинет генерирует токен -> игрок открывает t.me/<bot>?start=<token> ->
-- бот по /start <token> записывает telegram_chat_id.

CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token       VARCHAR(64) PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at     TIMESTAMP WITH TIME ZONE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user
  ON telegram_link_tokens (user_id);

-- Один Telegram-аккаунт = один игрок (несколько NULL допускаются).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_chat_id_unique
  ON users (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL AND telegram_chat_id <> '';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE telegram_link_tokens TO lpbvolley;
  END IF;
END $$;
