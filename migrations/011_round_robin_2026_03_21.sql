-- ============================================================
-- 011: Round Robin 21.03.2026 — HARD/ADVANCE/MEDIUM/LIGHT
-- ============================================================

-- ── 1. Турниры ───────────────────────────────────────────────
INSERT INTO tournaments (name, date, format, division, level, capacity, status, external_id)
VALUES
  ('Round Robin · HARD',    '2026-03-21', 'Round Robin', 'Мужской', 'hard',   30, 'finished', 'rr-20260321-hard-m'),
  ('Round Robin · HARD',    '2026-03-21', 'Round Robin', 'Женский', 'hard',   30, 'finished', 'rr-20260321-hard-w'),
  ('Round Robin · ADVANCE', '2026-03-21', 'Round Robin', 'Мужской', 'hard',   30, 'finished', 'rr-20260321-adv-m'),
  ('Round Robin · ADVANCE', '2026-03-21', 'Round Robin', 'Женский', 'hard',   30, 'finished', 'rr-20260321-adv-w'),
  ('Round Robin · MEDIUM',  '2026-03-21', 'Round Robin', 'Мужской', 'medium', 30, 'finished', 'rr-20260321-med-m'),
  ('Round Robin · MEDIUM',  '2026-03-21', 'Round Robin', 'Женский', 'medium', 30, 'finished', 'rr-20260321-med-w'),
  ('Round Robin · LIGHT',   '2026-03-21', 'Round Robin', 'Мужской', 'easy',   30, 'finished', 'rr-20260321-light-m'),
  ('Round Robin · LIGHT',   '2026-03-21', 'Round Robin', 'Женский', 'easy',   30, 'finished', 'rr-20260321-light-w')
ON CONFLICT (external_id) DO UPDATE SET status = 'finished';

-- ── 2. Игроки ────────────────────────────────────────────────
INSERT INTO players (name, gender, status) VALUES
  ('Файзулин',  'M', 'active'), ('Геннадий',  'M', 'active'),
  ('Лебедев',   'M', 'active'), ('Суриков',   'M', 'active'),
  ('Майлыбаев', 'M', 'active'), ('Анашкин',   'M', 'active'),
  ('Привет',    'M', 'active'), ('Шперлинг',  'M', 'active'),
  ('Жидков',    'M', 'active'), ('Смирнов',   'M', 'active'),
  ('Андрей',    'M', 'active'), ('Юшманов',   'M', 'active'),
  ('Мамедов',   'M', 'active'), ('Алик',      'M', 'active'),
  ('Обухов',    'M', 'active'), ('Шерметов',  'M', 'active'),
  ('Кузьмина',  'W', 'active'), ('Тимошенко', 'W', 'active'),
  ('Гуськова',  'W', 'active'), ('Elena',     'W', 'active'),
  ('Сабанцева', 'W', 'active'), ('Сурикова',  'W', 'active'),
  ('Настя НМ',  'W', 'active'), ('Базутова',  'W', 'active'),
  ('Кристина',  'W', 'active'), ('Лебедева',  'W', 'active'),
  ('Оксана',    'W', 'active'), ('Шперлинг',  'W', 'active'),
  ('Ирина',     'W', 'active'), ('Яковлева',  'W', 'active'),
  ('Margarita', 'W', 'active'), ('Мари',      'W', 'active')
ON CONFLICT (lower(trim(name)), gender) DO NOTHING;

-- ── 3. Результаты ────────────────────────────────────────────
-- HARD · Мужской
INSERT INTO tournament_results (tournament_id, player_id, place, wins, game_pts, gender, rating_type)
SELECT t.id, p.id, v.place, v.wins, v.wins, 'M', 'M'
FROM (VALUES
  ('Файзулин', 1, 7), ('Геннадий', 2, 5), ('Лебедев', 3, 2), ('Суриков', 4, 2)
) AS v(name, place, wins)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='M'
JOIN tournaments t ON t.external_id='rr-20260321-hard-m'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, wins=EXCLUDED.wins, game_pts=EXCLUDED.game_pts;

-- HARD · Женский
INSERT INTO tournament_results (tournament_id, player_id, place, wins, game_pts, gender, rating_type)
SELECT t.id, p.id, v.place, v.wins, v.wins, 'W', 'W'
FROM (VALUES
  ('Кузьмина', 1, 8), ('Тимошенко', 2, 4), ('Гуськова', 3, 3), ('Elena', 4, 1)
) AS v(name, place, wins)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='W'
JOIN tournaments t ON t.external_id='rr-20260321-hard-w'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, wins=EXCLUDED.wins, game_pts=EXCLUDED.game_pts;

-- ADVANCE · Мужской
INSERT INTO tournament_results (tournament_id, player_id, place, wins, game_pts, gender, rating_type)
SELECT t.id, p.id, v.place, v.wins, v.wins, 'M', 'M'
FROM (VALUES
  ('Майлыбаев', 1, 7), ('Анашкин', 2, 5), ('Привет', 3, 3), ('Шперлинг', 4, 1)
) AS v(name, place, wins)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='M'
JOIN tournaments t ON t.external_id='rr-20260321-adv-m'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, wins=EXCLUDED.wins, game_pts=EXCLUDED.game_pts;

-- ADVANCE · Женский
INSERT INTO tournament_results (tournament_id, player_id, place, wins, game_pts, gender, rating_type)
SELECT t.id, p.id, v.place, v.wins, v.wins, 'W', 'W'
FROM (VALUES
  ('Сабанцева', 1, 7), ('Сурикова', 2, 6), ('Настя НМ', 3, 2), ('Базутова', 4, 1)
) AS v(name, place, wins)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='W'
JOIN tournaments t ON t.external_id='rr-20260321-adv-w'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, wins=EXCLUDED.wins, game_pts=EXCLUDED.game_pts;

-- MEDIUM · Мужской
INSERT INTO tournament_results (tournament_id, player_id, place, wins, game_pts, gender, rating_type)
SELECT t.id, p.id, v.place, v.wins, v.wins, 'M', 'M'
FROM (VALUES
  ('Жидков', 1, 6), ('Смирнов', 2, 5), ('Андрей', 3, 4), ('Юшманов', 4, 3)
) AS v(name, place, wins)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='M'
JOIN tournaments t ON t.external_id='rr-20260321-med-m'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, wins=EXCLUDED.wins, game_pts=EXCLUDED.game_pts;

-- MEDIUM · Женский
INSERT INTO tournament_results (tournament_id, player_id, place, wins, game_pts, gender, rating_type)
SELECT t.id, p.id, v.place, v.wins, v.wins, 'W', 'W'
FROM (VALUES
  ('Кристина', 1, 8), ('Лебедева', 2, 6), ('Оксана', 3, 3), ('Шперлинг', 4, 0)
) AS v(name, place, wins)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='W'
JOIN tournaments t ON t.external_id='rr-20260321-med-w'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, wins=EXCLUDED.wins, game_pts=EXCLUDED.game_pts;

-- LIGHT · Мужской
INSERT INTO tournament_results (tournament_id, player_id, place, wins, game_pts, gender, rating_type)
SELECT t.id, p.id, v.place, v.wins, v.wins, 'M', 'M'
FROM (VALUES
  ('Мамедов', 1, 8), ('Алик', 2, 7), ('Обухов', 3, 3), ('Шерметов', 4, 2)
) AS v(name, place, wins)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='M'
JOIN tournaments t ON t.external_id='rr-20260321-light-m'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, wins=EXCLUDED.wins, game_pts=EXCLUDED.game_pts;

-- LIGHT · Женский
INSERT INTO tournament_results (tournament_id, player_id, place, wins, game_pts, gender, rating_type)
SELECT t.id, p.id, v.place, v.wins, v.wins, 'W', 'W'
FROM (VALUES
  ('Ирина', 1, 9), ('Яковлева', 2, 4), ('Margarita', 3, 3), ('Мари', 4, 3)
) AS v(name, place, wins)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='W'
JOIN tournaments t ON t.external_id='rr-20260321-light-w'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, wins=EXCLUDED.wins, game_pts=EXCLUDED.game_pts;

-- Проверка
SELECT t.name, t.division, count(tr.id) as results
FROM tournaments t
LEFT JOIN tournament_results tr ON tr.tournament_id = t.id
WHERE t.external_id LIKE 'rr-20260321-%'
GROUP BY t.id, t.name, t.division
ORDER BY t.name, t.division;
