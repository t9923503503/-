-- 077: Let an authenticated account bind VK ID through a browser-bound OAuth intent.

ALTER TABLE vk_auth_intents
  ADD COLUMN IF NOT EXISTS link_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS vk_auth_intents_link_user_id_idx
  ON vk_auth_intents(link_user_id)
  WHERE link_user_id IS NOT NULL;

