-- Migration 001: Create players table
-- Run: psql $DATABASE_URL -f migrations/001_create_users.sql

CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  email          VARCHAR(255) UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  full_name      VARCHAR(255) NOT NULL,
  nickname       VARCHAR(50) UNIQUE,
  avatar_url     TEXT,
  elo_rating     INTEGER DEFAULT 1200,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
