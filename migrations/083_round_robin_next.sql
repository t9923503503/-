-- Round Robin Next: fixed teams, group stage, playoffs and idempotent judge events.

BEGIN;

CREATE TABLE IF NOT EXISTS rr_tournament (
  tournament_id          UUID PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  stage                  TEXT NOT NULL DEFAULT 'setup'
                         CHECK (stage IN ('setup', 'groups_ready', 'groups_live', 'groups_finished',
                                          'playoff_preview', 'playoff_ready', 'playoff_live', 'finished')),
  playoff_mode           TEXT NOT NULL DEFAULT 'championship'
                         CHECK (playoff_mode IN ('championship', 'all_levels')),
  seeding_mode           TEXT NOT NULL DEFAULT 'serpentine'
                         CHECK (seeding_mode IN ('serpentine', 'random', 'manual')),
  group_count            INT NOT NULL DEFAULT 2 CHECK (group_count BETWEEN 2 AND 4),
  court_count            INT NOT NULL DEFAULT 1 CHECK (court_count BETWEEN 1 AND 16),
  group_match_format     JSONB NOT NULL DEFAULT '{"code":"single15"}'::jsonb,
  playoff_match_format   JSONB NOT NULL DEFAULT '{"code":"single15"}'::jsonb,
  playoff_preview        JSONB,
  version                INT NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rr_group (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES rr_tournament(tournament_id) ON DELETE CASCADE,
  group_no      INT NOT NULL CHECK (group_no BETWEEN 1 AND 4),
  label         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'live', 'finished')),
  UNIQUE (tournament_id, group_no)
);

CREATE TABLE IF NOT EXISTS rr_team (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID NOT NULL REFERENCES rr_tournament(tournament_id) ON DELETE CASCADE,
  group_id        UUID REFERENCES rr_group(id) ON DELETE SET NULL,
  team_no         INT NOT NULL CHECK (team_no >= 1),
  seed            INT NOT NULL CHECK (seed >= 1),
  player1_id      UUID NOT NULL REFERENCES players(id),
  player2_id      UUID NOT NULL REFERENCES players(id),
  rating_snapshot DOUBLE PRECISION NOT NULL DEFAULT 0,
  confirmed       BOOLEAN NOT NULL DEFAULT false,
  final_placement INT,
  manual_rank     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (player1_id <> player2_id),
  UNIQUE (tournament_id, team_no),
  UNIQUE (tournament_id, seed)
);

CREATE TABLE IF NOT EXISTS rr_court (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES rr_tournament(tournament_id) ON DELETE CASCADE,
  court_no      INT NOT NULL CHECK (court_no >= 1),
  label         TEXT NOT NULL,
  UNIQUE (tournament_id, court_no)
);

CREATE TABLE IF NOT EXISTS rr_match (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id         UUID NOT NULL REFERENCES rr_tournament(tournament_id) ON DELETE CASCADE,
  group_id              UUID REFERENCES rr_group(id) ON DELETE CASCADE,
  stage_type            TEXT NOT NULL CHECK (stage_type IN ('group', 'playoff')),
  bracket_level         TEXT,
  bracket_round         TEXT,
  round_no              INT NOT NULL DEFAULT 1 CHECK (round_no >= 1),
  match_no              INT NOT NULL CHECK (match_no >= 1),
  schedule_slot         INT NOT NULL DEFAULT 1 CHECK (schedule_slot >= 1),
  court_no              INT CHECK (court_no >= 1),
  team_a_id             UUID REFERENCES rr_team(id),
  team_b_id             UUID REFERENCES rr_team(id),
  source_a_match_id     UUID REFERENCES rr_match(id),
  source_b_match_id     UUID REFERENCES rr_match(id),
  source_a_kind         TEXT CHECK (source_a_kind IN ('winner', 'loser')),
  source_b_kind         TEXT CHECK (source_b_kind IN ('winner', 'loser')),
  match_format          JSONB NOT NULL,
  score_a               INT[] NOT NULL DEFAULT ARRAY[0],
  score_b               INT[] NOT NULL DEFAULT ARRAY[0],
  sets_a                INT NOT NULL DEFAULT 0,
  sets_b                INT NOT NULL DEFAULT 0,
  serving               TEXT CHECK (serving IN ('a', 'b')),
  timer_remaining_sec   INT,
  timer_running         BOOLEAN NOT NULL DEFAULT false,
  winner_id             UUID REFERENCES rr_team(id),
  forfeit_side          TEXT CHECK (forfeit_side IN ('a', 'b')),
  status                TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled', 'ready', 'live', 'paused', 'finished',
                                         'forfeit', 'cancelled')),
  judge_version         INT NOT NULL DEFAULT 0,
  scheduled_at          TIMESTAMPTZ,
  started_at            TIMESTAMPTZ,
  finished_at           TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (stage_type = 'group' AND group_id IS NOT NULL) OR
    (stage_type = 'playoff' AND group_id IS NULL)
  ),
  UNIQUE (tournament_id, match_no)
);

CREATE TABLE IF NOT EXISTS rr_standing (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES rr_group(id) ON DELETE CASCADE,
  team_id         UUID NOT NULL REFERENCES rr_team(id) ON DELETE CASCADE,
  position        INT,
  played          INT NOT NULL DEFAULT 0,
  wins            INT NOT NULL DEFAULT 0,
  losses          INT NOT NULL DEFAULT 0,
  match_points    INT NOT NULL DEFAULT 0,
  sets_won        INT NOT NULL DEFAULT 0,
  sets_lost       INT NOT NULL DEFAULT 0,
  points_for      INT NOT NULL DEFAULT 0,
  points_against  INT NOT NULL DEFAULT 0,
  point_diff      INT NOT NULL DEFAULT 0,
  point_quotient  DOUBLE PRECISION NOT NULL DEFAULT 0,
  tiebreak_note   TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, team_id)
);

CREATE TABLE IF NOT EXISTS rr_judge_event (
  id                BIGSERIAL PRIMARY KEY,
  tournament_id     UUID NOT NULL REFERENCES rr_tournament(tournament_id) ON DELETE CASCADE,
  match_id           UUID NOT NULL REFERENCES rr_match(id) ON DELETE CASCADE,
  client_event_id    TEXT NOT NULL,
  expected_version  INT NOT NULL,
  resulting_version INT NOT NULL,
  action             TEXT NOT NULL,
  actor_kind         TEXT NOT NULL CHECK (actor_kind IN ('judge', 'operator', 'admin', 'system')),
  actor_id           TEXT,
  payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
  before_state       JSONB NOT NULL,
  after_state        JSONB NOT NULL,
  undone             BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, client_event_id)
);

CREATE INDEX IF NOT EXISTS rr_group_tournament_idx ON rr_group(tournament_id);
CREATE INDEX IF NOT EXISTS rr_team_tournament_idx ON rr_team(tournament_id);
CREATE INDEX IF NOT EXISTS rr_team_group_idx ON rr_team(group_id);
CREATE INDEX IF NOT EXISTS rr_court_tournament_idx ON rr_court(tournament_id);
CREATE INDEX IF NOT EXISTS rr_match_tournament_stage_idx ON rr_match(tournament_id, stage_type, schedule_slot);
CREATE INDEX IF NOT EXISTS rr_match_court_idx ON rr_match(tournament_id, court_no, schedule_slot);
CREATE INDEX IF NOT EXISTS rr_standing_group_idx ON rr_standing(group_id, position);
CREATE INDEX IF NOT EXISTS rr_judge_event_match_idx ON rr_judge_event(match_id, id DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rr_tournament TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rr_group TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rr_team TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rr_court TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rr_match TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rr_standing TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rr_judge_event TO lpbvolley;
GRANT USAGE, SELECT ON SEQUENCE rr_judge_event_id_seq TO lpbvolley;

COMMIT;
