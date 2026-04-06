-- 027: Per-admin saved filter presets.

CREATE TABLE IF NOT EXISTS admin_filter_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id TEXT NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (actor_id, scope, name)
);

CREATE INDEX IF NOT EXISTS idx_admin_filter_presets_actor_scope
  ON admin_filter_presets(actor_id, scope, updated_at DESC);
