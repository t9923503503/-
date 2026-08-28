-- Additive Tournament Engine V2 classification/consolation support.
-- Legacy GO, Round Robin, Thai, KOTC and Individual Mix tables are untouched.

BEGIN;

-- Classification matches have direct ENTRY slots, therefore their sporting
-- lineage cannot be represented by MATCH_WINNER/MATCH_LOSER slot sources.
-- Keep the scheduling precedence DAG normalized and separate from routing.
CREATE TABLE IF NOT EXISTS go_v2_match_dependencies (
  match_id            UUID NOT NULL REFERENCES go_v2_matches(id) ON DELETE RESTRICT,
  depends_on_match_id UUID NOT NULL REFERENCES go_v2_matches(id) ON DELETE RESTRICT,
  dependency_kind     TEXT NOT NULL DEFAULT 'team_sequence'
                      CHECK (dependency_kind IN ('team_sequence')),
  ordinal             INT NOT NULL CHECK (ordinal >= 1),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, depends_on_match_id),
  UNIQUE (match_id, ordinal),
  CHECK (match_id <> depends_on_match_id)
);

CREATE INDEX IF NOT EXISTS go_v2_match_dependencies_upstream_idx
  ON go_v2_match_dependencies(depends_on_match_id);

ALTER TABLE go_v2_final_placement_rows
  DROP CONSTRAINT IF EXISTS go_v2_final_placement_rows_basis_check;
ALTER TABLE go_v2_final_placement_rows
  ADD CONSTRAINT go_v2_final_placement_rows_basis_check CHECK (basis IN (
    'championship_match', 'placement_match', 'elimination_round',
    'classification_standings', 'initial_seed_tiebreak'
  ));

CREATE OR REPLACE FUNCTION go_v2_validate_match_dependency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_tournament UUID;
  source_tournament UUID;
BEGIN
  SELECT tournament_id INTO target_tournament
  FROM go_v2_matches
  WHERE id = NEW.match_id;

  SELECT tournament_id INTO source_tournament
  FROM go_v2_matches
  WHERE id = NEW.depends_on_match_id;

  IF target_tournament IS NULL OR source_tournament IS NULL
     OR target_tournament IS DISTINCT FROM source_tournament THEN
    RAISE EXCEPTION 'go_v2 match dependency must stay inside one tournament'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    WITH RECURSIVE ancestors(match_id) AS (
      SELECT dependency.depends_on_match_id
      FROM go_v2_match_dependencies dependency
      WHERE dependency.match_id = NEW.depends_on_match_id
      UNION
      SELECT dependency.depends_on_match_id
      FROM go_v2_match_dependencies dependency
      JOIN ancestors ON ancestors.match_id = dependency.match_id
    )
    SELECT 1 FROM ancestors WHERE match_id = NEW.match_id
  ) THEN
    RAISE EXCEPTION 'go_v2 match dependency graph must be acyclic'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS go_v2_match_dependency_validate
  ON go_v2_match_dependencies;
CREATE TRIGGER go_v2_match_dependency_validate
BEFORE INSERT ON go_v2_match_dependencies
FOR EACH ROW
EXECUTE FUNCTION go_v2_validate_match_dependency();

DROP TRIGGER IF EXISTS go_v2_match_dependency_immutable
  ON go_v2_match_dependencies;
CREATE TRIGGER go_v2_match_dependency_immutable
BEFORE UPDATE OR DELETE ON go_v2_match_dependencies
FOR EACH ROW
EXECUTE FUNCTION go_v2_reject_immutable_mutation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    GRANT SELECT, INSERT ON TABLE go_v2_match_dependencies TO lpbvolley;
  END IF;
END $$;

COMMIT;
