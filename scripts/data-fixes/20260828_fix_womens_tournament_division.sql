\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  tournament_name TEXT;
  tournament_status TEXT;
  tournament_division TEXT;
BEGIN
  SELECT name, status, division
    INTO tournament_name, tournament_status, tournament_division
    FROM tournaments
   WHERE id = '695d6e20-5d3f-4f51-86d1-f0999e74a090'::UUID
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NOTICE 'Known calendar tournament is absent; no production data repair is required';
    RETURN;
  END IF;

  IF tournament_name IS DISTINCT FROM 'Лютый женский рандом тай'
     OR tournament_status IS DISTINCT FROM 'finished' THEN
    RAISE EXCEPTION
      'Known calendar tournament no longer matches the reviewed record (name=%, status=%)',
      tournament_name,
      tournament_status;
  END IF;

  IF tournament_division IS NOT DISTINCT FROM 'Женский' THEN
    RAISE NOTICE 'Known calendar tournament division is already correct';
    RETURN;
  END IF;

  IF tournament_division IS DISTINCT FROM 'Мужской' THEN
    RAISE EXCEPTION
      'Known calendar tournament has an unexpected division: %',
      tournament_division;
  END IF;

  UPDATE tournaments
     SET division = 'Женский'
   WHERE id = '695d6e20-5d3f-4f51-86d1-f0999e74a090'::UUID;
END $$;

COMMIT;

SELECT id, name, status, division, date
  FROM tournaments
 WHERE id = '695d6e20-5d3f-4f51-86d1-f0999e74a090'::UUID;
