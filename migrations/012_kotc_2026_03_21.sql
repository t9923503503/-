-- ============================================================
-- 012: Король площадки 21.03.2026 — HARD/MEDIUM/LIGHT
-- ============================================================
-- Очки = game_pts, Разница = diff, место по итогам = place

-- ── 1. Турниры ───────────────────────────────────────────────
INSERT INTO tournaments (name, date, format, division, level, capacity, status, external_id)
VALUES
  ('Король площадки · HARD',   '2026-03-21', 'King of the Court', 'Мужской', 'hard',   30, 'finished', 'kotc-20260321-hard-m'),
  ('Король площадки · MEDIUM', '2026-03-21', 'King of the Court', 'Мужской', 'medium', 30, 'finished', 'kotc-20260321-med-m'),
  ('Король площадки · LIGHT',  '2026-03-21', 'King of the Court', 'Мужской', 'easy',   30, 'finished', 'kotc-20260321-light-m'),
  ('Король площадки · HARD',   '2026-03-21', 'King of the Court', 'Женский', 'hard',   30, 'finished', 'kotc-20260321-hard-w'),
  ('Король площадки · MEDIUM', '2026-03-21', 'King of the Court', 'Женский', 'medium', 30, 'finished', 'kotc-20260321-med-w'),
  ('Король площадки · LIGHT',  '2026-03-21', 'King of the Court', 'Женский', 'easy',   30, 'finished', 'kotc-20260321-light-w')
ON CONFLICT (external_id) DO UPDATE SET status = 'finished';

-- ── 2. Игроки ────────────────────────────────────────────────
INSERT INTO players (name, gender, status) VALUES
  ('Яковлев',   'M', 'active'), ('Лебедев',   'M', 'active'),
  ('Терехов',   'M', 'active'), ('Юшманов',   'M', 'active'),
  ('Привет',    'M', 'active'), ('Шперлинг',  'M', 'active'),
  ('Кузнецов',  'M', 'active'), ('Обухов',    'M', 'active'),
  ('Андрей',    'M', 'active'), ('Бицадзе',   'M', 'active'),
  ('Шерметов',  'M', 'active'), ('Мамедов',   'M', 'active'),
  ('Стрекалова','W', 'active'), ('Файзулина', 'W', 'active'),
  ('Робак',     'W', 'active'), ('Гуськова',  'W', 'active'),
  ('Кузьмина',  'W', 'active'), ('Загребина', 'W', 'active'),
  ('Мишаткина', 'W', 'active'), ('Ложкина',   'W', 'active'),
  ('Тимошенко', 'W', 'active'), ('Урманшина', 'W', 'active'),
  ('Черемис',   'W', 'active'), ('Арефьева',  'W', 'active')
ON CONFLICT (lower(trim(name)), gender) DO NOTHING;

-- ── 3. Результаты ────────────────────────────────────────────

-- HARD · Мужской (place, game_pts, diff)
INSERT INTO tournament_results (tournament_id, player_id, place, game_pts, diff, gender, rating_type)
SELECT t.id, p.id, v.place, v.pts, v.diff, 'M', 'M'
FROM (VALUES
  ('Яковлев', 1,  9,  15),
  ('Лебедев', 2,  6,   5),
  ('Терехов', 3,  3,  -6),
  ('Юшманов', 4,  3, -14)
) AS v(name, place, pts, diff)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='M'
JOIN tournaments t ON t.external_id='kotc-20260321-hard-m'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, game_pts=EXCLUDED.game_pts, diff=EXCLUDED.diff;

-- MEDIUM · Мужской
INSERT INTO tournament_results (tournament_id, player_id, place, game_pts, diff, gender, rating_type)
SELECT t.id, p.id, v.place, v.pts, v.diff, 'M', 'M'
FROM (VALUES
  ('Привет',   1, 9,  23),
  ('Шперлинг', 2, 7,  13),
  ('Кузнецов', 3, 3, -13),
  ('Обухов',   4, 0, -23)
) AS v(name, place, pts, diff)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='M'
JOIN tournaments t ON t.external_id='kotc-20260321-med-m'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, game_pts=EXCLUDED.game_pts, diff=EXCLUDED.diff;

-- LIGHT · Мужской
INSERT INTO tournament_results (tournament_id, player_id, place, game_pts, diff, gender, rating_type)
SELECT t.id, p.id, v.place, v.pts, v.diff, 'M', 'M'
FROM (VALUES
  ('Андрей',   1, 7,   8),
  ('Бицадзе',  2, 7,   8),
  ('Шерметов', 3, 1,  -6),
  ('Мамедов',  4, 1, -10)
) AS v(name, place, pts, diff)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='M'
JOIN tournaments t ON t.external_id='kotc-20260321-light-m'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, game_pts=EXCLUDED.game_pts, diff=EXCLUDED.diff;

-- HARD · Женский
INSERT INTO tournament_results (tournament_id, player_id, place, game_pts, diff, gender, rating_type)
SELECT t.id, p.id, v.place, v.pts, v.diff, 'W', 'W'
FROM (VALUES
  ('Стрекалова', 1, 11,  28),
  ('Файзулина',  2,  6,  15),
  ('Робак',      3,  4,  -8),
  ('Гуськова',   4,  0, -35)
) AS v(name, place, pts, diff)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='W'
JOIN tournaments t ON t.external_id='kotc-20260321-hard-w'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, game_pts=EXCLUDED.game_pts, diff=EXCLUDED.diff;

-- MEDIUM · Женский
INSERT INTO tournament_results (tournament_id, player_id, place, game_pts, diff, gender, rating_type)
SELECT t.id, p.id, v.place, v.pts, v.diff, 'W', 'W'
FROM (VALUES
  ('Кузьмина',  1, 7,  9),
  ('Загребина', 2, 5, -5),
  ('Мишаткина', 3, 4,  1),
  ('Ложкина',   4, 3, -5)
) AS v(name, place, pts, diff)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='W'
JOIN tournaments t ON t.external_id='kotc-20260321-med-w'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, game_pts=EXCLUDED.game_pts, diff=EXCLUDED.diff;

-- LIGHT · Женский
INSERT INTO tournament_results (tournament_id, player_id, place, game_pts, diff, gender, rating_type)
SELECT t.id, p.id, v.place, v.pts, v.diff, 'W', 'W'
FROM (VALUES
  ('Тимошенко', 1, 6,  10),
  ('Урманшина', 2, 6,   8),
  ('Черемис',   3, 4,   6),
  ('Арефьева',  4, 0, -24)
) AS v(name, place, pts, diff)
JOIN players p ON lower(trim(p.name))=lower(v.name) AND p.gender='W'
JOIN tournaments t ON t.external_id='kotc-20260321-light-w'
ON CONFLICT (tournament_id, player_id) DO UPDATE
  SET place=EXCLUDED.place, game_pts=EXCLUDED.game_pts, diff=EXCLUDED.diff;

-- Проверка
SELECT t.name, t.division, count(tr.id) as results
FROM tournaments t
LEFT JOIN tournament_results tr ON tr.tournament_id = t.id
WHERE t.external_id LIKE 'kotc-20260321-%'
GROUP BY t.id, t.name, t.division
ORDER BY t.name, t.division;
