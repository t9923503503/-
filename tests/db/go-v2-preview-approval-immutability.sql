\set ON_ERROR_STOP on

-- Run as a PostgreSQL administrator against a disposable database after
-- migrations 105..109. Every fixture and mutation is rolled back.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.go_v2_expect_reject(
  statement_text text,
  expected_state text,
  expected_fragment text,
  test_label text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  got_rejection boolean := false;
  got_state text;
  got_message text;
BEGIN
  BEGIN
    EXECUTE statement_text;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      got_state = RETURNED_SQLSTATE,
      got_message = MESSAGE_TEXT;
    IF got_state <> expected_state OR position(expected_fragment in got_message) = 0 THEN
      RAISE EXCEPTION 'DB TEST FAIL %: got [%] %, expected [%] containing %',
        test_label, got_state, got_message, expected_state, expected_fragment;
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
VALUES (
  'f1089000-0000-4000-8000-000000000001',
  'GO V2 preview/approval immutability DB test',
  'Микст',
  8,
  'draft',
  2
);

INSERT INTO go_v2_operation_previews (
  id, tournament_id, operation_kind, aggregate_version, input_hash,
  risk, payload, result, created_by, expires_at
) VALUES
(
  'f1089100-0000-4000-8000-000000000001',
  'f1089000-0000-4000-8000-000000000001',
  'incident.preview', 0, repeat('a', 64), 'red', '{}', '{}',
  'requester-a', now() + interval '30 minutes'
),
(
  'f1089100-0000-4000-8000-000000000002',
  'f1089000-0000-4000-8000-000000000001',
  'incident.preview', 0, repeat('b', 64), 'red', '{}', '{}',
  'requester-b', now() + interval '30 minutes'
),
(
  'f1089100-0000-4000-8000-000000000003',
  'f1089000-0000-4000-8000-000000000001',
  'incident.preview', 0, repeat('c', 64), 'red', '{}', '{}',
  'requester-c', now() + interval '30 minutes'
);

INSERT INTO go_v2_red_operation_approvals (
  id, tournament_id, preview_id, requested_by, approved_by, approved_role,
  command_id, request_hash, reviewed_input_hash, reviewed_aggregate_version,
  device_id, reason_code, expires_at
) VALUES
(
  'f1089200-0000-4000-8000-000000000001',
  'f1089000-0000-4000-8000-000000000001',
  'f1089100-0000-4000-8000-000000000001',
  'requester-a', 'approver-a', 'admin', 'immutability-a', repeat('d', 64),
  repeat('a', 64), 0, 'db-test', 'admin_override', now() + interval '15 minutes'
),
(
  'f1089200-0000-4000-8000-000000000002',
  'f1089000-0000-4000-8000-000000000001',
  'f1089100-0000-4000-8000-000000000002',
  'requester-b', 'approver-b', 'admin', 'immutability-b', repeat('e', 64),
  repeat('b', 64), 0, 'db-test', 'admin_override', now() + interval '15 minutes'
);

SET LOCAL ROLE lpbvolley;

SELECT pg_temp.go_v2_expect_reject(
  $q$UPDATE go_v2_operation_previews SET payload='{"forged":true}' WHERE id='f1089100-0000-4000-8000-000000000001'$q$,
  '42501', 'permission denied', 'runtime cannot rewrite preview payload'
);
SELECT pg_temp.go_v2_expect_reject(
  $q$DELETE FROM go_v2_operation_previews WHERE id='f1089100-0000-4000-8000-000000000001'$q$,
  '42501', 'permission denied', 'runtime cannot delete preview'
);
SELECT pg_temp.go_v2_expect_reject(
  $q$UPDATE go_v2_red_operation_approvals SET approved_by='forged' WHERE id='f1089200-0000-4000-8000-000000000001'$q$,
  '42501', 'permission denied', 'runtime cannot rewrite approval identity'
);
SELECT pg_temp.go_v2_expect_reject(
  $q$DELETE FROM go_v2_red_operation_approvals WHERE id='f1089200-0000-4000-8000-000000000001'$q$,
  '42501', 'permission denied', 'runtime cannot delete approval'
);

UPDATE go_v2_operation_previews
SET consumed_at = now()
WHERE id = 'f1089100-0000-4000-8000-000000000001';
UPDATE go_v2_red_operation_approvals
SET consumed_at = now()
WHERE id = 'f1089200-0000-4000-8000-000000000001';

SELECT pg_temp.go_v2_expect_reject(
  $q$UPDATE go_v2_operation_previews SET consumed_at=NULL WHERE id='f1089100-0000-4000-8000-000000000001'$q$,
  '55000', 'only first consumption is allowed', 'preview consumption cannot be cleared'
);
SELECT pg_temp.go_v2_expect_reject(
  $q$UPDATE go_v2_red_operation_approvals SET consumed_at=now() WHERE id='f1089200-0000-4000-8000-000000000001'$q$,
  '55000', 'only fresh first consumption is allowed', 'approval consumption cannot be repeated'
);

RESET ROLE;

SELECT pg_temp.go_v2_expect_reject(
  $q$UPDATE go_v2_operation_previews SET result='{"forged":true}' WHERE id='f1089100-0000-4000-8000-000000000002'$q$,
  '55000', 'operation preview history is append-only', 'trigger blocks privileged preview rewrite'
);
SELECT pg_temp.go_v2_expect_reject(
  $q$DELETE FROM go_v2_red_operation_approvals WHERE id='f1089200-0000-4000-8000-000000000002'$q$,
  '55000', 'red approval history is append-only', 'trigger blocks privileged approval delete'
);
SELECT pg_temp.go_v2_expect_reject(
  $q$
    INSERT INTO go_v2_red_operation_approvals (
      tournament_id, preview_id, requested_by, approved_by, approved_role,
      command_id, request_hash, reviewed_input_hash, reviewed_aggregate_version,
      device_id, reason_code, expires_at, consumed_at
    ) VALUES (
      'f1089000-0000-4000-8000-000000000001',
      'f1089100-0000-4000-8000-000000000003',
      'requester-c', 'approver-c', 'admin', 'immutability-consumed',
      repeat('f',64), repeat('c',64), 0, 'db-test', 'admin_override',
      now()+interval '15 minutes', now()
    )
  $q$,
  '23514', 'must be inserted unconsumed', 'approval cannot be born consumed'
);
SELECT pg_temp.go_v2_expect_reject(
  $q$
    INSERT INTO go_v2_red_operation_approvals (
      tournament_id, preview_id, requested_by, approved_by, approved_role,
      command_id, request_hash, reviewed_input_hash, reviewed_aggregate_version,
      device_id, reason_code, expires_at
    ) VALUES (
      'f1089000-0000-4000-8000-000000000001',
      'f1089100-0000-4000-8000-000000000003',
      'forged-requester', 'approver-c', 'admin', 'immutability-mismatch',
      repeat('0',64), repeat('c',64), 0, 'db-test', 'admin_override',
      now()+interval '15 minutes'
    )
  $q$,
  '23514', 'does not match a fresh immutable preview', 'approval must match preview author/hash/version'
);

ROLLBACK;

SELECT 'post_rollback_fixture_count', count(*)
FROM tournaments
WHERE id = 'f1089000-0000-4000-8000-000000000001';
