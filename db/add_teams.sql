-- =============================================================================
-- ADD TEAMS TABLE: Парные заявки на турнир
-- Server: 157.22.173.248  DB: lpbvolley
-- Apply: sudo -u postgres psql -d lpbvolley -f /tmp/add_teams.sql
-- =============================================================================

-- =============================================================================
-- TEAMS: Команды / Заявки на турнир (пары игроков)
-- Связывает двух игроков с конкретным турниром.
-- player2_id может быть NULL — игрок ищет напарника.
-- =============================================================================
CREATE TABLE IF NOT EXISTS teams (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID        NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player1_id    UUID        NOT NULL REFERENCES players(id),
  player2_id    UUID        REFERENCES players(id),  -- NULL = ищу напарника
  status        TEXT        NOT NULL DEFAULT 'looking_for_partner',
    -- looking_for_partner | confirmed | waitlist | withdrawn
  seed          INT,         -- посев (для сетки)
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, player1_id),  -- один игрок — одна заявка как первый
  -- Проверка: player2 не равен player1
  CONSTRAINT teams_different_players CHECK (player1_id != player2_id)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_teams_tournament     ON teams(tournament_id);
CREATE INDEX IF NOT EXISTS idx_teams_player1        ON teams(player1_id);
CREATE INDEX IF NOT EXISTS idx_teams_player2        ON teams(player2_id);
CREATE INDEX IF NOT EXISTS idx_teams_status         ON teams(tournament_id, status);
CREATE INDEX IF NOT EXISTS idx_teams_looking        ON teams(tournament_id)
  WHERE status = 'looking_for_partner';

-- =============================================================================
-- ОБНОВЛЯЕМ matches: добавляем ссылки на teams (опционально, для парных форматов)
-- Для KotC/IPT используется match_players, для классики — team1_id/team2_id
-- =============================================================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS team1_id UUID REFERENCES teams(id);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS team2_id UUID REFERENCES teams(id);

CREATE INDEX IF NOT EXISTS idx_matches_team1 ON matches(team1_id);
CREATE INDEX IF NOT EXISTS idx_matches_team2 ON matches(team2_id);

-- =============================================================================
-- RLS для teams
-- =============================================================================
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_read ON teams;
DROP POLICY IF EXISTS auth_all  ON teams;

-- Все могут видеть команды (публичные списки участников)
CREATE POLICY anon_read ON teams FOR SELECT TO anon         USING (true);
CREATE POLICY auth_all  ON teams FOR ALL   TO authenticated USING (true);

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT SELECT ON teams TO anon;
GRANT ALL    ON teams TO authenticated;

-- =============================================================================
-- ФУНКЦИЯ: join_tournament — игрок подаёт заявку на турнир
-- Если partner_id указан — создаёт подтверждённую пару.
-- Если нет — ставит статус looking_for_partner.
-- =============================================================================
CREATE OR REPLACE FUNCTION join_tournament(
  p_tournament_id UUID,
  p_player_id     UUID,
  p_partner_id    UUID DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  trn  tournaments;
  team teams;
  team_count INT;
BEGIN
  -- Проверяем турнир
  SELECT * INTO trn FROM tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Турнир не найден';
  END IF;
  IF trn.status NOT IN ('open', 'full') THEN
    RAISE EXCEPTION 'Турнир не принимает заявки (статус: %)', trn.status;
  END IF;

  -- Проверяем дубли
  IF EXISTS (
    SELECT 1 FROM teams
    WHERE tournament_id = p_tournament_id
      AND (player1_id = p_player_id OR player2_id = p_player_id)
  ) THEN
    RAISE EXCEPTION 'Вы уже зарегистрированы на этот турнир';
  END IF;

  -- Считаем текущие команды
  SELECT count(*) INTO team_count
  FROM teams
  WHERE tournament_id = p_tournament_id AND status != 'withdrawn';

  -- Определяем статус
  DECLARE
    new_status TEXT;
  BEGIN
    IF trn.max_players IS NOT NULL AND team_count >= trn.max_players THEN
      new_status := 'waitlist';
    ELSIF p_partner_id IS NOT NULL THEN
      new_status := 'confirmed';
    ELSE
      new_status := 'looking_for_partner';
    END IF;

    INSERT INTO teams (tournament_id, player1_id, player2_id, status)
    VALUES (p_tournament_id, p_player_id, p_partner_id, new_status)
    RETURNING * INTO team;
  END;

  RETURN json_build_object(
    'ok', true,
    'team_id', team.id,
    'status', team.status
  );
END;
$$;

-- =============================================================================
-- ФУНКЦИЯ: pair_with_player — присоединиться к команде, ищущей напарника
-- =============================================================================
CREATE OR REPLACE FUNCTION pair_with_player(
  p_team_id   UUID,
  p_player_id UUID
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  team teams;
BEGIN
  SELECT * INTO team FROM teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Команда не найдена';
  END IF;
  IF team.status != 'looking_for_partner' THEN
    RAISE EXCEPTION 'Команда уже укомплектована';
  END IF;
  IF team.player2_id IS NOT NULL THEN
    RAISE EXCEPTION 'У команды уже есть напарник';
  END IF;
  IF team.player1_id = p_player_id THEN
    RAISE EXCEPTION 'Нельзя стать напарником самому себе';
  END IF;

  -- Проверяем, не записан ли уже этот игрок в другую команду
  IF EXISTS (
    SELECT 1 FROM teams
    WHERE tournament_id = team.tournament_id
      AND (player1_id = p_player_id OR player2_id = p_player_id)
      AND status != 'withdrawn'
  ) THEN
    RAISE EXCEPTION 'Вы уже зарегистрированы на этот турнир';
  END IF;

  UPDATE teams
  SET player2_id = p_player_id,
      status = 'confirmed',
      updated_at = now()
  WHERE id = p_team_id;

  RETURN json_build_object('ok', true, 'team_id', p_team_id, 'status', 'confirmed');
END;
$$;

GRANT EXECUTE ON FUNCTION join_tournament(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION pair_with_player(UUID, UUID)      TO authenticated;

-- =============================================================================
SELECT 'add_teams migration OK' AS result;
