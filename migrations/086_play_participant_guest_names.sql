-- 086: allow an organizer to record ad-hoc guests in an ordinary game roster.

ALTER TABLE play_post_participants
  ADD COLUMN IF NOT EXISTS guest_name TEXT;

CREATE INDEX IF NOT EXISTS play_participants_post_guest_name_idx
  ON play_post_participants(post_id, lower(guest_name))
  WHERE guest_name IS NOT NULL;
