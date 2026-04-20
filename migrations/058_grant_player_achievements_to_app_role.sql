-- Allow app-side triggers/functions running under the application DB role
-- to record achievements during tournament_results inserts.
GRANT INSERT, SELECT ON TABLE public.player_achievements TO CURRENT_USER;
