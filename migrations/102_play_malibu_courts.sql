-- Court choices for the Telegram create-session flow.
-- The original indoor venue remains the "any indoor court" option so old events keep their label.

INSERT INTO play_venues (id, name, city, address, active)
VALUES (
  '424d0271-e23a-436b-938d-b71363df7c02'::uuid,
  'Малибу внутри',
  'Сургут',
  'Сити Молл, Югорский тракт, 38',
  true
)
ON CONFLICT DO NOTHING;

UPDATE play_venues
SET active = true,
    updated_at = now()
WHERE id = '424d0271-e23a-436b-938d-b71363df7c02'::uuid;

WITH base AS (
  SELECT city, address, latitude, longitude, created_by_organizer_id
  FROM play_venues
  WHERE id = '424d0271-e23a-436b-938d-b71363df7c02'::uuid
), choices(name) AS (
  VALUES
    ('Малибу внутри · корт 1'),
    ('Малибу внутри · корт 2'),
    ('Малибу внутри · корт 3'),
    ('Малибу внутри · корт 4'),
    ('Малибу на улице · корт 7'),
    ('Малибу на улице · корт 8'),
    ('Малибу на улице · корт 9')
)
INSERT INTO play_venues (
  name,
  city,
  address,
  latitude,
  longitude,
  active,
  created_by_organizer_id
)
SELECT
  choices.name,
  base.city,
  base.address,
  base.latitude,
  base.longitude,
  true,
  base.created_by_organizer_id
FROM base
CROSS JOIN choices
ON CONFLICT (city, name, address) DO UPDATE
SET active = true,
    updated_at = now();
