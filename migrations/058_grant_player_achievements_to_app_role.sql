-- Allow app-side triggers/functions running under the application DB role
-- to record achievements during tournament_results inserts.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lpbvolley') THEN
    EXECUTE 'GRANT INSERT, SELECT ON TABLE public.player_achievements TO lpbvolley';
  ELSE
    RAISE NOTICE 'Role lpbvolley does not exist, skipping player_achievements grant';
  END IF;
END $$;
