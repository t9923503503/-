-- Add settings JSONB column to tournaments
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}';
