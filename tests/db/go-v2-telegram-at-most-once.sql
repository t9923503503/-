\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  lost_id BIGINT;
  retry_id BIGINT;
  sent_id BIGINT;
  claimed_count INT;
  acknowledged BOOLEAN;
BEGIN
  INSERT INTO telegram_outbox (chat_id, kind, text, dedup_key, next_attempt_at)
  VALUES ('900000000001', 'go_v2_test', 'lost response fixture', 'go-v2-db-test:lost-response', '-infinity')
  RETURNING id INTO lost_id;

  PERFORM * FROM go_v2_claim_telegram_outbox('db-test:relay-a', 1, 30)
   WHERE id = lost_id;
  SELECT go_v2_begin_telegram_outbox_attempt(
    lost_id,
    'db-test:relay-a',
    'attempt-lost-response-0001'
  ) INTO acknowledged;
  IF acknowledged IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'provider-attempt fence was not recorded';
  END IF;

  UPDATE telegram_outbox
     SET claim_expires_at = now() - interval '1 second'
   WHERE id = lost_id;

  -- A second worker must quarantine an uncertain outcome, never send it again.
  PERFORM * FROM go_v2_claim_telegram_outbox('db-test:relay-b', 25, 30);
  SELECT count(*)::int INTO claimed_count
    FROM go_v2_claim_telegram_outbox('db-test:relay-b', 25, 30)
   WHERE id = lost_id;
  IF claimed_count <> 0 THEN
    RAISE EXCEPTION 'uncertain Telegram delivery was reclaimed';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM telegram_outbox
     WHERE id = lost_id
       AND sent_at IS NULL
       AND dead_lettered_at IS NOT NULL
       AND delivery_uncertain_at IS NOT NULL
       AND delivery_receipt->>'status' = 'delivery_unknown'
  ) THEN
    RAISE EXCEPTION 'uncertain Telegram delivery was not quarantined';
  END IF;

  INSERT INTO telegram_outbox (chat_id, kind, text, dedup_key, next_attempt_at)
  VALUES ('900000000002', 'go_v2_test', 'definite rejection fixture', 'go-v2-db-test:definite-rejection', '-infinity')
  RETURNING id INTO retry_id;
  PERFORM * FROM go_v2_claim_telegram_outbox('db-test:relay-c', 25, 30)
   WHERE id = retry_id;
  IF go_v2_begin_telegram_outbox_attempt(
    retry_id,
    'db-test:relay-c',
    'attempt-definite-rejection-0001'
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'retry fixture provider-attempt fence was not recorded';
  END IF;
  IF go_v2_fail_telegram_outbox(
    retry_id,
    'db-test:relay-c',
    'telegram_429_rejected'
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'definite provider rejection was not acknowledged';
  END IF;
  UPDATE telegram_outbox SET next_attempt_at = now() WHERE id = retry_id;
  SELECT count(*)::int INTO claimed_count
    FROM go_v2_claim_telegram_outbox('db-test:relay-d', 25, 30)
   WHERE id = retry_id;
  IF claimed_count <> 1 THEN
    RAISE EXCEPTION 'definite provider rejection did not become retryable';
  END IF;

  INSERT INTO telegram_outbox (chat_id, kind, text, dedup_key, next_attempt_at)
  VALUES ('900000000003', 'go_v2_test', 'idempotent receipt fixture', 'go-v2-db-test:idempotent-receipt', '-infinity')
  RETURNING id INTO sent_id;
  PERFORM * FROM go_v2_claim_telegram_outbox('db-test:relay-e', 25, 30)
   WHERE id = sent_id;
  IF go_v2_begin_telegram_outbox_attempt(
    sent_id,
    'db-test:relay-e',
    'attempt-success-0001'
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'success fixture provider-attempt fence was not recorded';
  END IF;
  IF go_v2_complete_telegram_outbox(
    sent_id,
    'db-test:relay-e',
    '{"provider":"telegram","messageId":12345,"providerAttemptId":"attempt-success-0001"}'::jsonb
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'successful Telegram receipt was not recorded';
  END IF;
  IF go_v2_complete_telegram_outbox(
    sent_id,
    'db-test:relay-e',
    '{"provider":"telegram","messageId":12345,"providerAttemptId":"attempt-success-0001"}'::jsonb
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'lost successful ack was not idempotent';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM telegram_outbox
     WHERE id = sent_id
       AND sent_at IS NOT NULL
       AND delivery_receipt->>'messageId' = '12345'
       AND delivery_receipt->>'status' = 'sent'
  ) THEN
    RAISE EXCEPTION 'successful Telegram receipt has unexpected state';
  END IF;
END $$;

ROLLBACK;
