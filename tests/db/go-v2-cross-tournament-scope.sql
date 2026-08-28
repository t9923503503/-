\set ON_ERROR_STOP on

-- Run as a PostgreSQL administrator against a disposable database after
-- migrations 105..109. Fixtures are created as the owner; all attack probes
-- run as the application role and the transaction is rolled back.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.go_v2_expect_scope_reject(
  statement_text TEXT,
  test_label TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  got_rejection BOOLEAN := false;
  got_state TEXT;
  got_message TEXT;
BEGIN
  BEGIN
    EXECUTE statement_text;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      got_state = RETURNED_SQLSTATE,
      got_message = MESSAGE_TEXT;
    IF got_state <> '23514'
       OR (position('go_v2 tournament scope mismatch' in got_message) = 0
           AND position('go_v2 schedule scope mismatch' in got_message) = 0
           AND position('go_v2 stage scope mismatch' in got_message) = 0
           AND position('go_v2 match scope mismatch' in got_message) = 0) THEN
      RAISE EXCEPTION 'DB TEST FAIL %: got [%] %, expected [23514] scope mismatch',
        test_label, got_state, got_message;
    END IF;
    got_rejection := true;
    RAISE NOTICE 'DB TEST PASS % => [%] %', test_label, got_state, got_message;
  END;
  IF NOT got_rejection THEN
    RAISE EXCEPTION 'DB TEST FAIL %: statement unexpectedly succeeded', test_label;
  END IF;
END;
$$;

INSERT INTO tournaments (id, name, division, capacity, status, go_engine_version)
VALUES
  ('f1090000-0000-4000-8000-000000000001', 'GO V2 scope test A', 'Микст', 8, 'draft', 2),
  ('f1090000-0000-4000-8000-000000000002', 'GO V2 scope test B', 'Микст', 8, 'draft', 2);

INSERT INTO go_v2_entries (id, tournament_id, entry_no, display_name)
VALUES
  ('f1090100-0000-4000-8000-000000000001', 'f1090000-0000-4000-8000-000000000001', 1, 'A1'),
  ('f1090100-0000-4000-8000-000000000002', 'f1090000-0000-4000-8000-000000000001', 2, 'A2'),
  ('f1090100-0000-4000-8000-000000000003', 'f1090000-0000-4000-8000-000000000002', 1, 'B1'),
  ('f1090100-0000-4000-8000-000000000004', 'f1090000-0000-4000-8000-000000000002', 2, 'B2');

INSERT INTO go_v2_stages (
  id, tournament_id, stage_key, stage_order, stage_type
) VALUES
  ('f1090200-0000-4000-8000-000000000001', 'f1090000-0000-4000-8000-000000000001', 'a-pools', 1, 'round_robin_pool'),
  ('f1090200-0000-4000-8000-000000000002', 'f1090000-0000-4000-8000-000000000001', 'a-bracket', 2, 'single_elimination'),
  ('f1090200-0000-4000-8000-000000000003', 'f1090000-0000-4000-8000-000000000002', 'b-pools', 1, 'round_robin_pool'),
  ('f1090200-0000-4000-8000-000000000004', 'f1090000-0000-4000-8000-000000000002', 'b-bracket', 2, 'single_elimination');

INSERT INTO go_v2_pools (id, stage_id, pool_no, label, capacity)
VALUES
  ('f1090300-0000-4000-8000-000000000001', 'f1090200-0000-4000-8000-000000000001', 1, 'A', 3),
  ('f1090300-0000-4000-8000-000000000002', 'f1090200-0000-4000-8000-000000000003', 1, 'B', 3);

INSERT INTO go_v2_matches (
  id, tournament_id, stage_id, pool_id, match_key, round_no, position
) VALUES
  ('f1090400-0000-4000-8000-000000000001', 'f1090000-0000-4000-8000-000000000001', 'f1090200-0000-4000-8000-000000000001', 'f1090300-0000-4000-8000-000000000001', 'a-pool-1', 1, 1),
  ('f1090400-0000-4000-8000-000000000002', 'f1090000-0000-4000-8000-000000000001', 'f1090200-0000-4000-8000-000000000002', NULL, 'a-bracket-1', 1, 1),
  ('f1090400-0000-4000-8000-000000000003', 'f1090000-0000-4000-8000-000000000002', 'f1090200-0000-4000-8000-000000000003', 'f1090300-0000-4000-8000-000000000002', 'b-pool-1', 1, 1),
  ('f1090400-0000-4000-8000-000000000004', 'f1090000-0000-4000-8000-000000000002', 'f1090200-0000-4000-8000-000000000004', NULL, 'b-bracket-1', 1, 1);

INSERT INTO go_v2_courts (id, venue_key, court_no, label)
VALUES
  ('f1090500-0000-4000-8000-000000000001', 'scope-test-a', 1, 'Court A'),
  ('f1090500-0000-4000-8000-000000000002', 'scope-test-b', 1, 'Court B');

INSERT INTO go_v2_schedule_sessions (
  id, session_key, label, timezone, window_start, window_end
) VALUES
  ('f1090600-0000-4000-8000-000000000001', 'scope-test-a', 'Session A', 'Asia/Yekaterinburg', now(), now() + interval '8 hours'),
  ('f1090600-0000-4000-8000-000000000002', 'scope-test-b', 'Session B', 'Asia/Yekaterinburg', now(), now() + interval '8 hours');

INSERT INTO go_v2_schedule_session_tournaments (session_id, tournament_id)
VALUES
  ('f1090600-0000-4000-8000-000000000001', 'f1090000-0000-4000-8000-000000000001'),
  ('f1090600-0000-4000-8000-000000000002', 'f1090000-0000-4000-8000-000000000002');

INSERT INTO go_v2_schedule_session_courts (session_id, court_id)
VALUES
  ('f1090600-0000-4000-8000-000000000001', 'f1090500-0000-4000-8000-000000000001'),
  ('f1090600-0000-4000-8000-000000000002', 'f1090500-0000-4000-8000-000000000002');

INSERT INTO go_v2_schedule_versions (
  id, session_id, version_no, status, solver_status, solver_version, input_hash, created_by
) VALUES
  ('f1090700-0000-4000-8000-000000000001', 'f1090600-0000-4000-8000-000000000001', 1, 'validated', 'feasible', 'db-test', repeat('a', 64), 'db-test'),
  ('f1090700-0000-4000-8000-000000000002', 'f1090600-0000-4000-8000-000000000002', 1, 'validated', 'feasible', 'db-test', repeat('b', 64), 'db-test');

INSERT INTO go_v2_schedule_assignments (
  id, schedule_version_id, match_id, court_id, planned_start, planned_end
) VALUES
  ('f1090800-0000-4000-8000-000000000001', 'f1090700-0000-4000-8000-000000000001', 'f1090400-0000-4000-8000-000000000001', 'f1090500-0000-4000-8000-000000000001', now(), now() + interval '20 minutes'),
  ('f1090800-0000-4000-8000-000000000002', 'f1090700-0000-4000-8000-000000000002', 'f1090400-0000-4000-8000-000000000003', 'f1090500-0000-4000-8000-000000000002', now(), now() + interval '20 minutes');

INSERT INTO go_v2_schedule_disruptions (
  id, tournament_id, schedule_session_id, disruption_kind, status,
  starts_at, reason_code, created_by, scope_kind
) VALUES
  ('f1090900-0000-4000-8000-000000000001', 'f1090000-0000-4000-8000-000000000001', 'f1090600-0000-4000-8000-000000000001', 'rain_hold', 'active', now(), 'admin_override', 'db-test', 'session');

INSERT INTO go_v2_match_pause_resolutions (
  id, tournament_id, schedule_session_id, match_id, decision, source_court_id,
  prior_schedule_version_id, prior_schedule_assignment_id,
  prior_command_version, resulting_command_version, reason_code, actor_id, command_id
) VALUES (
  'f1090a00-0000-4000-8000-000000000001',
  'f1090000-0000-4000-8000-000000000001',
  'f1090600-0000-4000-8000-000000000001',
  'f1090400-0000-4000-8000-000000000001',
  'defer', 'f1090500-0000-4000-8000-000000000001',
  'f1090700-0000-4000-8000-000000000001',
  'f1090800-0000-4000-8000-000000000001',
  0, 0, 'admin_override', 'db-test', 'valid-pause-a'
);

SET LOCAL ROLE lpbvolley;

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_stage_edges (tournament_id, from_stage_id, to_stage_id, routing_kind)
     VALUES ('f1090000-0000-4000-8000-000000000001', 'f1090200-0000-4000-8000-000000000001', 'f1090200-0000-4000-8000-000000000004', 'all')$q$,
  'stage edge cannot cross tournaments'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_pool_assignments (pool_id, entry_id, slot_no, assigned_by)
     VALUES ('f1090300-0000-4000-8000-000000000001', 'f1090100-0000-4000-8000-000000000003', 1, 'attack')$q$,
  'pool assignment cannot import another tournament entry'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_matches (tournament_id, stage_id, match_key)
     VALUES ('f1090000-0000-4000-8000-000000000001', 'f1090200-0000-4000-8000-000000000004', 'cross-stage')$q$,
  'match stage cannot cross tournaments'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_matches (tournament_id, stage_id, pool_id, match_key)
     VALUES ('f1090000-0000-4000-8000-000000000001', 'f1090200-0000-4000-8000-000000000002', 'f1090300-0000-4000-8000-000000000001', 'wrong-stage-pool')$q$,
  'match pool must belong to its stage'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_match_slot_sources
       (match_id, slot_no, source_type, source_entry_id, route_source_type)
     VALUES ('f1090400-0000-4000-8000-000000000002', 1, 'ENTRY',
       'f1090100-0000-4000-8000-000000000003', 'ENTRY')$q$,
  'ENTRY slot source cannot cross tournaments'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_match_slot_sources
       (match_id, slot_no, source_type, source_pool_id, source_rank, route_source_type)
     VALUES ('f1090400-0000-4000-8000-000000000002', 1, 'POOL_RANK',
       'f1090300-0000-4000-8000-000000000002', 1, 'POOL_RANK')$q$,
  'POOL_RANK slot source cannot cross tournaments'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_match_slot_sources
       (match_id, slot_no, source_type, source_match_id, route_source_type, route_source_match_id)
     VALUES ('f1090400-0000-4000-8000-000000000002', 1, 'MATCH_WINNER',
       'f1090400-0000-4000-8000-000000000004', 'MATCH_WINNER',
       'f1090400-0000-4000-8000-000000000004')$q$,
  'MATCH_WINNER slot source cannot cross tournaments'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_match_slot_sources
       (match_id, slot_no, source_type, source_match_id, route_source_type, route_source_match_id)
     VALUES ('f1090400-0000-4000-8000-000000000002', 2, 'MATCH_LOSER',
       'f1090400-0000-4000-8000-000000000004', 'MATCH_LOSER',
       'f1090400-0000-4000-8000-000000000004')$q$,
  'MATCH_LOSER slot source cannot cross tournaments'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_match_slot_sources
       (match_id, slot_no, source_type, route_source_type, route_source_match_id)
     VALUES ('f1090400-0000-4000-8000-000000000002', 1, 'BYE',
       'MATCH_WINNER', 'f1090400-0000-4000-8000-000000000004')$q$,
  'immutable route source cannot cross tournaments'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_match_slot_sources
       (match_id, slot_no, source_type, route_source_type, resolved_entry_id)
     VALUES ('f1090400-0000-4000-8000-000000000002', 1, 'BYE', 'BYE',
       'f1090100-0000-4000-8000-000000000003')$q$,
  'resolved slot entry cannot cross tournaments'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_match_result_revisions
       (match_id, revision_no, result_kind, winner_entry_id, advancement_effect,
        rating_eligibility, reason_code, author_id)
     VALUES ('f1090400-0000-4000-8000-000000000001', 1, 'admin_award',
       'f1090100-0000-4000-8000-000000000003', 'advance_winner',
       'ineligible', 'admin_override', 'attack')$q$,
  'result winner cannot cross tournaments'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_attendance_events
       (tournament_id, entry_id, aggregate_version, attendance_version,
        from_state, to_state, effective_at, reason_code, actor_id, command_id, device_id)
     VALUES ('f1090000-0000-4000-8000-000000000001',
       'f1090100-0000-4000-8000-000000000003', 1, 1,
       'unknown', 'confirmed', now(), 'admin_override', 'attack', 'cross-attendance', 'db-test')$q$,
  'attendance entry cannot cross tournaments'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_schedule_assignments
       (schedule_version_id, match_id, court_id, planned_start, planned_end)
     VALUES ('f1090700-0000-4000-8000-000000000001',
       'f1090400-0000-4000-8000-000000000003',
       'f1090500-0000-4000-8000-000000000001', now(), now() + interval '20 minutes')$q$,
  'schedule assignment cannot import another tournament match'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_schedule_disruptions
       (tournament_id, schedule_session_id, disruption_kind, status,
        starts_at, reason_code, created_by, scope_kind)
     VALUES ('f1090000-0000-4000-8000-000000000001',
       'f1090600-0000-4000-8000-000000000002', 'rain_hold', 'active',
       now(), 'admin_override', 'attack', 'session')$q$,
  'disruption session cannot cross tournaments'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_disruption_matches (disruption_id, match_id, action, risk)
     VALUES ('f1090900-0000-4000-8000-000000000001',
       'f1090400-0000-4000-8000-000000000003', 'replan', 'amber')$q$,
  'disruption match cannot cross tournaments'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_match_pause_resolutions
       (tournament_id, schedule_session_id, match_id, decision, source_court_id,
        prior_schedule_version_id, prior_schedule_assignment_id,
        prior_command_version, resulting_command_version, reason_code, actor_id, command_id)
     VALUES ('f1090000-0000-4000-8000-000000000001',
       'f1090600-0000-4000-8000-000000000001',
       'f1090400-0000-4000-8000-000000000003', 'defer',
       'f1090500-0000-4000-8000-000000000001',
       'f1090700-0000-4000-8000-000000000001',
       'f1090800-0000-4000-8000-000000000001',
       0, 0, 'admin_override', 'attack', 'cross-pause')$q$,
  'pause resolution match cannot cross tournaments'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_schedule_defer_overrides
       (tournament_id, schedule_session_id, match_id, action, defer_mode,
        not_before, pause_resolution_id, reason_code, actor_id, command_id)
     VALUES ('f1090000-0000-4000-8000-000000000001',
       'f1090600-0000-4000-8000-000000000001',
       'f1090400-0000-4000-8000-000000000003', 'defer', 'end_of_queue',
       now(), 'f1090a00-0000-4000-8000-000000000001',
       'admin_override', 'attack', 'cross-defer')$q$,
  'defer match cannot cross tournaments'
);

SELECT pg_temp.go_v2_expect_scope_reject(
  $q$INSERT INTO go_v2_match_court_segments
       (tournament_id, schedule_session_id, match_id, segment_no,
        schedule_version_id, schedule_assignment_id, court_id, created_by)
     VALUES ('f1090000-0000-4000-8000-000000000001',
       'f1090600-0000-4000-8000-000000000001',
       'f1090400-0000-4000-8000-000000000003', 1,
       'f1090700-0000-4000-8000-000000000001',
       'f1090800-0000-4000-8000-000000000001',
       'f1090500-0000-4000-8000-000000000001', 'attack')$q$,
  'court segment match cannot cross tournaments'
);

RESET ROLE;
ROLLBACK;

SELECT 'post_rollback_fixture_count', count(*)
FROM tournaments
WHERE id IN (
  'f1090000-0000-4000-8000-000000000001',
  'f1090000-0000-4000-8000-000000000002'
);
