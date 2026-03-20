-- =============================================================================
-- PLATFORM MIGRATION: Email Registration + Admin Panel + Extensible Tournaments
-- Server: 157.22.173.248  DB: lpbvolley
-- Apply: sudo -u postgres psql -d lpbvolley -f /tmp/platform_migration.sql
-- =============================================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgjwt;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Roles for PostgREST ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
    GRANT anon TO authenticator;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'player') THEN
    CREATE ROLE player NOLOGIN;
    GRANT player TO authenticator;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'admin') THEN
    CREATE ROLE admin NOLOGIN;
    GRANT admin TO authenticator;
  END IF;
END $$;

-- =============================================================================
-- PLAYERS: add email, password_hash, status
-- =============================================================================
ALTER TABLE players ADD COLUMN IF NOT EXISTS email         TEXT UNIQUE;
ALTER TABLE players ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS status        TEXT DEFAULT 'active';
  -- status: active | pending | banned

-- Mark existing players as active (they were already in the system)
UPDATE players SET status = 'active' WHERE status IS NULL OR status = 'pending';

-- =============================================================================
-- ADMINS
-- =============================================================================
CREATE TABLE IF NOT EXISTS admins (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,  -- crypt(password, gen_salt('bf'))
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- PLAYER REQUESTS: registration queue
-- =============================================================================
ALTER TABLE player_requests ADD COLUMN IF NOT EXISTS email         TEXT;
ALTER TABLE player_requests ADD COLUMN IF NOT EXISTS password_hash TEXT;  -- bcrypt hash stored at registration
ALTER TABLE player_requests ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ DEFAULT now();
ALTER TABLE player_requests ADD COLUMN IF NOT EXISTS notes         TEXT;
-- status: pending | approved | rejected  (column already exists from old migration)

-- =============================================================================
-- TOURNAMENT FORMATS REGISTRY
-- Allows adding new formats (KotC, IPT, Classic, Swiss, DoubleElim, etc.)
-- without changing the schema — just insert a new row here.
-- =============================================================================
CREATE TABLE IF NOT EXISTS tournament_formats (
  code        TEXT PRIMARY KEY,  -- 'kotc' | 'ipt_mixed' | 'classic' | 'swiss' | 'double_elim'
  name        TEXT NOT NULL,
  description TEXT,
  -- JSON schema describing required fields for settings JSONB in tournaments
  -- (documentation only, not enforced at DB level)
  settings_schema JSONB DEFAULT '{}'
);

INSERT INTO tournament_formats (code, name, description) VALUES
  ('kotc',        'King of the Court',  'Rotating partners, individual scoring'),
  ('ipt_mixed',   'IPT Mixed',          'Individual Point Tracker, mixed gender, rotating pairs'),
  ('classic',     'Классика',           'Round-robin groups + single elimination playoff'),
  ('swiss',       'Швейцарская',        'Swiss-system pairing, no elimination'),
  ('double_elim', 'Double Elimination', 'Winners + Losers bracket')
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- TOURNAMENTS: add JSONB settings for format-specific config
-- =============================================================================
-- settings JSONB allows any format to store its own fields:
-- kotc:        {"courts":4, "points_to_win":15, "sets":1}
-- ipt_mixed:   {"courts":2, "rounds":6, "gender_balance":true}
-- classic:     {"groups":4, "teams_per_group":4, "sets":3}
-- swiss:       {"rounds":7}
-- double_elim: {"sets_winners":3, "sets_losers":1}
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS format_code TEXT REFERENCES tournament_formats(code);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS settings    JSONB DEFAULT '{}';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS max_players INT;

-- =============================================================================
-- TOURNAMENT PARTICIPANTS: player ↔ tournament (all formats)
-- =============================================================================
CREATE TABLE IF NOT EXISTS tournament_participants (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID        NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id     UUID        NOT NULL REFERENCES players(id),
  status        TEXT        DEFAULT 'registered',
  -- status: registered | confirmed | waitlist | disqualified
  looking_for_partner BOOLEAN DEFAULT false,
  registered_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, player_id)
);

-- =============================================================================
-- MATCHES: format-agnostic, stores any stage of any format
-- =============================================================================
CREATE TABLE IF NOT EXISTS matches (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID        NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  format_code   TEXT        REFERENCES tournament_formats(code),
  stage         TEXT,        -- 'group_a' | 'quarterfinal' | 'final' | 'round_3' etc.
  round         INT,         -- round number within stage
  court         SMALLINT,    -- court number (1-4 for KotC)
  score_team1   INT,
  score_team2   INT,
  status        TEXT        DEFAULT 'pending',  -- pending | in_progress | completed
  extra         JSONB       DEFAULT '{}',       -- format-specific match data
  played_at     TIMESTAMPTZ
);

-- =============================================================================
-- MATCH PLAYERS: dynamic team assignment per match
-- Allows KotC rotating pairs, IPT individual tracking, classic 2v2 fixed teams
-- team_side: 1 or 2 (which side of the net)
-- =============================================================================
CREATE TABLE IF NOT EXISTS match_players (
  match_id  UUID     NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id UUID     NOT NULL REFERENCES players(id),
  team_side SMALLINT NOT NULL CHECK (team_side IN (1, 2)),
  -- Format-specific stats per match (points scored, digs, etc.)
  stats     JSONB    DEFAULT '{}',
  PRIMARY KEY (match_id, player_id)
);

-- =============================================================================
-- RATING HISTORY
-- =============================================================================
CREATE TABLE IF NOT EXISTS rating_history (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        UUID        NOT NULL REFERENCES players(id),
  tournament_id    UUID        REFERENCES tournaments(id),
  format_code      TEXT        REFERENCES tournament_formats(code),
  points_changed   INT         NOT NULL,
  new_total_rating INT,
  place            INT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- PLAYER PROFILE FIELDS (for player card: photo, age, city, height, level)
-- =============================================================================
ALTER TABLE players ADD COLUMN IF NOT EXISTS photo_url  TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE players ADD COLUMN IF NOT EXISTS city       TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS height     SMALLINT;  -- cm
ALTER TABLE players ADD COLUMN IF NOT EXISTS level      TEXT;      -- 'NEXT A', 'FIRST B', etc.
ALTER TABLE players ADD COLUMN IF NOT EXISTS coach      TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS bio        TEXT;

-- Stores partner name + category for each result (for partner history table)
ALTER TABLE tournament_results ADD COLUMN IF NOT EXISTS partner_name TEXT;
ALTER TABLE tournament_results ADD COLUMN IF NOT EXISTS category     TEXT;

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_players_email                  ON players(email);
CREATE INDEX IF NOT EXISTS idx_players_status                 ON players(status);
CREATE INDEX IF NOT EXISTS idx_player_requests_status         ON player_requests(status);
CREATE INDEX IF NOT EXISTS idx_player_requests_email          ON player_requests(email);
CREATE INDEX IF NOT EXISTS idx_tournaments_format             ON tournaments(format_code);
CREATE INDEX IF NOT EXISTS idx_tournaments_status             ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tid    ON tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_pid    ON tournament_participants(player_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament             ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_stage                  ON matches(tournament_id, stage, round);
CREATE INDEX IF NOT EXISTS idx_match_players_player           ON match_players(player_id);
CREATE INDEX IF NOT EXISTS idx_rating_history_player          ON rating_history(player_id);
CREATE INDEX IF NOT EXISTS idx_rating_history_tournament      ON rating_history(tournament_id);

-- =============================================================================
-- RPC FUNCTIONS
-- =============================================================================

-- ─── pre_request: PostgREST best practice for stable JWT claims access ────────
-- PostgREST calls this before every request.
-- After this, use current_setting('request.jwt.claims.sub', true) etc.
CREATE OR REPLACE FUNCTION pre_request()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- PostgREST sets request.jwt.claims.* automatically when db-pre-request is configured
  NULL;
END; $$;

-- ─── register_player ─────────────────────────────────────────────────────────
-- Public: any visitor can submit a registration request.
-- Password is hashed with bcrypt HERE — client sends plaintext over HTTPS.
CREATE OR REPLACE FUNCTION register_player(
  p_name     TEXT,
  p_email    TEXT,
  p_password TEXT,
  p_gender   TEXT   -- 'M' or 'W'
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Validate inputs
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

  -- Check for duplicate
  IF EXISTS (SELECT 1 FROM players WHERE email = lower(p_email)) THEN
    RAISE EXCEPTION 'Email already registered' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM player_requests
    WHERE email = lower(p_email) AND status NOT IN ('rejected')
  ) THEN
    RAISE EXCEPTION 'Request already pending' USING ERRCODE = '23505';
  END IF;

  INSERT INTO player_requests (name, email, password_hash, gender, status, created_at)
  VALUES (
    trim(p_name),
    lower(p_email),
    crypt(p_password, gen_salt('bf', 10)),  -- bcrypt cost 10
    p_gender,
    'pending',
    now()
  );

  RETURN json_build_object('ok', true, 'message', 'Заявка отправлена. Ожидайте одобрения администратора.');
END; $$;

-- ─── approve_player_request ──────────────────────────────────────────────────
-- Admin: approve a pending request → create active player with hashed password
CREATE OR REPLACE FUNCTION approve_player_request(p_request_id UUID)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  req player_requests;
BEGIN
  SELECT * INTO req FROM player_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF req.status != 'pending' THEN
    RAISE EXCEPTION 'Request already processed (status: %)', req.status;
  END IF;

  -- Create player (or reactivate if email exists)
  INSERT INTO players (name, email, password_hash, gender, status, "addedAt")
  VALUES (req.name, req.email, req.password_hash, req.gender, 'active', now()::date)
  ON CONFLICT (email) DO UPDATE
    SET status = 'active',
        password_hash = EXCLUDED.password_hash,
        name = EXCLUDED.name;

  UPDATE player_requests SET status = 'approved' WHERE id = p_request_id;

  RETURN json_build_object('ok', true, 'name', req.name, 'email', req.email);
END; $$;

-- ─── reject_player_request ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reject_player_request(p_request_id UUID, p_reason TEXT DEFAULT '')
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE player_requests
  SET status = 'rejected', notes = p_reason
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already processed';
  END IF;

  RETURN json_build_object('ok', true);
END; $$;

-- ─── player_login ─────────────────────────────────────────────────────────────
-- Public: verify credentials → return JWT with role=player
CREATE OR REPLACE FUNCTION player_login(p_email TEXT, p_password TEXT)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec players;
  tok TEXT;
BEGIN
  SELECT * INTO rec
  FROM players
  WHERE email = lower(p_email)
    AND password_hash = crypt(p_password, password_hash)
    AND status = 'active';

  IF NOT FOUND THEN
    -- Don't leak whether email exists or password is wrong
    RAISE EXCEPTION 'Invalid email or password' USING ERRCODE = 'invalid_password';
  END IF;

  SELECT sign(row_to_json(r)::json, current_setting('app.settings.jwt_secret'))
  INTO tok
  FROM (
    SELECT
      'player'           AS role,
      rec.id::text       AS sub,
      rec.name           AS name,
      rec.gender         AS gender,
      -- 7 days expiry (balance between UX and security)
      extract(epoch FROM now() + interval '7 days')::int AS exp
  ) r;

  RETURN json_build_object(
    'token',  tok,
    'id',     rec.id,
    'name',   rec.name,
    'gender', rec.gender
  );
END; $$;

-- ─── admin_login ──────────────────────────────────────────────────────────────
-- Public: admin credentials → return JWT with role=admin
CREATE OR REPLACE FUNCTION admin_login(p_email TEXT, p_password TEXT)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec admins;
  tok TEXT;
BEGIN
  SELECT * INTO rec
  FROM admins
  WHERE email = lower(p_email)
    AND password_hash = crypt(p_password, password_hash);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid credentials' USING ERRCODE = 'invalid_password';
  END IF;

  SELECT sign(row_to_json(r)::json, current_setting('app.settings.jwt_secret'))
  INTO tok
  FROM (
    SELECT
      'admin'       AS role,
      rec.id::text  AS sub,
      -- 8 hours for admin session
      extract(epoch FROM now() + interval '8 hours')::int AS exp
  ) r;

  RETURN json_build_object('token', tok);
END; $$;

-- ─── get_pending_count ────────────────────────────────────────────────────────
-- Public (SECURITY DEFINER): returns ONLY the count of pending requests.
-- Safe for anon — no player data is exposed.
CREATE OR REPLACE FUNCTION get_pending_count()
RETURNS json LANGUAGE sql SECURITY DEFINER AS $$
  SELECT json_build_object('count', count(*))
  FROM player_requests
  WHERE status = 'pending';
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- player_requests: anon can INSERT only; admin has full access; no anon SELECT
ALTER TABLE player_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_insert ON player_requests;
DROP POLICY IF EXISTS admin_all   ON player_requests;
CREATE POLICY anon_insert ON player_requests FOR INSERT TO anon   WITH CHECK (true);
CREATE POLICY admin_all   ON player_requests FOR ALL   TO admin   USING (true);

-- players: anon sees only active; player sees all + updates own row; admin has full access
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read     ON players;
DROP POLICY IF EXISTS player_self   ON players;
DROP POLICY IF EXISTS player_update ON players;
DROP POLICY IF EXISTS admin_all     ON players;
CREATE POLICY anon_read     ON players FOR SELECT TO anon   USING (status = 'active');
CREATE POLICY player_self   ON players FOR SELECT TO player USING (true);
CREATE POLICY player_update ON players FOR UPDATE TO player
  USING      (id::text = current_setting('request.jwt.claims.sub', true))
  WITH CHECK (id::text = current_setting('request.jwt.claims.sub', true));
CREATE POLICY admin_all     ON players FOR ALL    TO admin  USING (true);

-- admins: only admin can read/write
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON admins;
CREATE POLICY admin_all ON admins FOR ALL TO admin USING (true);

-- tournament_participants
ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read   ON tournament_participants;
DROP POLICY IF EXISTS player_read ON tournament_participants;
DROP POLICY IF EXISTS player_join ON tournament_participants;
DROP POLICY IF EXISTS admin_all   ON tournament_participants;
CREATE POLICY anon_read   ON tournament_participants FOR SELECT TO anon   USING (true);
CREATE POLICY player_read ON tournament_participants FOR SELECT TO player USING (true);
CREATE POLICY player_join ON tournament_participants FOR INSERT TO player
  WITH CHECK (player_id::text = current_setting('request.jwt.claims.sub', true));
CREATE POLICY admin_all   ON tournament_participants FOR ALL    TO admin  USING (true);

-- matches: public read, admin write
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read ON matches;
DROP POLICY IF EXISTS admin_all ON matches;
CREATE POLICY anon_read ON matches FOR SELECT TO anon, player USING (true);
CREATE POLICY admin_all ON matches FOR ALL   TO admin          USING (true);

-- match_players: public read, admin write
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read ON match_players;
DROP POLICY IF EXISTS admin_all ON match_players;
CREATE POLICY anon_read ON match_players FOR SELECT TO anon, player USING (true);
CREATE POLICY admin_all ON match_players FOR ALL   TO admin          USING (true);

-- rating_history: public read, admin write
ALTER TABLE rating_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read ON rating_history;
DROP POLICY IF EXISTS admin_all ON rating_history;
CREATE POLICY anon_read ON rating_history FOR SELECT TO anon, player USING (true);
CREATE POLICY admin_all ON rating_history FOR ALL   TO admin          USING (true);

-- tournament_formats: public read
ALTER TABLE tournament_formats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read ON tournament_formats;
DROP POLICY IF EXISTS admin_all ON tournament_formats;
CREATE POLICY anon_read ON tournament_formats FOR SELECT TO anon, player USING (true);
CREATE POLICY admin_all ON tournament_formats FOR ALL   TO admin          USING (true);

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT EXECUTE ON FUNCTION pre_request               TO anon, player, admin;
GRANT EXECUTE ON FUNCTION register_player           TO anon;
GRANT EXECUTE ON FUNCTION player_login              TO anon;
GRANT EXECUTE ON FUNCTION admin_login               TO anon;
GRANT EXECUTE ON FUNCTION get_pending_count         TO anon;
GRANT EXECUTE ON FUNCTION approve_player_request    TO admin;
GRANT EXECUTE ON FUNCTION reject_player_request     TO admin;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO admin;

GRANT SELECT ON
  players, tournaments, tournament_formats,
  tournament_participants, matches, match_players,
  rating_history
TO anon, player;

GRANT INSERT ON player_requests              TO anon;
GRANT INSERT ON tournament_participants      TO player;

-- =============================================================================
-- FIRST ADMIN ACCOUNT (run once manually, change password immediately after)
-- Uncomment and replace values:
-- INSERT INTO admins (email, password_hash)
-- VALUES ('admin@lpbvolley.ru', crypt('CHANGE_ME_STRONG_PASSWORD', gen_salt('bf', 12)))
-- ON CONFLICT (email) DO NOTHING;
-- =============================================================================

-- Done!
SELECT 'Platform migration applied successfully' AS result,
       (SELECT count(*) FROM tournament_formats) AS formats_count;
