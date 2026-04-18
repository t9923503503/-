# GO Format: Параллельная реализация (3 агента)

## Общие правила
- Каждый агент работает ТОЛЬКО в своей зоне файлов
- Не модифицировать файлы другого агента
- Общие типы — в `web/lib/go-next/types.ts` (создаёт Агент 1, импортируют все)
- Формат-константы — в `web/lib/admin-legacy-sync.ts` (модифицирует Агент 1)
- После завершения: обновить STATUS.md

---

## Агент 1: FOUNDATION (БД + Типы + Core-логика + Тесты)

### Зона файлов (создать/модифицировать):
```
migrations/047_groups_olympic.sql          ← СОЗДАТЬ
web/lib/go-next/types.ts                   ← СОЗДАТЬ
web/lib/go-next/core.ts                    ← СОЗДАТЬ
web/lib/go-next/bracket-generator.ts       ← СОЗДАТЬ
web/lib/go-next/index.ts                   ← СОЗДАТЬ
web/lib/go-next-config.ts                  ← СОЗДАТЬ
web/lib/admin-legacy-sync.ts               ← ДОБАВИТЬ GO-константы (~60 строк в конец файла)
web/lib/admin-tournament-db.ts             ← ДОБАВИТЬ алиасы (3 строки)
tests/unit/go-core.test.js                 ← СОЗДАТЬ
tests/unit/go-bracket.test.js              ← СОЗДАТЬ
```

### Задача 1.1: Миграция БД
Файл: `migrations/047_groups_olympic.sql`

Создать таблицы (по образцу `migrations/044_kotc_next.sql`):

```sql
BEGIN;

-- go_round: контейнер раунда (R1=группы, R2=сетка)
CREATE TABLE IF NOT EXISTS go_round (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_no      INT  NOT NULL CHECK (round_no IN (1, 2)),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'live', 'finished')),
  seed          INT  NOT NULL DEFAULT 0,
  seed_draft    JSONB,           -- черновик посева для preview→confirm
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round_no)
);

-- go_group: группа внутри R1 (A, B, C, ...)
CREATE TABLE IF NOT EXISTS go_group (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id  UUID NOT NULL REFERENCES go_round(id) ON DELETE CASCADE,
  group_no  INT  NOT NULL CHECK (group_no >= 1),
  label     TEXT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'live', 'finished')),
  UNIQUE (round_id, group_no)
);

-- go_team: пара (2 игрока), привязана к группе
CREATE TABLE IF NOT EXISTS go_team (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES go_group(id) ON DELETE CASCADE,
  team_idx        INT  NOT NULL,
  seed            INT,
  player1_id      UUID REFERENCES players(id),
  player2_id      UUID REFERENCES players(id),
  rating_snapshot INT  NOT NULL DEFAULT 0,  -- снимок суммарного рейтинга при bootstrap
  handicap        INT  NOT NULL DEFAULT 0,  -- для будущей фазы гандикапов
  UNIQUE (group_id, team_idx)
);

-- go_court: корт с PIN для судьи
CREATE TABLE IF NOT EXISTS go_court (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  court_no    INT  NOT NULL CHECK (court_no >= 1),
  label       TEXT NOT NULL,
  pin_code    TEXT NOT NULL,
  UNIQUE (tournament_id, court_no)
);

-- go_bracket_slot: позиция в олимпийской сетке (дерево)
CREATE TABLE IF NOT EXISTS go_bracket_slot (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        UUID NOT NULL REFERENCES go_round(id) ON DELETE CASCADE,
  bracket_level   TEXT NOT NULL,       -- 'hard', 'advance', 'medium', 'light'
  bracket_round   INT  NOT NULL,       -- 1=QF, 2=SF, 3=F
  position        INT  NOT NULL,       -- позиция внутри раунда сетки
  team_id         UUID REFERENCES go_team(id),
  next_slot_id    UUID REFERENCES go_bracket_slot(id),  -- куда идёт победитель
  is_bye          BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (round_id, bracket_level, bracket_round, position)
);

-- go_match: матч (группа ИЛИ сетка)
CREATE TABLE IF NOT EXISTS go_match (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        UUID NOT NULL REFERENCES go_round(id) ON DELETE CASCADE,
  group_id        UUID REFERENCES go_group(id) ON DELETE CASCADE,
  bracket_slot_id UUID REFERENCES go_bracket_slot(id) ON DELETE CASCADE,
  bracket_level   TEXT,                -- NULL для группы, 'hard'/... для сетки (денормализация)
  match_no        INT  NOT NULL,
  court_no        INT,
  team_a_id       UUID REFERENCES go_team(id),
  team_b_id       UUID REFERENCES go_team(id),
  score_a         INT[] DEFAULT '{}',
  score_b         INT[] DEFAULT '{}',
  sets_a          INT  NOT NULL DEFAULT 0,
  sets_b          INT  NOT NULL DEFAULT 0,
  winner_id       UUID REFERENCES go_team(id),
  walkover        TEXT NOT NULL DEFAULT 'none'
                  CHECK (walkover IN ('none', 'team_a', 'team_b', 'mutual')),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'live', 'finished')),
  scheduled_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  timeouts_a      INT  NOT NULL DEFAULT 0,
  timeouts_b      INT  NOT NULL DEFAULT 0,
  -- XOR: матч в группе ИЛИ в сетке
  CHECK (
    (group_id IS NOT NULL AND bracket_slot_id IS NULL) OR
    (group_id IS NULL AND bracket_slot_id IS NOT NULL)
  ),
  UNIQUE (round_id, match_no)
);

-- go_group_standing: кэш таблицы группы
CREATE TABLE IF NOT EXISTS go_group_standing (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       UUID NOT NULL REFERENCES go_group(id) ON DELETE CASCADE,
  team_id        UUID NOT NULL REFERENCES go_team(id) ON DELETE CASCADE,
  played         INT  NOT NULL DEFAULT 0,
  wins           INT  NOT NULL DEFAULT 0,
  losses         INT  NOT NULL DEFAULT 0,
  match_points   INT  NOT NULL DEFAULT 0,
  sets_won       INT  NOT NULL DEFAULT 0,
  sets_lost      INT  NOT NULL DEFAULT 0,
  points_for     INT  NOT NULL DEFAULT 0,
  points_against INT  NOT NULL DEFAULT 0,
  position       INT,
  UNIQUE (group_id, team_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS go_round_tournament_idx ON go_round(tournament_id);
CREATE INDEX IF NOT EXISTS go_group_round_idx ON go_group(round_id);
CREATE INDEX IF NOT EXISTS go_team_group_idx ON go_team(group_id);
CREATE INDEX IF NOT EXISTS go_court_tournament_idx ON go_court(tournament_id);
CREATE INDEX IF NOT EXISTS go_bracket_slot_round_idx ON go_bracket_slot(round_id);
CREATE INDEX IF NOT EXISTS go_match_round_idx ON go_match(round_id);
CREATE INDEX IF NOT EXISTS go_match_group_idx ON go_match(group_id);
CREATE INDEX IF NOT EXISTS go_match_bracket_idx ON go_match(bracket_slot_id);
CREATE INDEX IF NOT EXISTS go_match_court_idx ON go_match(court_no);
CREATE INDEX IF NOT EXISTS go_group_standing_group_idx ON go_group_standing(group_id);

COMMIT;
```

### Задача 1.2: Типы
Файл: `web/lib/go-next/types.ts`

```typescript
// === Enums / Unions ===
export type GoRoundType = 'r1' | 'r2';
export type GoRoundStatus = 'pending' | 'live' | 'finished';
export type GoGroupStatus = 'pending' | 'live' | 'finished';
export type GoMatchStatus = 'pending' | 'live' | 'finished';
export type GoWalkover = 'none' | 'team_a' | 'team_b' | 'mutual';
export type GoSeedingMode = 'serpentine' | 'random' | 'manual';
export type GoBracketLevel = string;  // 'hard' | 'advance' | 'medium' | 'light' — динамический
export type GoMatchPointSystem = 'fivb' | 'simple';
export type GoTieBreakerLogic = 'fivb' | 'classic';
export type GoMatchFormat = 'single15' | 'single21' | 'bo3';

// === Settings ===
export interface GoAdminSettings {
  courts: number;               // 1-7
  groupCount: number;           // 2-8
  teamsPerGroup: number;        // 3-6
  matchFormat: GoMatchFormat;
  pointLimitGroup: number;      // 15 или 21
  pointLimitBracket: number;
  seedingMode: GoSeedingMode;
  bracketLevels: number;        // 1-4
  matchPointSystem: GoMatchPointSystem;
  tieBreakerLogic: GoTieBreakerLogic;
}

// === Views ===
export interface GoTeamView {
  teamId: string;
  teamIdx: number;
  seed: number | null;
  player1: { id: string; name: string };
  player2: { id: string; name: string } | null;
  ratingSnapshot: number;
  label: string;  // "Иванов / Петров"
}

export interface GoGroupView {
  groupId: string;
  groupNo: number;
  label: string;  // 'A', 'B', ...
  status: GoGroupStatus;
  teams: GoTeamView[];
  standings: GoGroupStandingRow[];
}

export interface GoMatchView {
  matchId: string;
  matchNo: number;
  courtNo: number | null;
  teamA: GoTeamView | null;
  teamB: GoTeamView | null;
  scoreA: number[];
  scoreB: number[];
  setsA: number;
  setsB: number;
  winnerId: string | null;
  walkover: GoWalkover;
  status: GoMatchStatus;
  scheduledAt: string | null;
  // Контекст
  groupLabel: string | null;       // 'A' для группового матча
  bracketLevel: string | null;     // 'hard' для сеточного
  bracketRound: number | null;     // 1=QF, 2=SF, 3=F
}

export interface GoGroupStandingRow {
  teamId: string;
  teamLabel: string;
  played: number;
  wins: number;
  losses: number;
  matchPoints: number;
  setsWon: number;
  setsLost: number;
  pointsFor: number;
  pointsAgainst: number;
  setQuotient: number;     // setsWon / setsLost (Infinity если setsLost=0)
  pointQuotient: number;   // pointsFor / pointsAgainst
  position: number;
}

export interface GoBracketSlotView {
  slotId: string;
  bracketLevel: string;
  bracketRound: number;
  position: number;
  team: GoTeamView | null;
  isBye: boolean;
  nextSlotId: string | null;
  matchId: string | null;
}

// === Operator ===
export type GoOperatorActionName =
  | 'bootstrap_groups'
  | 'start_group_stage'
  | 'mass_walkover_group'
  | 'finish_group_stage'
  | 'preview_bracket_seed'
  | 'confirm_bracket_seed'
  | 'bootstrap_bracket'
  | 'rollback_stage'
  | 'finish_bracket';

export interface GoOperatorState {
  tournamentId: string;
  stage: 'setup' | 'groups_ready' | 'groups_live' | 'groups_finished' | 'bracket_preview' | 'bracket_ready' | 'bracket_live' | 'finished';
  r1: { roundId: string; status: GoRoundStatus } | null;
  r2: { roundId: string; status: GoRoundStatus } | null;
  groups: GoGroupView[];
  bracketLevels: string[];
  courts: { courtNo: number; label: string; pinCode: string }[];
  settings: GoAdminSettings;
}

// === Judge ===
export interface GoJudgeSnapshot {
  tournamentId: string;
  courts: GoJudgeCourtView[];
  currentCourt: number;  // courtNo, выбранный судьёй
}

export interface GoJudgeCourtView {
  courtNo: number;
  label: string;
  matches: GoJudgeMatchView[];
  currentMatchId: string | null;  // первый pending/live
}

export interface GoJudgeMatchView {
  matchId: string;
  matchNo: number;
  teamA: { label: string };
  teamB: { label: string };
  scoreA: number[];
  scoreB: number[];
  setsA: number;
  setsB: number;
  status: GoMatchStatus;
  context: string;  // "Группа A, тур 3" или "HARD, 1/4 финала"
}

// === Spectator ===
export interface GoSpectatorPayload {
  tournamentId: string;
  tournamentName: string;
  stage: GoOperatorState['stage'];
  groups: GoGroupView[];
  brackets: Record<string, GoBracketSlotView[]>;  // level -> slots
  liveMatches: GoMatchView[];  // текущие матчи на кортах
}

// === Core function inputs ===
export interface SeedableTeam {
  teamId: string;
  rating: number;  // суммарный рейтинг пары
}

export interface GoMatchResult {
  matchId: string;
  teamAId: string;
  teamBId: string;
  setsA: number;
  setsB: number;
  scoreA: number[];
  scoreB: number[];
  walkover: GoWalkover;
}
```

### Задача 1.3: Core-логика
Файл: `web/lib/go-next/core.ts`

Чистые функции (без БД):

```typescript
// 1. Round-Robin расписание (circle method)
// Phantom фиксирован на позиции 0, остальные вращаются
// Bye-раунды возвращаются как пары с -1 (phantom index)
export function generateRoundRobin(teamCount: number): Array<Array<[number, number]>>

// 2. Посев змейкой
export function serpentineSeed(teams: SeedableTeam[], groupCount: number): SeedableTeam[][]

// 3. Случайный посев
export function randomSeed(teams: SeedableTeam[], groupCount: number, seed: number): SeedableTeam[][]

// 4. Расчёт таблицы группы (FIVB или classic)
export function calculateStandings(
  matches: GoMatchResult[],
  teamIds: string[],
  config: { matchPointSystem: GoMatchPointSystem; tieBreakerLogic: GoTieBreakerLogic }
): GoGroupStandingRow[]

// 5. Тейбрейкер (рекурсивный для подгрупп)
export function resolveGroupTiebreak(
  tied: GoGroupStandingRow[],
  matches: GoMatchResult[],
  logic: GoTieBreakerLogic
): GoGroupStandingRow[]

// 6. Match points калькулятор
export function calcMatchPoints(setsWon: number, setsLost: number, system: GoMatchPointSystem): number
// fivb: 3/2/1/0 для 2:0/2:1/1:2/0:2
// simple: 2 за победу, 1 за поражение

// 7. Валидация посева
export function validateSeeding(teams: SeedableTeam[], groupCount: number): string | null
// Проверяет: достаточно ли команд, делится ли на группы
```

### Задача 1.4: Генератор bracket
Файл: `web/lib/go-next/bracket-generator.ts`

```typescript
// 1. Размер сетки (next power of 2)
export function calcBracketSize(teamCount: number): number

// 2. Генерация bracket-tree из standings групп
// Cross-group avoidance: 1A vs 2B, 1B vs 2A, 1C vs 2D, 1D vs 2C
export function generateBracketSlots(
  groupStandings: Map<string, GoGroupStandingRow[]>,
  bracketLevels: number,
  levelLabels: string[]
): GoBracketSeed[]

export interface GoBracketSeed {
  level: string;
  slots: Array<{
    bracketRound: number;
    position: number;
    teamId: string | null;
    nextSlotPosition: { round: number; position: number } | null;
    isBye: boolean;
  }>;
  firstRoundMatches: Array<{
    teamAId: string | null;
    teamBId: string | null;
    bracketRound: number;
    position: number;
  }>;
}

// 3. Назначение bye (top seeds get byes)
export function assignByes(
  teams: Array<{ teamId: string; seedQuality: number }>,
  bracketSize: number
): Array<{ teamId: string | null; position: number; isBye: boolean }>

// 4. Определение следующего слота после победы
export function getNextSlotPosition(
  bracketRound: number,
  position: number
): { round: number; position: number }
// QF pos 1 → SF pos 1, QF pos 2 → SF pos 1
// QF pos 3 → SF pos 2, QF pos 4 → SF pos 2
// SF pos 1 → F pos 1, SF pos 2 → F pos 1
```

### Задача 1.5: Формат-константы
Файл: `web/lib/admin-legacy-sync.ts` — ДОБАВИТЬ в конец файла:

```typescript
export const GO_ADMIN_FORMAT = 'Groups + Olympic';

export const GO_ADMIN_MIN_COURTS = 1;
export const GO_ADMIN_MAX_COURTS = 7;
export const GO_ADMIN_DEFAULT_COURTS = 3;

export const GO_ADMIN_MIN_GROUPS = 2;
export const GO_ADMIN_MAX_GROUPS = 8;
export const GO_ADMIN_DEFAULT_GROUPS = 4;

export const GO_ADMIN_MIN_TEAMS_PER_GROUP = 3;
export const GO_ADMIN_MAX_TEAMS_PER_GROUP = 6;

export const GO_ADMIN_MIN_BRACKET_LEVELS = 1;
export const GO_ADMIN_MAX_BRACKET_LEVELS = 4;
export const GO_ADMIN_DEFAULT_BRACKET_LEVELS = 2;

export const GO_BRACKET_LEVEL_LABELS = ['hard', 'advance', 'medium', 'light'] as const;

export function isGoAdminFormat(format: unknown): boolean {
  return String(format ?? '').trim().toLowerCase() === GO_ADMIN_FORMAT.toLowerCase();
}

export function getGoSeatCount(groups: number, teamsPerGroup: number): number {
  return groups * teamsPerGroup * 2;  // 2 игрока на пару
}

export function normalizeGoAdminSettings(
  settings?: Record<string, unknown>,
  participantCount?: unknown
): {
  courts: number;
  groupCount: number;
  teamsPerGroup: number;
  matchFormat: string;
  pointLimitGroup: number;
  pointLimitBracket: number;
  seedingMode: string;
  bracketLevels: number;
  matchPointSystem: string;
  tieBreakerLogic: string;
}
// Реализация по образцу normalizeKotcAdminSettings (строка 222)
```

Файл: `web/lib/admin-tournament-db.ts` — ДОБАВИТЬ в `TOURNAMENT_FORMAT_CODE_ALIASES`:
```typescript
['groups + olympic', 'groups_olympic'],
['groups_olympic', 'groups_olympic'],
['go', 'groups_olympic'],
```
И добавить `'groups_olympic'` в `DEFAULT_SUPPORTED_TOURNAMENT_FORMAT_CODES`.

### Задача 1.6: Config
Файл: `web/lib/go-next-config.ts`

```typescript
// По образцу kotc-next аналогов

export function buildGoCourtPin(tournamentId: string, courtNo: number): string
// Детерминистический 8-char PIN (SHA1 от tournamentId + courtNo)

export function buildGoStructuralSignature(
  settings: GoAdminSettings,
  teamCount: number
): string
// Хэш настроек + размера ростера для drift detection

export function validateGoSetup(
  settings: GoAdminSettings,
  teamCount: number
): string | null
// Проверки: teamCount = groups * teamsPerGroup * 2
// bracketLevels <= teamsPerGroup
// groups >= 2
```

### Задача 1.7: Unit-тесты (ОБЯЗАТЕЛЬНО до Phase 3)
Файл: `tests/unit/go-core.test.js`

Тест-кейсы:
```
Round-Robin:
- 3 команды → 3 раунда, 1 матч + 1 bye каждый, ни одна команда не отдыхает дважды подряд
- 4 команды → 3 раунда, 2 матча каждый, без bye
- 5 команд → 5 раундов, 2 матча + 1 bye
- 6 команд → 5 раундов, 3 матча каждый

Serpentine:
- 8 команд, 4 группы → каждая группа по 2 команды, суммарные рейтинги ±10%
- 12 команд, 3 группы → по 4 команды, баланс
- Нечётное: 7 команд, 2 группы → 4+3, корректно

Standings (FIVB):
- Простой: 2:0 → 3 очка, 2:1 → 2 очка
- Тейбрейк 2 команды: head-to-head
- Тейбрейк 3 команды circular: fallback на set quotient
- Тейбрейк 3 команды: H2H resolves для пары, третья отдельно

Standings (simple):
- 2 за победу, 1 за поражение
```

Файл: `tests/unit/go-bracket.test.js`

```
Bracket size:
- 4 → 4, 5 → 8, 7 → 8, 9 → 16

Cross-group avoidance:
- 4 группы: 1A vs 2B, 1B vs 2A, 1C vs 2D, 1D vs 2C
- 3 группы: 1A vs 2C, 1B vs bye/2A, 1C vs 2B

Bye assignment:
- 5 команд в bracket-8: top 3 seeds get byes
- 4 команды: no byes
- 6 команд в bracket-8: top 2 seeds get byes

Next slot:
- QF pos 1 → SF pos 1
- QF pos 2 → SF pos 1
- SF pos 1 → F pos 1
```

### Выход: файлы готовы для импорта Агентом 2 и Агентом 3

---

## Агент 2: SERVICE + API (серверная логика)

### Зависимости: дождаться Агента 1 (types.ts, core.ts, bracket-generator.ts)

### Зона файлов (создать/модифицировать):
```
web/lib/go-next/service.ts                              ← СОЗДАТЬ
web/app/api/admin/tournaments/[id]/go-action/route.ts   ← СОЗДАТЬ
web/app/api/go/judge/[pin]/route.ts                     ← СОЗДАТЬ
web/app/api/go/judge/[pin]/score/route.ts               ← СОЗДАТЬ
web/app/api/admin/tournaments/[id]/go-standings/route.ts ← СОЗДАТЬ
web/app/api/admin/tournaments/[id]/go-bracket/route.ts  ← СОЗДАТЬ
web/app/api/admin/tournaments/[id]/reset-go/route.ts    ← СОЗДАТЬ
web/lib/go-next/sync-tournament-results.ts              ← СОЗДАТЬ
web/lib/sudyam-launch.ts                                ← МОДИФИЦИРОВАТЬ (+3 строки)
web/lib/sudyam-bootstrap.ts                             ← МОДИФИЦИРОВАТЬ (+40 строк)
```

### Задача 2.1: Service layer
Файл: `web/lib/go-next/service.ts`

Образец: `web/lib/kotc-next/service.ts` (~2000 строк)

Секции:
```typescript
// === SHARED HELPERS ===
class GoError extends Error { constructor(public statusCode: number, message: string) }
async function loadTournamentTx(client, tournamentId): Promise<Tournament>
async function loadRoundTx(client, tournamentId, roundNo): Promise<GoRound>

// === GROUP STAGE ===
async function bootstrapGroupsTx(client, tournament, settings, roster, seed)
  // 1. Создать go_round R1
  // 2. Применить serpentine/random/manual посев
  // 3. Создать go_group + go_team (с rating_snapshot!)
  // 4. generateRoundRobin для каждой группы
  // 5. Создать go_match для каждого матча
  // 6. Создать go_court с PIN-кодами
  // 7. Назначить court_no матчам (round-robin по кортам)
  // 8. Инициализировать go_group_standing

async function startGroupStageTx(client, tournament)
  // Установить R1 status = 'live'

async function finishGroupStageTx(client, tournament)
  // Проверить: все матчи R1 finished
  // Финализировать standings
  // Установить R1 status = 'finished'

async function massWalkoverGroupTx(client, tournament, groupId)
  // Завершить все pending матчи группы как walkover
  // Пересчитать standings

// === BRACKET STAGE ===
async function previewBracketSeedTx(client, tournament)
  // Прочитать standings → вызвать generateBracketSlots
  // Записать черновик в go_round.seed_draft
  // Вернуть preview (без записи в go_bracket_slot)

async function confirmBracketSeedTx(client, tournament, seedDraft?)
  // Прочитать seed_draft (или принять модифицированный от оператора)
  // Валидировать целостность
  // Создать go_round R2
  // Записать go_bracket_slot с next_slot_id

async function bootstrapBracketTx(client, tournament)
  // Из bracket_slots создать go_match для первого раунда
  // Bye → автоматическое продвижение (winner записывается, match finished)
  // Назначить court_no

async function finishBracketTx(client, tournament)
  // Проверить: все финальные матчи finished
  // Синхронизировать результаты → tournament_results

async function rollbackStageTx(client, tournament)
  // Если нет confirmed scores на текущем этапе → откат
  // bracket → удалить R2
  // groups → удалить R1

// === JUDGE ===
export async function getGoJudgeSnapshotByPin(pin: string): Promise<GoJudgeSnapshot>
  // По PIN найти tournament → загрузить все корты и их матчи
  // judgeToken = tournament-wide (не per-court)

export async function submitGoMatchScore(
  pin: string, matchId: string, scores: { scoreA: number[]; scoreB: number[] }
): Promise<GoJudgeSnapshot>
  // 1. Валидировать счёт (judge-scoreboard rules)
  // 2. Обновить go_match (sets, scores, winner, status)
  // 3. Если группа → пересчитать standings в транзакции
  // 4. Если сетка → advanceWinner (через next_slot_id)
  // 5. Вернуть обновлённый snapshot

export async function walkoverMatch(
  pin: string, matchId: string, walkover: 'team_a' | 'team_b' | 'mutual'
): Promise<GoJudgeSnapshot>

// === ADVANCE WINNER ===
async function advanceWinnerTx(client, match)
  // 1. Найти bracket_slot этого матча
  // 2. Найти next_slot_id
  // 3. Записать winner.team_id в next_slot
  // 4. Проверить: оба слота SF/F заполнены?
  // 5. Если да → создать go_match для следующего раунда сетки

// === OPERATOR ===
export async function runGoOperatorAction(
  tournamentId: string,
  action: GoOperatorActionName,
  options?: { seed?: number; groupId?: string; seedDraft?: unknown }
): Promise<{ success: true; state: GoOperatorState }>

export async function getGoOperatorState(
  tournamentId: string
): Promise<GoOperatorState>

// === SPECTATOR ===
export async function getGoSpectatorPayload(
  tournamentId: string
): Promise<GoSpectatorPayload>
```

### Задача 2.2: API Routes

**`web/app/api/admin/tournaments/[id]/go-action/route.ts`**
```typescript
import { requireApiRole } from '@/lib/api-auth';
import { runGoOperatorAction } from '@/lib/go-next/service';

export async function POST(req, { params }) {
  await requireApiRole(req, 'operator');
  const { action, ...options } = await req.json();
  const result = await runGoOperatorAction(params.id, action, options);
  return Response.json(result);
}
```

**`web/app/api/go/judge/[pin]/route.ts`**
```typescript
export async function GET(req, { params }) {
  const snapshot = await getGoJudgeSnapshotByPin(params.pin);
  return Response.json(snapshot);
}
```

**`web/app/api/go/judge/[pin]/score/route.ts`**
```typescript
export async function POST(req, { params }) {
  const { matchId, scoreA, scoreB, walkover } = await req.json();
  if (walkover) {
    const snapshot = await walkoverMatch(params.pin, matchId, walkover);
    return Response.json(snapshot);
  }
  const snapshot = await submitGoMatchScore(params.pin, matchId, { scoreA, scoreB });
  return Response.json(snapshot);
}
```

Остальные routes по аналогии.

### Задача 2.3: Sudyam интеграция
Файл: `web/lib/sudyam-launch.ts` — добавить GO в FORMAT_ALIASES и ADMIN_TOURNAMENT_FORMATS
Файл: `web/lib/sudyam-bootstrap.ts` — добавить GO-ветку в `resolveSudyamBootstrap`

### Задача 2.4: Синхронизация результатов
Файл: `web/lib/go-next/sync-tournament-results.ts`

По образцу `web/lib/thai-live/sync-tournament-results.ts`:
- При finish_bracket → записать placement в tournament_results
- Для каждого bracket_level: 1-е место = 1st в уровне, 2-е = 2nd
- Rating points по POINTS_TABLE из `web/lib/rating-points.ts`

---

## Агент 3: UI (фронтенд)

### Зависимости: типы из Агента 1 (types.ts), API контракт из Агента 2

### Зона файлов (создать/модифицировать):
```
web/app/admin/tournaments/page.tsx                     ← МОДИФИЦИРОВАТЬ
web/app/admin/tournaments/[id]/go-live/page.tsx         ← СОЗДАТЬ
web/app/go/[tournamentId]/live/page.tsx                 ← СОЗДАТЬ (публичное табло)
web/components/go-next/GoOperatorPanel.tsx               ← СОЗДАТЬ
web/components/go-next/GoSeedEditor.tsx                  ← СОЗДАТЬ
web/components/go-next/GoBracketView.tsx                 ← СОЗДАТЬ
web/components/go-next/GoGroupStandings.tsx              ← СОЗДАТЬ
web/components/go-next/GoJudgeScreen.tsx                 ← СОЗДАТЬ
web/components/go-next/GoSpectatorBoard.tsx              ← СОЗДАТЬ
web/components/go-next/GoCourtTabs.tsx                   ← СОЗДАТЬ (табы кортов для судьи)
web/components/go-next/GoMatchCard.tsx                   ← СОЗДАТЬ
web/components/go-next/GoProgressBar.tsx                 ← СОЗДАТЬ
```

### Задача 3.1: Admin tournaments page
Файл: `web/app/admin/tournaments/page.tsx`

Изменения:
1. Импортировать GO-константы из `admin-legacy-sync.ts`
2. Добавить в `formats` массив (строка 335):
   ```typescript
   { key: 'Groups + Olympic', label: 'Группы + Олимп.' },
   ```
3. Добавить GO-specific settings panel (после KOTC panel):
   ```
   Видимость: isGoAdminFormat(form.format)
   
   Поля:
   - Корты: stepper 1-7 (default 3)
   - Группы: stepper 2-8 (default 4)
   - Команд в группе: stepper 3-6 (auto-calculated или manual)
   - Формат матча: segmented [До 15 | До 21 | Best of 3]
   - Посев: segmented [Змейка | Случайный | Ручной]
   - Уровни сетки: stepper 1-4 (default 2)
   - Система очков: segmented [FIVB (3-2-1-0) | Простая (2-1)]
   - Тейбрейкер: segmented [FIVB | Классический]
   ```
4. Обновить `buildGoControlUrl(row.id)` для кнопки "Control →"
5. Обновить `getPrimaryLaunchTarget` для GO формата

### Задача 3.2: Operator page (go-live)
Файл: `web/app/admin/tournaments/[id]/go-live/page.tsx`

```typescript
// Server component → загружает GoOperatorState
// Рендерит GoOperatorPanel

import { getGoOperatorState } from '@/lib/go-next/service';

export default async function GoLivePage({ params }) {
  const state = await getGoOperatorState(params.id);
  return <GoOperatorPanel initialState={state} tournamentId={params.id} />;
}
```

### Задача 3.3: GoOperatorPanel
Файл: `web/components/go-next/GoOperatorPanel.tsx`

Структура:
```
┌────────────────────────────────────────────────┐
│ GoProgressBar: [Посев] → [Группы] → [Сетка] → [Итог] │
├────────────────────────────────────────────────┤
│ Tabs: [Группы] [Расписание] [Сетка] [Корты]    │ ← sticky
├────────────────────────────────────────────────┤
│ Tab content:                                    │
│ - Группы: GoGroupStandings × N                  │
│ - Расписание: GoMatchCard list                   │
│ - Сетка: GoBracketView (tabs per level)          │
│ - Корты: PIN-коды, загрузка, текущие матчи       │
├────────────────────────────────────────────────┤
│ Actions:                                        │
│ [Bootstrap Groups] [Start] [Finish] [→ Bracket]  │
│ [Rollback ←]                                     │
│ [Mass Walkover для группы X]                     │
└────────────────────────────────────────────────┘
```

State management: `useState` + fetch on action response.
Polling: `useEffect` + `setInterval(8000)` для обновления state.

### Задача 3.4: GoSeedEditor
Файл: `web/components/go-next/GoSeedEditor.tsx`

- Показывает preview посева (после serpentine/random)
- Группы в колонках, команды — карточки с рейтингом
- Drag-and-drop между группами (для корректировки — развести сокомандников)
- Кнопка "Подтвердить посев"
- Подсветка дисбаланса (если одна группа значительно сильнее)

### Задача 3.5: GoBracketView
Файл: `web/components/go-next/GoBracketView.tsx`

- Tabs per bracket level: [HARD] [ADVANCE] [MEDIUM] [LIGHT]
- Bracket tree: стандартная визуализация single-elimination
  ```
  QF        SF        F
  ┌─A─┐
  │   ├─?─┐
  └─B─┘   │
           ├─Winner
  ┌─C─┐   │
  │   ├─?─┘
  └─D─┘
  ```
- Текущий счёт live-матчей
- Завершённые матчи: серый, с финальным счётом

### Задача 3.6: GoGroupStandings
Файл: `web/components/go-next/GoGroupStandings.tsx`

Таблица:
```
│ #  │ Команда         │ И │ В │ П │ О │ С+ │ С- │ М+ │ М- │
│ 1  │ Иванов/Петров   │ 3 │ 3 │ 0 │ 9 │ 6  │ 1  │ 123│ 89 │
│ 2  │ Сидоров/Козлов  │ 3 │ 2 │ 1 │ 7 │ 5  │ 2  │ 110│ 95 │
```
- Подсветка: зелёный — выходят в bracket, красный — выбывают
- Количество выходящих = bracketLevels (1-е места в hard, 2-е в advance, и т.д.)

### Задача 3.7: GoJudgeScreen
Файл: `web/components/go-next/GoJudgeScreen.tsx`

```
┌──────────────────────────────────────┐
│ GoCourtTabs: [К1] [К2] [К3] ...     │ ← быстрое переключение
├──────────────────────────────────────┤
│ Матчи на корте: [Матч 1 ✓] [Матч 2 ▶] [Матч 3] │
├──────────────────────────────────────┤
│ Группа A, Тур 2                     │
│                                      │
│ Иванов/Петров    21:18    Сидоров/Козлов │
│                  15:21                  │
│                   8:5 ▶                 │
│                                      │
│ Left ← [+1 А]      [+1 Б] → Right   │
│                                      │
│ [Undo]  [Walkover ▼]  [Submit Score] │
└──────────────────────────────────────┘
```

- Переиспользует `judge-scoreboard/reducer.ts` для логики партий
- `leftTeam` tracking из `MatchCore`
- Side swap уведомление (каждые 7/5 очков)
- Walkover: двухступенчатый (выбор team_a/team_b/mutual + подтверждение)
- Auto-submit: когда матч завершён (winner определён) → POST score

### Задача 3.8: GoSpectatorBoard (публичное табло)
Файл: `web/app/go/[tournamentId]/live/page.tsx` + `web/components/go-next/GoSpectatorBoard.tsx`

- Публичный URL `/go/[tournamentId]/live` — без авторизации
- Auto-refresh каждые 8 секунд (`setInterval + fetch`)
- Контент:
  - Группы: GoGroupStandings (compact)
  - Сетка: GoBracketView (read-only)
  - Live-матчи: текущий счёт на кортах

### Задача 3.9: GoProgressBar
Файл: `web/components/go-next/GoProgressBar.tsx`

4 этапа: Setup → Groups → Bracket → Finished
- Текущий этап подсвечен
- Завершённые — с чекмарком
- Будущие — серые

---

## Порядок работы

```
Агент 1 (Foundation):
  1.1 migration
  1.2 types.ts
  1.3 core.ts
  1.4 bracket-generator.ts
  1.5 admin-legacy-sync.ts
  1.6 go-next-config.ts
  1.7 unit tests ← ОБЯЗАТЕЛЬНО до service.ts
  
Агент 2 (Service + API) — ПОСЛЕ Агента 1 завершит types.ts:
  2.1 service.ts (может начать параллельно, импортируя типы)
  2.2 API routes
  2.3 sudyam integration
  2.4 sync-tournament-results.ts

Агент 3 (UI) — ПАРАЛЛЕЛЬНО с Агентом 2:
  3.1 admin page modification
  3.2 go-live page
  3.3 operator panel
  3.4-3.9 components
```

```
Timeline:
┌─────────┐
│ Агент 1 │ ████████████████░░░░░░░░░░░░░░░░
│         │ migration+types+core+tests
├─────────┤
│ Агент 2 │ ░░░░░░░░████████████████████████
│         │ wait    service+API+integration
├─────────┤
│ Агент 3 │ ░░░░░░░░████████████████████████
│         │ wait    admin+operator+judge+spectator
└─────────┘
```

Агент 3 может начать работу над admin page (dropdown) сразу, но компоненты GO зависят от types.ts.
