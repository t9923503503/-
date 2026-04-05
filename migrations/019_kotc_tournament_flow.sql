-- ============================================================
-- 019: KOTC tournament flow (roster -> rounds -> level-based round 2)
-- ============================================================

CREATE TABLE IF NOT EXISTS kotc_tournament_roster (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id            UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  tournament_participant_id UUID NULL REFERENCES tournament_participants(id) ON DELETE SET NULL,
  player_id                UUID NULL REFERENCES players(id) ON DELETE SET NULL,
  display_name             TEXT NOT NULL,
  seed                     INTEGER NULL,
  confirmed                BOOLEAN NOT NULL DEFAULT true,
  active                   BOOLEAN NOT NULL DEFAULT true,
  dropped                  BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kotc_tournament_roster_participant
  ON kotc_tournament_roster (tournament_id, tournament_participant_id)
  WHERE tournament_participant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kotc_tournament_roster_player
  ON kotc_tournament_roster (tournament_id, player_id)
  WHERE player_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kotc_tournament_roster_tid
  ON kotc_tournament_roster (tournament_id, active, confirmed, dropped, seed);

CREATE TABLE IF NOT EXISTS kotc_tournament_round (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id            UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_no                 INTEGER NOT NULL,
  stage_type               TEXT NOT NULL CHECK (stage_type IN ('round1', 'round2', 'final')),
  status                   TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'live', 'finished', 'cancelled')),
  level_count              INTEGER NOT NULL DEFAULT 1 CHECK (level_count BETWEEN 1 AND 4),
  source_round_id          UUID NULL REFERENCES kotc_tournament_round(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at               TIMESTAMPTZ NULL,
  finished_at              TIMESTAMPTZ NULL,
  UNIQUE (tournament_id, round_no),
  UNIQUE (tournament_id, stage_type)
);

CREATE INDEX IF NOT EXISTS idx_kotc_tournament_round_tid
  ON kotc_tournament_round (tournament_id, round_no);

CREATE TABLE IF NOT EXISTS kotc_tournament_round_assignment (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id                 UUID NOT NULL REFERENCES kotc_tournament_round(id) ON DELETE CASCADE,
  roster_id                UUID NOT NULL REFERENCES kotc_tournament_roster(id) ON DELETE CASCADE,
  court_idx                INTEGER NOT NULL CHECK (court_idx BETWEEN 1 AND 4),
  slot_idx                 INTEGER NOT NULL CHECK (slot_idx BETWEEN 1 AND 4),
  level_idx                INTEGER NOT NULL DEFAULT 1 CHECK (level_idx BETWEEN 1 AND 4),
  assignment_status        TEXT NOT NULL DEFAULT 'assigned' CHECK (assignment_status IN ('assigned', 'confirmed', 'done', 'cancelled')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, roster_id),
  UNIQUE (round_id, court_idx, slot_idx)
);

CREATE INDEX IF NOT EXISTS idx_kotc_round_assignment_round
  ON kotc_tournament_round_assignment (round_id, court_idx, slot_idx);

CREATE TABLE IF NOT EXISTS kotc_tournament_round_result (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id                 UUID NOT NULL REFERENCES kotc_tournament_round(id) ON DELETE CASCADE,
  roster_id                UUID NOT NULL REFERENCES kotc_tournament_roster(id) ON DELETE CASCADE,
  court_idx                INTEGER NOT NULL CHECK (court_idx BETWEEN 1 AND 4),
  points                   INTEGER NOT NULL DEFAULT 0,
  place_on_court           INTEGER NULL,
  qualified                BOOLEAN NULL,
  level_after_round        INTEGER NULL CHECK (level_after_round BETWEEN 1 AND 4),
  stats_json               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, roster_id)
);

CREATE INDEX IF NOT EXISTS idx_kotc_round_result_round
  ON kotc_tournament_round_result (round_id, points DESC, place_on_court ASC);

CREATE TABLE IF NOT EXISTS kotc_tournament_level_rule (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  format_code              TEXT NOT NULL,
  min_participants         INTEGER NOT NULL,
  max_participants         INTEGER NOT NULL,
  level_count              INTEGER NOT NULL CHECK (level_count BETWEEN 1 AND 4),
  config_json              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (format_code, min_participants, max_participants)
);

INSERT INTO kotc_tournament_level_rule (format_code, min_participants, max_participants, level_count, config_json)
VALUES
  ('KOTC_STANDARD_IPT', 1, 4, 1, '{"maxPlayersPerLevel":4}'::jsonb),
  ('KOTC_STANDARD_IPT', 5, 8, 2, '{"maxPlayersPerLevel":4}'::jsonb),
  ('KOTC_STANDARD_IPT', 9, 12, 3, '{"maxPlayersPerLevel":4}'::jsonb),
  ('KOTC_STANDARD_IPT', 13, 16, 4, '{"maxPlayersPerLevel":4}'::jsonb)
ON CONFLICT (format_code, min_participants, max_participants) DO UPDATE
SET level_count = EXCLUDED.level_count,
    config_json = EXCLUDED.config_json;
