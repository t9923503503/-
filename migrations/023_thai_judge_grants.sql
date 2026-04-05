-- ============================================================
-- 023: Thai judge table grants for app runtime role
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE thai_round TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE thai_court TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE thai_tour TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE thai_match TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE thai_match_player TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE thai_player_round_stat TO lpbvolley;
