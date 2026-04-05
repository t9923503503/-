-- Seed players for Thai "Мужчины / Новички" mode.
-- Apply: psql $DATABASE_URL -f db/seed_thai_mn_players.sql

WITH seed(name) AS (
  VALUES
    ('Салим'),
    ('Шелгачев А'),
    ('Когалымский'),
    ('Артиков'),
    ('Надымов Н'),
    ('Салмин М'),
    ('Соболев'),
    ('Пекшев'),
    ('Рогожкин А'),
    ('Гадаборшев'),
    ('Рукавишников'),
    ('Фатин'),
    ('Майлыбаев'),
    ('Паничкин'),
    ('Терехов'),
    ('Лебедев'),
    ('Никифоров'),
    ('Микуляк'),
    ('Жорик'),
    ('Андрей'),
    ('Привет'),
    ('Александр'),
    ('Президент'),
    ('Шерметов'),
    ('Пивин'),
    ('Смирнов'),
    ('Степанян'),
    ('Камалов'),
    ('Шперлинг'),
    ('Килатов'),
    ('Володя'),
    ('Грузин')
)
INSERT INTO players (id, name, gender, status, rating_m, rating_w, rating_mix, wins, total_pts)
SELECT gen_random_uuid(), seed.name, 'M', 'active', 0, 0, 0, 0, 0
FROM seed
WHERE NOT EXISTS (
  SELECT 1
  FROM players p
  WHERE lower(trim(p.name)) = lower(trim(seed.name))
    AND COALESCE(p.gender, 'M') = 'M'
);
