-- 088: LP Coach foundation built on the canonical players registry.
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS coach_athlete_profiles (
  player_id          UUID PRIMARY KEY REFERENCES players(id) ON DELETE RESTRICT,
  level_code         TEXT NOT NULL DEFAULT 'medium'
                     CHECK (level_code IN ('light', 'medium', 'hard')),
  status             TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'paused', 'injured', 'archived')),
  joined_at          DATE NOT NULL DEFAULT CURRENT_DATE,
  goals              TEXT NOT NULL DEFAULT '',
  limitations        TEXT NOT NULL DEFAULT '',
  created_by_actor   TEXT NOT NULL,
  archived_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'archived') = (archived_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS coach_skills (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  parent_id          UUID REFERENCES coach_skills(id) ON DELETE RESTRICT,
  description        TEXT NOT NULL DEFAULT '',
  sort_order         INTEGER NOT NULL DEFAULT 0,
  archived_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (code ~ '^[a-z0-9][a-z0-9._-]*$')
);

CREATE TABLE IF NOT EXISTS coach_skill_evaluations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id          UUID NOT NULL REFERENCES coach_athlete_profiles(player_id) ON DELETE RESTRICT,
  skill_id           UUID NOT NULL REFERENCES coach_skills(id) ON DELETE RESTRICT,
  score              SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  confidence         NUMERIC(4,3) NOT NULL DEFAULT 0.750
                     CHECK (confidence BETWEEN 0 AND 1),
  source             TEXT NOT NULL DEFAULT 'coach'
                     CHECK (source IN ('coach', 'challenge', 'video_ai', 'ai_assistant', 'import')),
  coach_comment      TEXT NOT NULL DEFAULT '',
  evaluated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  evaluated_by_actor TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coach_issues (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id           UUID REFERENCES coach_skills(id) ON DELETE RESTRICT,
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  archived_at        TIMESTAMPTZ,
  created_by_actor   TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(btrim(title)) BETWEEN 3 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_issues_skill_title_unique
  ON coach_issues (COALESCE(skill_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(title)))
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS coach_athlete_issues (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id          UUID NOT NULL REFERENCES coach_athlete_profiles(player_id) ON DELETE RESTRICT,
  issue_id           UUID NOT NULL REFERENCES coach_issues(id) ON DELETE RESTRICT,
  priority           SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status             TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('suggested', 'active', 'improving', 'monitoring', 'resolved', 'archived')),
  source             TEXT NOT NULL DEFAULT 'coach'
                     CHECK (source IN ('coach', 'challenge', 'video_ai', 'ai_assistant', 'import')),
  confidence         NUMERIC(4,3) NOT NULL DEFAULT 0.750
                     CHECK (confidence BETWEEN 0 AND 1),
  coach_comment      TEXT NOT NULL DEFAULT '',
  detected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at        TIMESTAMPTZ,
  last_worked_at     TIMESTAMPTZ,
  created_by_actor   TEXT NOT NULL,
  updated_by_actor   TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_athlete_issues_one_open_unique
  ON coach_athlete_issues(player_id, issue_id)
  WHERE status NOT IN ('resolved', 'archived');

CREATE TABLE IF NOT EXISTS coach_athlete_issue_history (
  id                 BIGSERIAL PRIMARY KEY,
  athlete_issue_id   UUID NOT NULL REFERENCES coach_athlete_issues(id) ON DELETE CASCADE,
  action             TEXT NOT NULL
                     CHECK (action IN ('created', 'status_changed', 'priority_changed', 'comment_changed', 'worked')),
  before_state       JSONB,
  after_state        JSONB,
  actor_id           TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_athletes_status_idx
  ON coach_athlete_profiles(status, level_code, joined_at DESC);
CREATE INDEX IF NOT EXISTS coach_skill_evaluations_player_idx
  ON coach_skill_evaluations(player_id, evaluated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS coach_skill_evaluations_skill_idx
  ON coach_skill_evaluations(skill_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS coach_athlete_issues_player_idx
  ON coach_athlete_issues(player_id, status, priority DESC, detected_at DESC);
CREATE INDEX IF NOT EXISTS coach_issue_history_issue_idx
  ON coach_athlete_issue_history(athlete_issue_id, created_at DESC);

CREATE OR REPLACE FUNCTION coach_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coach_athlete_profiles_updated_at ON coach_athlete_profiles;
CREATE TRIGGER coach_athlete_profiles_updated_at
  BEFORE UPDATE ON coach_athlete_profiles
  FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();

DROP TRIGGER IF EXISTS coach_skills_updated_at ON coach_skills;
CREATE TRIGGER coach_skills_updated_at
  BEFORE UPDATE ON coach_skills
  FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();

DROP TRIGGER IF EXISTS coach_issues_updated_at ON coach_issues;
CREATE TRIGGER coach_issues_updated_at
  BEFORE UPDATE ON coach_issues
  FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();

DROP TRIGGER IF EXISTS coach_athlete_issues_updated_at ON coach_athlete_issues;
CREATE TRIGGER coach_athlete_issues_updated_at
  BEFORE UPDATE ON coach_athlete_issues
  FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();

INSERT INTO coach_skills (code, name, sort_order)
VALUES
  ('reception', 'Приём', 10),
  ('setting', 'Передача', 20),
  ('attack', 'Атака', 30),
  ('serve', 'Подача', 40),
  ('defense', 'Защита', 50),
  ('block', 'Блок', 60),
  ('movement', 'Движение', 70),
  ('physical', 'Физика', 80),
  ('tactics', 'Тактика', 90),
  ('decisions', 'Психология и решения', 100)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, archived_at = NULL;

WITH seed(code, name, parent_code, sort_order) AS (
  VALUES
    ('reception.stance', 'Стойка', 'reception', 11),
    ('reception.movement', 'Перемещение', 'reception', 12),
    ('reception.platform', 'Платформа', 'reception', 13),
    ('reception.front_contact', 'Контакт перед корпусом', 'reception', 14),
    ('reception.short', 'Короткая подача', 'reception', 15),
    ('reception.deep', 'Глубокая подача', 'reception', 16),
    ('reception.trajectory', 'Чтение траектории', 'reception', 17),
    ('reception.direction', 'Контроль направления', 'reception', 18),
    ('setting.under_ball', 'Выход под мяч', 'setting', 21),
    ('setting.footwork', 'Работа ног', 'setting', 22),
    ('setting.overhead', 'Передача сверху', 'setting', 23),
    ('setting.forearm', 'Передача снизу', 'setting', 24),
    ('setting.stability', 'Стабильность', 'setting', 25),
    ('setting.height', 'Высота передачи', 'setting', 26),
    ('setting.after_move', 'Передача после движения', 'setting', 27),
    ('setting.wind', 'Передача в ветер', 'setting', 28),
    ('attack.approach', 'Разбег', 'attack', 31),
    ('attack.last_steps', 'Последние шаги', 'attack', 32),
    ('attack.jump', 'Прыжок', 'attack', 33),
    ('attack.timing', 'Тайминг', 'attack', 34),
    ('attack.contact_point', 'Точка удара', 'attack', 35),
    ('attack.arm', 'Ударная рука', 'attack', 36),
    ('attack.wrist', 'Кисть', 'attack', 37),
    ('attack.line', 'Линия', 'attack', 38),
    ('attack.diagonal', 'Диагональ', 'attack', 39),
    ('attack.cut', 'Cut shot', 'attack', 40),
    ('attack.roll', 'Roll shot', 'attack', 41),
    ('serve.stability', 'Стабильность подачи', 'serve', 42),
    ('serve.direction', 'Подача в зоны', 'serve', 43),
    ('defense.position', 'Защитная позиция', 'defense', 51),
    ('defense.reading', 'Чтение атаки', 'defense', 52),
    ('block.position', 'Позиция блока', 'block', 61),
    ('block.timing', 'Тайминг блока', 'block', 62),
    ('movement.start', 'Стартовое движение', 'movement', 71),
    ('movement.stop', 'Остановка под мячом', 'movement', 72),
    ('tactics.choice', 'Выбор решения', 'tactics', 91),
    ('decisions.confidence', 'Уверенность в решении', 'decisions', 101)
)
INSERT INTO coach_skills (code, name, parent_id, sort_order)
SELECT seed.code, seed.name, parent.id, seed.sort_order
FROM seed
JOIN coach_skills parent ON parent.code = seed.parent_code
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id,
    sort_order = EXCLUDED.sort_order,
    archived_at = NULL;

CREATE OR REPLACE VIEW coach_current_skill_evaluations AS
SELECT DISTINCT ON (evaluation.player_id, evaluation.skill_id)
  evaluation.id,
  evaluation.player_id,
  evaluation.skill_id,
  evaluation.score,
  evaluation.confidence,
  evaluation.source,
  evaluation.coach_comment,
  evaluation.evaluated_at,
  evaluation.evaluated_by_actor,
  evaluation.created_at
FROM coach_skill_evaluations evaluation
ORDER BY evaluation.player_id, evaluation.skill_id, evaluation.evaluated_at DESC, evaluation.id DESC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE coach_athlete_profiles TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE coach_skills TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE coach_skill_evaluations TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE coach_issues TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE coach_athlete_issues TO lpbvolley';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE coach_athlete_issue_history TO lpbvolley';
    EXECUTE 'GRANT SELECT ON TABLE coach_current_skill_evaluations TO lpbvolley';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE coach_athlete_issue_history_id_seq TO lpbvolley';
  END IF;
END $$;

COMMIT;
