-- 061: Public games and school training hub.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS player_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_player_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_player_id_fkey
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Link only unambiguous account/player pairs and avoid assigning one player to two accounts.
WITH account_candidates AS (
  SELECT
    requester_user_id AS user_id,
    MIN(approved_player_id::text)::uuid AS player_id
  FROM player_requests
  WHERE requester_user_id IS NOT NULL
    AND approved_player_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  GROUP BY requester_user_id
  HAVING COUNT(DISTINCT approved_player_id) = 1
), unique_candidates AS (
  SELECT MIN(user_id) AS user_id, player_id
  FROM account_candidates
  GROUP BY player_id
  HAVING COUNT(*) = 1
)
UPDATE users u
SET player_id = c.player_id
FROM unique_candidates c
WHERE u.id = c.user_id
  AND u.player_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_player_id_unique
  ON users(player_id) WHERE player_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS play_organizers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  display_name    TEXT NOT NULL,
  bio             TEXT NOT NULL DEFAULT '',
  contact_url     TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'suspended')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS play_venues (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  city            TEXT NOT NULL DEFAULT 'Екатеринбург',
  address         TEXT NOT NULL,
  latitude        NUMERIC(9,6),
  longitude       NUMERIC(9,6),
  active          BOOLEAN NOT NULL DEFAULT true,
  created_by_organizer_id UUID REFERENCES play_organizers(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (city, name, address)
);

CREATE TABLE IF NOT EXISTS play_coaches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  bio             TEXT NOT NULL DEFAULT '',
  photo_url       TEXT NOT NULL DEFAULT '',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_by_organizer_id UUID REFERENCES play_organizers(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS play_series (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id    UUID NOT NULL REFERENCES play_organizers(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('game', 'training')),
  frequency       TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency = 'weekly'),
  occurrences     INTEGER NOT NULL CHECK (occurrences BETWEEN 2 AND 12),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS play_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id       UUID REFERENCES play_series(id) ON DELETE SET NULL,
  organizer_id    UUID NOT NULL REFERENCES play_organizers(id) ON DELETE RESTRICT,
  venue_id        UUID NOT NULL REFERENCES play_venues(id) ON DELETE RESTRICT,
  coach_id        UUID REFERENCES play_coaches(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('game', 'training')),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  format_label    TEXT NOT NULL DEFAULT '',
  focus           TEXT NOT NULL DEFAULT '',
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  registration_closes_at TIMESTAMPTZ,
  level_min       TEXT CHECK (level_min IS NULL OR level_min IN ('light', 'medium', 'advanced', 'pro')),
  level_max       TEXT CHECK (level_max IS NULL OR level_max IN ('light', 'medium', 'advanced', 'pro')),
  gender_policy   TEXT NOT NULL DEFAULT 'any' CHECK (gender_policy IN ('any', 'M', 'W', 'mixed')),
  capacity        INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 100),
  price_rub       INTEGER NOT NULL DEFAULT 0 CHECK (price_rub BETWEEN 0 AND 1000000),
  visibility      TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted')),
  join_policy     TEXT NOT NULL DEFAULT 'request' CHECK (join_policy IN ('request', 'closed')),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  created_by_admin_actor TEXT,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (registration_closes_at IS NULL OR registration_closes_at <= starts_at)
);

CREATE TABLE IF NOT EXISTS play_post_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES play_posts(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id       UUID REFERENCES players(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'reserve', 'rejected', 'cancelled')),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS play_posts_feed_idx
  ON play_posts(status, visibility, starts_at);
CREATE INDEX IF NOT EXISTS play_posts_organizer_idx
  ON play_posts(organizer_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS play_participants_post_status_idx
  ON play_post_participants(post_id, status, created_at);
CREATE INDEX IF NOT EXISTS play_participants_user_idx
  ON play_post_participants(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION play_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS play_organizers_updated_at ON play_organizers;
CREATE TRIGGER play_organizers_updated_at BEFORE UPDATE ON play_organizers
FOR EACH ROW EXECUTE FUNCTION play_set_updated_at();
DROP TRIGGER IF EXISTS play_venues_updated_at ON play_venues;
CREATE TRIGGER play_venues_updated_at BEFORE UPDATE ON play_venues
FOR EACH ROW EXECUTE FUNCTION play_set_updated_at();
DROP TRIGGER IF EXISTS play_coaches_updated_at ON play_coaches;
CREATE TRIGGER play_coaches_updated_at BEFORE UPDATE ON play_coaches
FOR EACH ROW EXECUTE FUNCTION play_set_updated_at();
DROP TRIGGER IF EXISTS play_posts_updated_at ON play_posts;
CREATE TRIGGER play_posts_updated_at BEFORE UPDATE ON play_posts
FOR EACH ROW EXECUTE FUNCTION play_set_updated_at();
DROP TRIGGER IF EXISTS play_participants_updated_at ON play_post_participants;
CREATE TRIGGER play_participants_updated_at BEFORE UPDATE ON play_post_participants
FOR EACH ROW EXECUTE FUNCTION play_set_updated_at();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley'
  ) THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      play_organizers,
      play_venues,
      play_coaches,
      play_series,
      play_posts,
      play_post_participants
    TO lpbvolley';
  END IF;
END $$;
