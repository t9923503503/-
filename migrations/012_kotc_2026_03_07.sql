-- ============================================================
-- 012: Король площадки 07.03.2026 — HARD/MEDIUM/LITE
-- ============================================================
-- Очки = game_pts, место по итогам = place

-- ── 1. Турниры ───────────────────────────────────────────────
INSERT INTO tournaments (name, date, format, division, level, capacity, status, external_id)
VALUES
  ('Король площадки · HARD',   '2026-03-07', 'King of the Court', 'Мужской', 'hard',   30, 'finished', 'kotc-20260307-hard-m'),
  ('Король площадки · HARD',   '2026-03-07', 'King of the Court', 'Женский', 'hard',   30, 'finished', 'kotc-20260307-hard-w'),
  ('Король площадки · MEDIUM', '2026-03-07', 'King of the Court', 'Мужской', 'medium', 30, 'finished', 'kotc-20260307-med-m'),
  ('Король площадки · MEDIUM', '2026-03-07', 'King of the Court', 'Женский', 'medium', 30, 'finished', 'kotc-20260307-med-w'),
  ('Король площадки · LITE',   '2026-03-07', 'King of the Court', 'Мужской', 'easy',   30, 'finished', 'kotc-20260307-lite-m'),
  ('Король площадки · LITE',   '2026-03-07', 'King of the Court', 'Женский', 'easy',   30, 'finished', 'kotc-20260307-lite-w')
ON CONFLICT (external_id) DO UPDATE SET status = 'finished';

-- ── 2. Игроки ────────────────────────────────────────────────
INSERT INTO players (name, gender, status) VALUES
  ('Иванов',      'M', 'active'),
  ('Лебедев',     'M', 'active'),
  ('Соболев',     'M', 'active'),
  ('Яковлев',     'M', 'active'),
  ('Анашкин',     'M', 'active'),
  ('Жидков',      'M', 'active'),
  ('Шперлинг',    'M', 'active'),
  ('Куанбеков',   'M', 'active'),
  ('Привет',      'M', 'active'),
  ('Обухов',      'M', 'active'),
  ('Алик',        'M', 'active'),
  ('Юшманов',     'M', 'active'),
  ('Грузин',      'M', 'active'),
  ('Камалов',     'M', 'active'),
  ('Сайдуллин',   'M', 'active'),
  ('Кузьмина',    'W', 'active'),
  ('Сайдуллина',  'W', 'active'),
  ('Черемис В',   'W', 'active'),
  ('Микишева',    'W', 'active'),
  ('Носкова',     'W', 'active'),
  ('Арефьева',    'W', 'active'),
  ('Маша Привет', 'W', 'active'),
  ('Базутова',    'W', 'active'),
  ('Настя НМ',    'W', 'active'),
  ('Сабанцева',   'W', 'active'),
  ('Шерметова',   'W', 'active'),
  ('Лебедева',    'W', 'active'),
  ('Яковлева',    'W', 'active'),
  ('Маргарита',   'W', 'active'),
  ('Шперлинг',    'W', 'active')
ON CONFLICT (lower(trim(name)), gender) DO NOTHING;

-- ── 3. Результаты ────────────────────────────────────────────

-- HARD · Мужской
INSERT INTO tournament_results (tournament_id, player_id, place, game_pts, gender, rating_type)
SELECT t.id, p.id, v.place, v.pts, 'M', 'M'
FROM (VALUES
  ('Иванов',  1, 28),
  ('Лебедев', 2, 16),
  ('Соболев', 3, 16),
  ('Яковлев', 4, 15),
  ('Анашкин', 5, 11)
) AS v(name, place, pts)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='M'
JOIN tournaments t ON t.external_id='kotc-20260307-hard-m'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, game_pts=EXCLUDED.game_pts;

-- HARD · Женский
INSERT INTO tournament_results (tournament_id, player_id, place, game_pts, gender, rating_type)
SELECT t.id, p.id, v.place, v.pts, 'W', 'W'
FROM (VALUES
  ('Кузьмина',   1, 28),
  ('Сайдуллина', 2, 25),
  ('Черемис В',  3, 16),
  ('Микишева',   4, 13),
  ('Носкова',    5,  4)
) AS v(name, place, pts)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='W'
JOIN tournaments t ON t.external_id='kotc-20260307-hard-w'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, game_pts=EXCLUDED.game_pts;

-- MEDIUM · Мужской
INSERT INTO tournament_results (tournament_id, player_id, place, game_pts, gender, rating_type)
SELECT t.id, p.id, v.place, v.pts, 'M', 'M'
FROM (VALUES
  ('Жидков',    1, 26),
  ('Шперлинг',  2, 21),
  ('Куанбеков', 3, 19),
  ('Привет',    4, 15),
  ('Обухов',    5,  7)
) AS v(name, place, pts)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='M'
JOIN tournaments t ON t.external_id='kotc-20260307-med-m'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, game_pts=EXCLUDED.game_pts;

-- MEDIUM · Женский
INSERT INTO tournament_results (tournament_id, player_id, place, game_pts, gender, rating_type)
SELECT t.id, p.id, v.place, v.pts, 'W', 'W'
FROM (VALUES
  ('Арефьева',   1, 23),
  ('Маша Привет',2, 19),
  ('Базутова',   3, 17),
  ('Настя НМ',   4, 16),
  ('Сабанцева',  5, 13)
) AS v(name, place, pts)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='W'
JOIN tournaments t ON t.external_id='kotc-20260307-med-w'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, game_pts=EXCLUDED.game_pts;

-- LITE · Мужской
INSERT INTO tournament_results (tournament_id, player_id, place, game_pts, gender, rating_type)
SELECT t.id, p.id, v.place, v.pts, 'M', 'M'
FROM (VALUES
  ('Алик',      1, 22),
  ('Юшманов',   2, 21),
  ('Грузин',    3, 16),
  ('Камалов',   4, 10),
  ('Сайдуллин', 5,  1)
) AS v(name, place, pts)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='M'
JOIN tournaments t ON t.external_id='kotc-20260307-lite-m'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, game_pts=EXCLUDED.game_pts;

-- LITE · Женский
INSERT INTO tournament_results (tournament_id, player_id, place, game_pts, gender, rating_type)
SELECT t.id, p.id, v.place, v.pts, 'W', 'W'
FROM (VALUES
  ('Шерметова', 1, 29),
  ('Лебедева',  2, 14),
  ('Яковлева',  3, 12),
  ('Маргарита', 4,  8),
  ('Шперлинг',  5,  7)
) AS v(name, place, pts)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='W'
JOIN tournaments t ON t.external_id='kotc-20260307-lite-w'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, game_pts=EXCLUDED.game_pts;

-- Проверка
SELECT t.name, t.division, count(tr.id) as results
FROM tournaments t
LEFT JOIN tournament_results tr ON tr.tournament_id = t.id
WHERE t.external_id LIKE 'kotc-20260307-%'
GROUP BY t.id, t.name, t.division
ORDER BY t.name, t.division;
