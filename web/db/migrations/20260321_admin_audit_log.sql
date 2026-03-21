-- Admin audit log schema managed by migration only.
-- Run this migration before enabling admin audit endpoints.

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  before_state JSONB,
  after_state JSONB,
  source TEXT NOT NULL DEFAULT 'admin-panel'
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity
  ON admin_audit_log (entity_type, entity_id);
