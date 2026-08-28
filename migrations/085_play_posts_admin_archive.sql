-- Админский архив Play: скрывает служебные и тестовые события из рабочих списков,
-- не удаляя составы, результаты, подтверждения и рейтинговую историю.
ALTER TABLE play_posts
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS play_posts_archived_at_idx
  ON play_posts(archived_at, starts_at DESC);
