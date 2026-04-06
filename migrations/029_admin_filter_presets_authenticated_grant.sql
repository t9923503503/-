-- 029: Allow the PostgREST admin JWT role to use saved admin filter presets.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin_filter_presets TO authenticated;

NOTIFY pgrst, 'reload schema';
