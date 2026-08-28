-- 080: Mobile-friendly tournament cover photos and galleries.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;

CREATE TABLE IF NOT EXISTS tournament_gallery_images (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id            UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  image_url                TEXT NOT NULL,
  thumbnail_url            TEXT NOT NULL,
  caption                  TEXT NOT NULL DEFAULT '',
  sort_order               INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  width                    INTEGER NOT NULL CHECK (width > 0),
  height                   INTEGER NOT NULL CHECK (height > 0),
  byte_size                INTEGER NOT NULL CHECK (byte_size > 0),
  source                   TEXT NOT NULL DEFAULT 'admin',
  uploaded_by              TEXT NOT NULL DEFAULT '',
  telegram_file_id         TEXT,
  telegram_file_unique_id  TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tournament_gallery_images_tournament_order_idx
  ON tournament_gallery_images(tournament_id, sort_order, created_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS tournament_gallery_images_telegram_unique_idx
  ON tournament_gallery_images(tournament_id, telegram_file_unique_id)
  WHERE telegram_file_unique_id IS NOT NULL AND telegram_file_unique_id <> '';

CREATE OR REPLACE FUNCTION enforce_tournament_gallery_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  current_count INTEGER;
BEGIN
  -- Serialize inserts for one tournament, including callers outside the web API.
  PERFORM 1 FROM tournaments WHERE id = NEW.tournament_id FOR UPDATE;
  SELECT COUNT(*)::int
    INTO current_count
    FROM tournament_gallery_images
   WHERE tournament_id = NEW.tournament_id;

  IF current_count >= 20 THEN
    RAISE EXCEPTION 'Tournament gallery is limited to 20 images'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tournament_gallery_limit_trigger ON tournament_gallery_images;
CREATE TRIGGER tournament_gallery_limit_trigger
  BEFORE INSERT ON tournament_gallery_images
  FOR EACH ROW EXECUTE FUNCTION enforce_tournament_gallery_limit();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tournament_gallery_images TO lpbvolley';
  END IF;
END $$;
