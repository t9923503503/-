BEGIN;

CREATE TABLE IF NOT EXISTS go_round (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_no      INT NOT NULL CHECK (round_no IN (1, 2)),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'live', 'finished')),
  seed          INT NOT NULL DEFAULT 0,
  seed_draft    JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round_no)
);

CREATE TABLE IF NOT EXISTS go_group (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id  UUID NOT NULL REFERENCES go_round(id) ON DELETE CASCADE,
  group_no  INT NOT NULL CHECK (group_no >= 1),
  label     TEXT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'live', 'finished')),
  UNIQUE (round_id, group_no)
);

CREATE TABLE IF NOT EXISTS go_team (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES go_group(id) ON DELETE CASCADE,
  team_idx        INT NOT NULL,
  seed            INT,
  player1_id      UUID REFERENCES players(id),
  player2_id      UUID REFERENCES players(id),
  rating_snapshot INT NOT NULL DEFAULT 0,
  handicap        INT NOT NULL DEFAULT 0,
  UNIQUE (group_id, team_idx)
);

CREATE TABLE IF NOT EXISTS go_court (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  court_no      INT NOT NULL CHECK (court_no >= 1),
  label         TEXT NOT NULL,
  pin_code      TEXT NOT NULL,
  UNIQUE (tournament_id, court_no)
);

CREATE TABLE IF NOT EXISTS go_bracket_slot (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id      UUID NOT NULL REFERENCES go_round(id) ON DELETE CASCADE,
  bracket_level TEXT NOT NULL,
  bracket_round INT NOT NULL,
  position      INT NOT NULL,
  team_id       UUID REFERENCES go_team(id),
  next_slot_id  UUID REFERENCES go_bracket_slot(id),
  is_bye        BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (round_id, bracket_level, bracket_round, position)
);

CREATE TABLE IF NOT EXISTS go_match (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        UUID NOT NULL REFERENCES go_round(id) ON DELETE CASCADE,
  group_id        UUID REFERENCES go_group(id) ON DELETE CASCADE,
  bracket_slot_id UUID REFERENCES go_bracket_slot(id) ON DELETE CASCADE,
  bracket_level   TEXT,
  match_no        INT NOT NULL,
  court_no        INT,
  team_a_id       UUID REFERENCES go_team(id),
  team_b_id       UUID REFERENCES go_team(id),
  score_a         INT[] DEFAULT '{}',
  score_b         INT[] DEFAULT '{}',
  sets_a          INT NOT NULL DEFAULT 0,
  sets_b          INT NOT NULL DEFAULT 0,
  winner_id       UUID REFERENCES go_team(id),
  walkover        TEXT NOT NULL DEFAULT 'none'
                  CHECK (walkover IN ('none', 'team_a', 'team_b', 'mutual')),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'live', 'finished')),
  scheduled_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  timeouts_a      INT NOT NULL DEFAULT 0,
  timeouts_b      INT NOT NULL DEFAULT 0,
  CHECK (
    (group_id IS NOT NULL AND bracket_slot_id IS NULL) OR
    (group_id IS NULL AND bracket_slot_id IS NOT NULL)
  ),
  UNIQUE (round_id, match_no)
);

CREATE TABLE IF NOT EXISTS go_group_standing (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       UUID NOT NULL REFERENCES go_group(id) ON DELETE CASCADE,
  team_id        UUID NOT NULL REFERENCES go_team(id) ON DELETE CASCADE,
  played         INT NOT NULL DEFAULT 0,
  wins           INT NOT NULL DEFAULT 0,
  losses         INT NOT NULL DEFAULT 0,
  match_points   INT NOT NULL DEFAULT 0,
  sets_won       INT NOT NULL DEFAULT 0,
  sets_lost      INT NOT NULL DEFAULT 0,
  points_for     INT NOT NULL DEFAULT 0,
  points_against INT NOT NULL DEFAULT 0,
  position       INT,
  UNIQUE (group_id, team_id)
);

CREATE INDEX IF NOT EXISTS go_round_tournament_idx ON go_round(tournament_id);
CREATE INDEX IF NOT EXISTS go_group_round_idx ON go_group(round_id);
CREATE INDEX IF NOT EXISTS go_team_group_idx ON go_team(group_id);
CREATE INDEX IF NOT EXISTS go_court_tournament_idx ON go_court(tournament_id);
CREATE INDEX IF NOT EXISTS go_bracket_slot_round_idx ON go_bracket_slot(round_id);
CREATE INDEX IF NOT EXISTS go_match_round_idx ON go_match(round_id);
CREATE INDEX IF NOT EXISTS go_match_group_idx ON go_match(group_id);
CREATE INDEX IF NOT EXISTS go_match_bracket_idx ON go_match(bracket_slot_id);
CREATE INDEX IF NOT EXISTS go_match_court_idx ON go_match(court_no);
CREATE INDEX IF NOT EXISTS go_group_standing_group_idx ON go_group_standing(group_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE go_round TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE go_group TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE go_team TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE go_court TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE go_bracket_slot TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE go_match TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE go_group_standing TO lpbvolley;

COMMIT;
