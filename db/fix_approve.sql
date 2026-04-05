-- Fix: approve_player_request used "addedAt" (non-existent column)
-- Players table uses created_at (timestamp, auto-default) — drop the column from INSERT
-- Apply: sudo -u postgres psql -d lpbvolley -f /tmp/fix_approve.sql

DROP FUNCTION IF EXISTS approve_player_request(UUID);

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
  -- Insert without "addedAt" — players table uses created_at with default now()
  INSERT INTO players (name, email, password_hash, gender, status)
  VALUES (req.name, req.email, req.password_hash, req.gender, 'active')
  ON CONFLICT (email) DO UPDATE
    SET status = 'active',
        password_hash = EXCLUDED.password_hash,
        name = EXCLUDED.name;
  UPDATE player_requests SET status = 'approved' WHERE id = p_request_id;
  RETURN json_build_object('ok', true, 'name', req.name, 'email', req.email);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_player_request(UUID) TO authenticated;

SELECT 'fix_approve OK' AS result;
