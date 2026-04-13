-- ============================================================
-- 046: KOTC Next table grants for app runtime role
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE kotcn_round TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE kotcn_court TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE kotcn_pair TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE kotcn_raund TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE kotcn_game TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE kotcn_raund_stat TO lpbvolley;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE kotcn_player_round_stat TO lpbvolley;
