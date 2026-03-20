-- Fix migration: correct roles (anon/authenticated), pgjwt already installed
-- Apply: sudo -u postgres psql -d lpbvolley -f /tmp/fix_migration.sql

ALTER DATABASE lpbvolley SET "app.settings.jwt_secret" TO 'lpbvolley-super-secret-jwt-key-2026';

DROP FUNCTION IF EXISTS approve_player_request(UUID);

GRANT ALL ON ALL TABLES IN SCHEMA public    TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- RLS player_requests
ALTER TABLE player_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_insert  ON player_requests;
DROP POLICY IF EXISTS admin_all    ON player_requests;
DROP POLICY IF EXISTS auth_all     ON player_requests;
CREATE POLICY anon_insert ON player_requests FOR INSERT TO anon         WITH CHECK (true);
CREATE POLICY auth_all    ON player_requests FOR ALL   TO authenticated USING (true);

-- RLS players
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read    ON players;
DROP POLICY IF EXISTS player_self  ON players;
DROP POLICY IF EXISTS player_update ON players;
DROP POLICY IF EXISTS admin_all    ON players;
DROP POLICY IF EXISTS auth_read    ON players;
DROP POLICY IF EXISTS auth_update  ON players;
CREATE POLICY anon_read   ON players FOR SELECT TO anon         USING (status = 'active');
CREATE POLICY auth_read   ON players FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_update ON players FOR UPDATE TO authenticated
  USING      (id::text = current_setting('request.jwt.claims.sub', true))
  WITH CHECK (id::text = current_setting('request.jwt.claims.sub', true));

-- RLS admins
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON admins;
DROP POLICY IF EXISTS auth_all  ON admins;
CREATE POLICY auth_all ON admins FOR ALL TO authenticated USING (true);

-- RLS remaining tables
ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read ON tournament_participants;
DROP POLICY IF EXISTS auth_all  ON tournament_participants;
CREATE POLICY anon_read ON tournament_participants FOR SELECT TO anon         USING (true);
CREATE POLICY auth_all  ON tournament_participants FOR ALL   TO authenticated USING (true);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read ON matches;
DROP POLICY IF EXISTS auth_all  ON matches;
CREATE POLICY anon_read ON matches FOR SELECT TO anon         USING (true);
CREATE POLICY auth_all  ON matches FOR ALL   TO authenticated USING (true);

ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read ON match_players;
DROP POLICY IF EXISTS auth_all  ON match_players;
CREATE POLICY anon_read ON match_players FOR SELECT TO anon         USING (true);
CREATE POLICY auth_all  ON match_players FOR ALL   TO authenticated USING (true);

ALTER TABLE rating_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read ON rating_history;
DROP POLICY IF EXISTS auth_all  ON rating_history;
CREATE POLICY anon_read ON rating_history FOR SELECT TO anon         USING (true);
CREATE POLICY auth_all  ON rating_history FOR ALL   TO authenticated USING (true);

ALTER TABLE tournament_formats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read ON tournament_formats;
DROP POLICY IF EXISTS auth_all  ON tournament_formats;
CREATE POLICY anon_read ON tournament_formats FOR SELECT TO anon         USING (true);
CREATE POLICY auth_all  ON tournament_formats FOR ALL   TO authenticated USING (true);

-- Functions

CREATE OR REPLACE FUNCTION register_player(
  p_name TEXT, p_email TEXT, p_password TEXT, p_gender TEXT
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'Name too short' USING ERRCODE = '22023';
  END IF;
  IF p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email format' USING ERRCODE = '22023';
  END IF;
  IF length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters' USING ERRCODE = '22023';
  END IF;
  IF p_gender NOT IN ('M', 'W') THEN
    RAISE EXCEPTION 'Gender must be M or W' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM players WHERE email = lower(p_email)) THEN
    RAISE EXCEPTION 'Email already registered' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM player_requests WHERE email = lower(p_email) AND status NOT IN ('rejected')) THEN
    RAISE EXCEPTION 'Request already pending' USING ERRCODE = '23505';
  END IF;
  INSERT INTO player_requests (name, email, password_hash, gender, status, created_at)
  VALUES (trim(p_name), lower(p_email), crypt(p_password, gen_salt('bf', 10)), p_gender, 'pending', now());
  RETURN json_build_object('ok', true, 'message', 'Заявка отправлена. Ожидайте одобрения администратора.');
END;
$$;

CREATE OR REPLACE FUNCTION approve_player_request(p_request_id UUID)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  req player_requests;
BEGIN
  SELECT * INTO req FROM player_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF req.status != 'pending' THEN
    RAISE EXCEPTION 'Already processed: %', req.status;
  END IF;
  INSERT INTO players (name, email, password_hash, gender, status, "addedAt")
  VALUES (req.name, req.email, req.password_hash, req.gender, 'active', now()::date)
  ON CONFLICT (email) DO UPDATE
    SET status = 'active', password_hash = EXCLUDED.password_hash, name = EXCLUDED.name;
  UPDATE player_requests SET status = 'approved' WHERE id = p_request_id;
  RETURN json_build_object('ok', true, 'name', req.name, 'email', req.email);
END;
$$;

CREATE OR REPLACE FUNCTION reject_player_request(p_request_id UUID, p_reason TEXT DEFAULT '')
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE player_requests SET status = 'rejected', notes = p_reason
  WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already processed'; END IF;
  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION player_login(p_email TEXT, p_password TEXT)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec    players;
  tok    TEXT;
  secret TEXT;
BEGIN
  SELECT * INTO rec FROM players
  WHERE email = lower(p_email)
    AND password_hash = crypt(p_password, password_hash)
    AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid email or password' USING ERRCODE = 'invalid_password';
  END IF;
  secret := current_setting('app.settings.jwt_secret');
  SELECT sign(row_to_json(r)::json, secret) INTO tok
  FROM (
    SELECT 'authenticated' AS role,
           rec.id::text    AS sub,
           rec.name        AS name,
           rec.gender      AS gender,
           false           AS is_admin,
           extract(epoch FROM now() + interval '7 days')::int AS exp
  ) r;
  RETURN json_build_object('token', tok, 'id', rec.id, 'name', rec.name, 'gender', rec.gender);
END;
$$;

CREATE OR REPLACE FUNCTION admin_login(p_email TEXT, p_password TEXT)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec    admins;
  tok    TEXT;
  secret TEXT;
BEGIN
  SELECT * INTO rec FROM admins
  WHERE email = lower(p_email)
    AND password_hash = crypt(p_password, password_hash);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid credentials' USING ERRCODE = 'invalid_password';
  END IF;
  secret := current_setting('app.settings.jwt_secret');
  SELECT sign(row_to_json(r)::json, secret) INTO tok
  FROM (
    SELECT 'authenticated' AS role,
           rec.id::text    AS sub,
           true            AS is_admin,
           extract(epoch FROM now() + interval '8 hours')::int AS exp
  ) r;
  RETURN json_build_object('token', tok);
END;
$$;

CREATE OR REPLACE FUNCTION get_pending_count()
RETURNS json LANGUAGE sql SECURITY DEFINER AS $$
  SELECT json_build_object('count', count(*)) FROM player_requests WHERE status = 'pending';
$$;

CREATE OR REPLACE FUNCTION pre_request() RETURNS void LANGUAGE plpgsql AS $$
BEGIN NULL; END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION pre_request()                            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION register_player(TEXT,TEXT,TEXT,TEXT)     TO anon;
GRANT EXECUTE ON FUNCTION player_login(TEXT,TEXT)                  TO anon;
GRANT EXECUTE ON FUNCTION admin_login(TEXT,TEXT)                   TO anon;
GRANT EXECUTE ON FUNCTION get_pending_count()                      TO anon;
GRANT EXECUTE ON FUNCTION approve_player_request(UUID)             TO authenticated;
GRANT EXECUTE ON FUNCTION reject_player_request(UUID,TEXT)         TO authenticated;
GRANT INSERT ON player_requests TO anon;
GRANT SELECT ON players, tournaments, tournament_formats,
  tournament_participants, matches, match_players, rating_history TO anon;

-- First admin (change password after!)
INSERT INTO admins (email, password_hash)
VALUES ('admin@lpbvolley.ru', crypt('LpbAdmin2026!', gen_salt('bf', 12)))
ON CONFLICT (email) DO NOTHING;

SELECT 'Fix migration OK' AS result,
       (SELECT count(*) FROM admins) AS admins_count,
       (SELECT count(*) FROM tournament_formats) AS formats_count;
