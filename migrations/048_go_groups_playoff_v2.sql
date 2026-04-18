BEGIN;

ALTER TABLE go_team
  ADD COLUMN IF NOT EXISTS initial_bucket TEXT NOT NULL DEFAULT 'lite'
    CHECK (initial_bucket IN ('hard', 'medium', 'lite'));

ALTER TABLE go_team
  ADD COLUMN IF NOT EXISTS is_bye BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS go_team_bucket_idx ON go_team(initial_bucket);
CREATE INDEX IF NOT EXISTS go_team_bye_idx ON go_team(is_bye);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE go_team TO lpbvolley;

COMMIT;
