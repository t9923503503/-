-- ============================================================
-- 010: Add photo_url to tournaments
-- ============================================================
-- Stores a cloud link (Google Drive, Yandex Disk, etc.) to photos
-- from each finished tournament. Visible publicly via /api/archive.

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS photo_url TEXT;
