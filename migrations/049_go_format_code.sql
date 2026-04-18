BEGIN;

INSERT INTO tournament_formats (code, name, description, settings_schema)
VALUES (
  'groups_olympic',
  'Groups + Olympic',
  'Bucketed groups plus Olympic playoff',
  '{}'::jsonb
)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  settings_schema = EXCLUDED.settings_schema;

COMMIT;
