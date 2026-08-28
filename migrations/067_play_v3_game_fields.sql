-- 067: Play V3 game fields (TZ-production-play-v3 §1.1, §1.2)
-- min_players / gather_deadline / price_mode / court_cost_rub / court_booked,
-- join_policy + 'open', visibility + 'link', levels -> light|medium|hard.

ALTER TABLE play_posts
  ADD COLUMN IF NOT EXISTS min_players INTEGER,
  ADD COLUMN IF NOT EXISTS gather_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_mode TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS court_cost_rub INTEGER,
  ADD COLUMN IF NOT EXISTS court_booked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS result_entered_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'play_posts_min_players_check'
  ) THEN
    ALTER TABLE play_posts
      ADD CONSTRAINT play_posts_min_players_check
      CHECK (min_players IS NULL OR (min_players >= 2 AND min_players <= capacity));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'play_posts_price_mode_check'
  ) THEN
    ALTER TABLE play_posts
      ADD CONSTRAINT play_posts_price_mode_check
      CHECK (price_mode IN ('fixed', 'split'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'play_posts_court_cost_check'
  ) THEN
    ALTER TABLE play_posts
      ADD CONSTRAINT play_posts_court_cost_check
      CHECK (court_cost_rub IS NULL OR court_cost_rub BETWEEN 0 AND 1000000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'play_posts_gather_deadline_check'
  ) THEN
    ALTER TABLE play_posts
      ADD CONSTRAINT play_posts_gather_deadline_check
      CHECK (gather_deadline IS NULL OR gather_deadline <= starts_at);
  END IF;
END $$;

-- join_policy: add 'open' (free join -> confirmed/reserve immediately)
ALTER TABLE play_posts DROP CONSTRAINT IF EXISTS play_posts_join_policy_check;
ALTER TABLE play_posts
  ADD CONSTRAINT play_posts_join_policy_check
  CHECK (join_policy IN ('request', 'open', 'closed'));

-- visibility: add 'link' (private game by link)
ALTER TABLE play_posts DROP CONSTRAINT IF EXISTS play_posts_visibility_check;
ALTER TABLE play_posts
  ADD CONSTRAINT play_posts_visibility_check
  CHECK (visibility IN ('public', 'unlisted', 'link'));

-- Levels: migrate advanced|pro -> hard, then tighten CHECK to 3 levels (D1)
ALTER TABLE play_posts DROP CONSTRAINT IF EXISTS play_posts_level_min_check;
ALTER TABLE play_posts DROP CONSTRAINT IF EXISTS play_posts_level_max_check;

UPDATE play_posts SET level_min = 'hard' WHERE level_min IN ('advanced', 'pro');
UPDATE play_posts SET level_max = 'hard' WHERE level_max IN ('advanced', 'pro');

ALTER TABLE play_posts
  ADD CONSTRAINT play_posts_level_min_check
  CHECK (level_min IS NULL OR level_min IN ('light', 'medium', 'hard'));
ALTER TABLE play_posts
  ADD CONSTRAINT play_posts_level_max_check
  CHECK (level_max IS NULL OR level_max IN ('light', 'medium', 'hard'));
