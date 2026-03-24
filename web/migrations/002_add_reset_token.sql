-- Migration 002: Add password reset token fields
-- Run: psql $DATABASE_URL -f migrations/002_add_reset_token.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_token       VARCHAR(64),
  ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users (reset_token) WHERE reset_token IS NOT NULL;
