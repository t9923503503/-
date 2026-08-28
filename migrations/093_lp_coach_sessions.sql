-- 093: LP Coach training sessions, external identities and idempotent Kotyara sync.
BEGIN;

CREATE TABLE IF NOT EXISTS coach_training_sessions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                    TEXT NOT NULL,
  starts_at                TIMESTAMPTZ NOT NULL,
  ends_at                  TIMESTAMPTZ NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'scheduled'
                           CHECK (status IN ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  location                 TEXT NOT NULL DEFAULT '',
  court_count              SMALLINT NOT NULL DEFAULT 1 CHECK (court_count BETWEEN 0 AND 20),
  capacity                 SMALLINT CHECK (capacity BETWEEN 1 AND 200),
  yclients_records_count   SMALLINT CHECK (yclients_records_count BETWEEN 0 AND 200),
  source                   TEXT NOT NULL DEFAULT 'manual'
                           CHECK (source IN ('manual', 'kotyara', 'yclients', 'import')),
  external_event_id        TEXT,
  telegram_chat_id         BIGINT,
  telegram_message_id      BIGINT,
  yclients_event_id        TEXT,
  source_metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_actor         TEXT NOT NULL,
  updated_by_actor         TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (external_event_id IS NULL OR length(btrim(external_event_id)) BETWEEN 1 AND 240),
  UNIQUE (source, external_event_id)
);

CREATE TABLE IF NOT EXISTS coach_external_identities (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id                UUID REFERENCES players(id) ON DELETE RESTRICT,
  provider                 TEXT NOT NULL CHECK (provider IN ('telegram', 'yclients', 'lpvolley')),
  external_id              TEXT NOT NULL,
  display_name             TEXT NOT NULL DEFAULT '',
  username                 TEXT NOT NULL DEFAULT '',
  metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution_status        TEXT NOT NULL DEFAULT 'unresolved'
                           CHECK (resolution_status IN ('unresolved', 'resolved', 'ignored')),
  resolved_at              TIMESTAMPTZ,
  resolved_by_actor        TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(btrim(external_id)) BETWEEN 1 AND 240),
  CHECK (
    (resolution_status = 'resolved' AND player_id IS NOT NULL AND resolved_at IS NOT NULL)
    OR (resolution_status IN ('unresolved', 'ignored') AND player_id IS NULL)
  ),
  UNIQUE (provider, external_id)
);

CREATE TABLE IF NOT EXISTS coach_training_participants (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_session_id      UUID NOT NULL REFERENCES coach_training_sessions(id) ON DELETE CASCADE,
  player_id                UUID REFERENCES players(id) ON DELETE RESTRICT,
  display_name             TEXT NOT NULL DEFAULT '',
  telegram_status          TEXT NOT NULL DEFAULT 'unknown'
                           CHECK (telegram_status IN ('going', 'maybe', 'not_going', 'unknown')),
  yclients_status          TEXT NOT NULL DEFAULT 'unknown'
                           CHECK (yclients_status IN ('booked', 'waitlist', 'cancelled', 'unknown')),
  actual_attendance        TEXT NOT NULL DEFAULT 'unknown'
                           CHECK (actual_attendance IN ('present', 'absent', 'late', 'left_early', 'unknown')),
  joined_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, training_session_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_training_participants_player_unique
  ON coach_training_participants(training_session_id, player_id)
  WHERE player_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS coach_training_participant_identities (
  training_participant_id  UUID NOT NULL,
  training_session_id      UUID NOT NULL,
  external_identity_id     UUID NOT NULL REFERENCES coach_external_identities(id) ON DELETE RESTRICT,
  provider                 TEXT NOT NULL CHECK (provider IN ('telegram', 'yclients', 'lpvolley')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (training_participant_id, external_identity_id),
  UNIQUE (training_session_id, external_identity_id),
  FOREIGN KEY (training_participant_id, training_session_id)
    REFERENCES coach_training_participants(id, training_session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS coach_external_sync_events (
  id                       BIGSERIAL PRIMARY KEY,
  provider                 TEXT NOT NULL CHECK (provider IN ('kotyara', 'yclients', 'telegram', 'import')),
  event_key                TEXT NOT NULL,
  payload_hash             TEXT NOT NULL,
  training_session_id      UUID REFERENCES coach_training_sessions(id) ON DELETE SET NULL,
  status                   TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'failed')),
  attempt_count            INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  error_text               TEXT NOT NULL DEFAULT '',
  received_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at             TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(btrim(event_key)) BETWEEN 1 AND 240),
  CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  UNIQUE (provider, event_key)
);

CREATE INDEX IF NOT EXISTS coach_training_sessions_timeline_idx
  ON coach_training_sessions(status, starts_at, id);
CREATE INDEX IF NOT EXISTS coach_training_sessions_source_idx
  ON coach_training_sessions(source, external_event_id);
CREATE INDEX IF NOT EXISTS coach_external_identities_resolution_idx
  ON coach_external_identities(resolution_status, provider, display_name);
CREATE INDEX IF NOT EXISTS coach_training_participants_session_idx
  ON coach_training_participants(training_session_id, display_name, id);
CREATE INDEX IF NOT EXISTS coach_training_participant_identities_identity_idx
  ON coach_training_participant_identities(external_identity_id, training_session_id);
CREATE INDEX IF NOT EXISTS coach_external_sync_events_session_idx
  ON coach_external_sync_events(training_session_id, updated_at DESC);

DROP TRIGGER IF EXISTS coach_training_sessions_updated_at ON coach_training_sessions;
CREATE TRIGGER coach_training_sessions_updated_at
  BEFORE UPDATE ON coach_training_sessions
  FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();

DROP TRIGGER IF EXISTS coach_external_identities_updated_at ON coach_external_identities;
CREATE TRIGGER coach_external_identities_updated_at
  BEFORE UPDATE ON coach_external_identities
  FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();

DROP TRIGGER IF EXISTS coach_training_participants_updated_at ON coach_training_participants;
CREATE TRIGGER coach_training_participants_updated_at
  BEFORE UPDATE ON coach_training_participants
  FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();

DROP TRIGGER IF EXISTS coach_external_sync_events_updated_at ON coach_external_sync_events;
CREATE TRIGGER coach_external_sync_events_updated_at
  BEFORE UPDATE ON coach_external_sync_events
  FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE coach_training_sessions TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE coach_external_identities TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_training_participants TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coach_training_participant_identities TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE coach_external_sync_events TO lpbvolley';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE coach_external_sync_events_id_seq TO lpbvolley';
  END IF;
END $$;

COMMIT;
