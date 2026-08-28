-- Play V3 работает только в Сургуте; новые площадки получают корректный default.
ALTER TABLE play_venues ALTER COLUMN city SET DEFAULT 'Сургут';
