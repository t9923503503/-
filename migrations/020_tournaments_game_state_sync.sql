-- SPA / shared/api.js: saveTournamentToServer → POST /api/tournaments/:id
-- Kotc-sync и PostgREST по-прежнему могут писать в те же колонки при деплое с REST.

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS game_state JSONB;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
