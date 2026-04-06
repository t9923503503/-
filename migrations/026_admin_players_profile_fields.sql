-- 026: Extended admin player profile fields.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS height_cm INTEGER,
  ADD COLUMN IF NOT EXISTS weight_kg INTEGER,
  ADD COLUMN IF NOT EXISTS skill_level TEXT,
  ADD COLUMN IF NOT EXISTS preferred_position TEXT,
  ADD COLUMN IF NOT EXISTS mix_ready BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS telegram TEXT,
  ADD COLUMN IF NOT EXISTS admin_comment TEXT;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'players'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE players DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE players
  ADD CONSTRAINT players_status_check
  CHECK (status IN ('active', 'temporary', 'inactive', 'injured', 'vacation'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_skill_level_check'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT players_skill_level_check
      CHECK (skill_level IS NULL OR skill_level IN ('light', 'medium', 'advanced', 'pro'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_preferred_position_check'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT players_preferred_position_check
      CHECK (
        preferred_position IS NULL
        OR preferred_position IN ('attacker', 'defender', 'universal', 'setter', 'blocker')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_height_cm_check'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT players_height_cm_check
      CHECK (height_cm IS NULL OR height_cm BETWEEN 100 AND 250);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_weight_kg_check'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT players_weight_kg_check
      CHECK (weight_kg IS NULL OR weight_kg BETWEEN 30 AND 200);
  END IF;
END $$;
