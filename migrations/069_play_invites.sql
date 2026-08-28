-- 069: Game invites (TZ-production-play-v3 §1.5)

CREATE TABLE IF NOT EXISTS play_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID NOT NULL REFERENCES play_posts(id) ON DELETE CASCADE,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'sent'
               CHECK (status IN ('sent', 'accepted', 'declined', 'expired')),
  is_mass      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE (post_id, to_user_id)
);

-- One mass-invite wave per game (TZ §4: 1 раз на игру) is enforced by
-- massPlayInvites while the parent play_posts row is locked FOR UPDATE.
-- A UNIQUE(post_id) partial index is invalid here: one wave legitimately
-- contains up to 20 invite rows.
DROP INDEX IF EXISTS play_invites_mass_once_idx;

CREATE INDEX IF NOT EXISTS play_invites_inbox_idx
  ON play_invites(to_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS play_invites_post_idx
  ON play_invites(post_id, status);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley'
  ) THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE play_invites TO lpbvolley';
  END IF;
END $$;
