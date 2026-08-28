-- 070: Player availability «Я свободен» (TZ-production-play-v3 §1.6)

CREATE TABLE IF NOT EXISTS play_availability (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_from    TIMESTAMPTZ NOT NULL,
  date_to      TIMESTAMPTZ NOT NULL,
  levels       TEXT[] NOT NULL DEFAULT '{}',
  formats      TEXT[] NOT NULL DEFAULT '{}',
  note         TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 140),
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (date_to > date_from)
);

-- One active availability per user (upsert replaces previous)
CREATE UNIQUE INDEX IF NOT EXISTS play_availability_one_active_idx
  ON play_availability(user_id) WHERE active;

CREATE INDEX IF NOT EXISTS play_availability_active_idx
  ON play_availability(active, date_to) WHERE active;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley'
  ) THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE play_availability TO lpbvolley';
  END IF;
END $$;
