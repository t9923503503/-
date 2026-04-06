-- 028: Admin players refresh PostgREST/runtime grants and schema reload.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin_filter_presets TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE players TO lpbvolley;

NOTIFY pgrst, 'reload schema';
