'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SixPairLiveWorkspace } from './SixPairLiveWorkspace';
import {
  IndividualMixOfflineStore,
  applyIndividualMixOfflineCommand,
  buildIndividualMixQuickScore,
  buildIndividualMixSeededDivisions,
  buildSixPairHybridSchedule,
  buildStandardIndividualMixPool,
  calculateIndividualMixStandings,
  createIndividualMixOfflineBundle,
  getIndividualMixOfflineProgress,
  INDIVIDUAL_MIX_SIX_PAIR_POINT_LIMIT,
  INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION,
  INDIVIDUAL_MIX_VARIANT_STANDARD,
  isSixPairIndividualMixVariant,
  validateIndividualMixScore,
  type IndividualMixAdminVariant,
  type IndividualMixGame,
  type IndividualMixGameResult,
  type IndividualMixDivisionEntry,
  type IndividualMixOfflineBundle,
  type IndividualMixOfflineCommand,
  type IndividualMixPlayer,
  type IndividualMixSide,
} from '@/lib/individual-mix';

const DEMO_TOURNAMENT_ID = 'individual-mix-admin-prototype';
const PLAYOFF_FORMAT_VERSION = 'divisions-v1';
const STANDARD_RULES_VERSION = 'individual-mix-v1';

const maleNames = ['Алексей', 'Дмитрий', 'Иван', 'Максим', 'Сергей', 'Артём', 'Михаил', 'Роман', 'Павел', 'Виктор', 'Никита', 'Егор'];
const femaleNames = ['Анна', 'Мария', 'Елена', 'Ольга', 'Дарья', 'Юлия', 'Ирина', 'Наталья', 'Светлана', 'Алина', 'Виктория', 'Ксения'];

type Tab = 'input' | 'standings' | 'playoff';

function withStorageTimeout<T>(operation: Promise<T>, timeoutMs = 2500): Promise<T> {
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('Локальное хранилище не ответило вовремя.')), timeoutMs)),
  ]);
}

function deviceId(): string {
  const key = 'lpvolley-individual-mix-device-id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const value = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(key, value);
  return value;
}

function createPlayers(courtNo: number, size: number, gender: 'M' | 'W'): IndividualMixPlayer[] {
  const names = gender === 'M' ? maleNames : femaleNames;
  return Array.from({ length: size }, (_, index) => ({
    id: `c${courtNo}-${gender.toLowerCase()}${index + 1}`,
    name: `${names[index] ?? `Игрок ${index + 1}`} ${courtNo}`,
    gender,
    drawSeed: index + 1,
  }));
}

type IndividualMixAdminWorkspaceProps = {
  tournamentId?: string;
  tournamentName?: string;
  initialCourts?: number;
  initialPoolSize?: 4 | 5 | 6;
  pointLimit?: number;
  variant?: IndividualMixAdminVariant;
  pairGender?: 'M' | 'W';
  initialPlayers?: IndividualMixPlayer[];
  demoMode?: boolean;
  liveEnabled?: boolean;
};

function buildBundle(input: {
  courts: number;
  poolSize: number;
  tournamentId: string;
  pointLimit: number;
  variant: IndividualMixAdminVariant;
  pairGender: 'M' | 'W';
  initialPlayers?: IndividualMixPlayer[];
  demoMode: boolean;
}): IndividualMixOfflineBundle {
  const { courts, poolSize, tournamentId, pointLimit, variant, pairGender, initialPlayers = [], demoMode } = input;
  if (!initialPlayers.length && !demoMode) {
    throw new Error('В составе турнира пока нет игроков. Добавьте участников в мастере турнира.');
  }
  if (isSixPairIndividualMixVariant(variant)) {
    const players = initialPlayers.length
      ? initialPlayers
      : createPlayers(1, 12, pairGender);
    return createIndividualMixOfflineBundle({
      tournamentId,
      deviceId: deviceId(),
      rulesVersion: INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION,
      scheduleRevision: Date.now(),
      scoreRule: { kind: 'hard_cap', target: INDIVIDUAL_MIX_SIX_PAIR_POINT_LIMIT },
      schedules: [buildSixPairHybridSchedule({ poolId: 'six-pair-hybrid', players })],
    });
  }
  const schedules = Array.from({ length: courts }, (_, index) => {
    const courtNo = index + 1;
    const courtPlayers = initialPlayers.slice(index * poolSize * 2, (index + 1) * poolSize * 2);
    const men = courtPlayers.filter((player) => player.gender === 'M');
    const women = courtPlayers.filter((player) => player.gender === 'W');
    if (initialPlayers.length && (men.length !== poolSize || women.length !== poolSize)) {
      throw new Error(`На корте ${courtNo} должно быть ${poolSize} мужчин и ${poolSize} женщин.`);
    }
    return buildStandardIndividualMixPool({
      poolId: `court-${courtNo}`,
      courtNo,
      men: initialPlayers.length ? men : createPlayers(courtNo, poolSize, 'M'),
      women: initialPlayers.length ? women : createPlayers(courtNo, poolSize, 'W'),
    });
  });
  return createIndividualMixOfflineBundle({
    tournamentId,
    deviceId: deviceId(),
    rulesVersion: STANDARD_RULES_VERSION,
    scheduleRevision: Date.now(),
    scoreRule: { kind: 'hard_cap', target: pointLimit },
    schedules,
  });
}

function allGames(bundle: IndividualMixOfflineBundle | null): IndividualMixGame[] {
  if (!bundle) return [];
  return bundle.schedules.flatMap((schedule) =>
    schedule.rounds.flatMap((round) => round.duels.flatMap((duel) => duel.games)),
  );
}

function playerName(bundle: IndividualMixOfflineBundle, id: string): string {
  for (const schedule of bundle.schedules) {
    const player = schedule.players.find((candidate) => candidate.id === id);
    if (player) return player.name;
  }
  return id;
}

function playerGenderMark(bundle: IndividualMixOfflineBundle, id: string): 'М' | 'Ж' {
  for (const schedule of bundle.schedules) {
    const player = schedule.players.find((candidate) => candidate.id === id);
    if (player) return player.gender === 'W' ? 'Ж' : 'М';
  }
  return 'М';
}

function gameModeLabel(game: IndividualMixGame): string {
  if (game.mode === 'own_pairs') return 'Свои пары';
  if (game.mode === 'partner_swap') return 'Обмен партнёрами';
  if (game.mode === 'fixed_pairs') return 'Обычная игра';
  return `Игра ${game.gameNo}`;
}

function teamName(bundle: IndividualMixOfflineBundle, game: IndividualMixGame, side: IndividualMixSide): string {
  const team = game[side];
  return `${playerName(bundle, team.maleId)} + ${playerName(bundle, team.femaleId)}`;
}

function makeScoreCommand(
  bundle: IndividualMixOfflineBundle,
  result: IndividualMixGameResult,
): IndividualMixOfflineCommand {
  return {
    commandId: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `cmd-${Date.now()}-${result.gameId}`,
    tournamentId: bundle.tournamentId,
    deviceId: bundle.deviceId,
    sequenceNumber: bundle.localRevision + 1,
    baseRevision: bundle.localRevision,
    scheduleRevision: bundle.scheduleRevision,
    rulesVersion: bundle.rulesVersion,
    createdAt: new Date().toISOString(),
    type: bundle.results[result.gameId] ? 'score_corrected' : 'score_recorded',
    payload: { result },
  };
}

export function IndividualMixAdminWorkspace(props: IndividualMixAdminWorkspaceProps = {}) {
  const tournamentId = props.tournamentId ?? DEMO_TOURNAMENT_ID;
  const isDemoMode = props.demoMode ?? tournamentId === DEMO_TOURNAMENT_ID;
  if (isSixPairIndividualMixVariant(props.variant) && props.liveEnabled !== false) {
    return (
      <SixPairLiveWorkspace
        tournamentId={tournamentId}
        tournamentName={props.tournamentName}
        initialPlayers={props.initialPlayers ?? []}
        demoMode={isDemoMode}
      />
    );
  }
  return <IndividualMixLegacyWorkspace {...props} />;
}

function IndividualMixLegacyWorkspace({
  tournamentId = DEMO_TOURNAMENT_ID,
  tournamentName,
  initialCourts = 1,
  initialPoolSize = 4,
  pointLimit = 15,
  variant = INDIVIDUAL_MIX_VARIANT_STANDARD,
  pairGender = 'W',
  initialPlayers = [],
  demoMode,
}: IndividualMixAdminWorkspaceProps = {}) {
  const isDemoMode = demoMode ?? tournamentId === DEMO_TOURNAMENT_ID;
  const sixPairVariant = isSixPairIndividualMixVariant(variant);
  const expectedRulesVersion = sixPairVariant ? INDIVIDUAL_MIX_SIX_PAIR_RULES_VERSION : STANDARD_RULES_VERSION;
  const store = useMemo(() => new IndividualMixOfflineStore(), []);
  const [bundle, setBundle] = useState<IndividualMixOfflineBundle | null>(null);
  const [courts, setCourts] = useState(initialCourts);
  const [poolSize, setPoolSize] = useState<number>(initialPoolSize);
  const [activeCourt, setActiveCourt] = useState(1);
  const [tab, setTab] = useState<Tab>('input');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [winner, setWinner] = useState<IndividualMixSide | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [techConfirmOpen, setTechConfirmOpen] = useState(false);
  const [manualLeft, setManualLeft] = useState('');
  const [manualRight, setManualRight] = useState('');
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState('');
  const [lastSavedMessage, setLastSavedMessage] = useState('');
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sixPairVariant && tab === 'playoff') setTab('input');
  }, [sixPairVariant, tab]);

  useEffect(() => {
    document.body.classList.add('individual-mix-workspace');
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    const storageTimeout = window.setTimeout(() => setBusy(false), 1500);
    store.loadBundle(tournamentId)
      .then((saved) => {
        if (saved?.rulesVersion === expectedRulesVersion) {
          setBundle(saved);
          const savedCourtCount = new Set(allGames(saved).map((game) => game.courtNo)).size;
          setCourts(savedCourtCount || saved.schedules.length);
          if (!sixPairVariant) {
            setPoolSize(saved.schedules[0]?.players.filter((player) => player.gender === 'M').length ?? 4);
          }
        } else if (saved) {
          setNotice('Вариант турнира изменён. Подготовьте новое расписание для выбранной схемы.');
        }
      })
      .catch(() => setNotice('Не удалось открыть локальное хранилище на этом устройстве.'))
      .finally(() => {
        window.clearTimeout(storageTimeout);
        setBusy(false);
      });
    return () => {
      document.body.classList.remove('individual-mix-workspace');
      window.clearTimeout(storageTimeout);
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, [expectedRulesVersion, sixPairVariant, store, tournamentId]);

  const games = useMemo(() => allGames(bundle), [bundle]);
  const courtNumbers = useMemo(() => [...new Set(games.map((game) => game.courtNo))].sort((left, right) => left - right), [games]);
  const courtGames = useMemo(() => games.filter((game) => game.courtNo === activeCourt), [activeCourt, games]);
  const selectedGame = selectedGameId
    ? courtGames.find((game) => game.id === selectedGameId && !bundle?.results[game.id]) ?? null
    : null;
  const currentGame = selectedGame ?? courtGames.find((game) => !bundle?.results[game.id]) ?? courtGames.at(-1) ?? null;
  const currentGameIndex = currentGame ? courtGames.findIndex((game) => game.id === currentGame.id) : -1;
  const currentDuel = currentGame && bundle
    ? bundle.schedules
        .flatMap((schedule) => schedule.rounds.flatMap((round) => round.duels))
        .find((duel) => duel.games.some((game) => game.id === currentGame.id)) ?? null
    : null;
  const nextGame = currentGameIndex >= 0
    ? courtGames.slice(currentGameIndex + 1).find((game) => !bundle?.results[game.id]) ?? null
    : null;
  const progress = bundle ? getIndividualMixOfflineProgress(bundle) : { completed: 0, total: 0, missingGameIds: [] };
  const currentCourtDone = courtGames.filter((game) => bundle?.results[game.id]).length;
  const pendingSync = bundle?.localRevision ?? 0;
  const activePointLimit = bundle && bundle.scoreRule.kind !== 'timed'
    ? bundle.scoreRule.target
    : pointLimit;

  const prepareOffline = useCallback(async () => {
    setBusy(true);
    setNotice('');
    try {
      const next = buildBundle({ courts, poolSize, tournamentId, pointLimit, variant, pairGender, initialPlayers, demoMode: isDemoMode });
      setBundle(next);
      setActiveCourt(1);
      setSelectedGameId(null);
      setWinner(null);
      setLastSavedMessage('');
      setResetConfirmOpen(false);
      setTechConfirmOpen(false);
      await withStorageTimeout(store.saveBundle(next));
      const preparedCourtCount = new Set(allGames(next).map((game) => game.courtNo)).size;
      setNotice(`Офлайн-пакет готов: ${preparedCourtCount} ${preparedCourtCount === 1 ? 'корт' : 'корта'}, ${allGames(next).length} игр.`);
    } catch (error) {
      setNotice(error instanceof Error
        ? `${error.message} Экран продолжит работать, но перед закрытием вкладки проверьте настройки браузера.`
        : 'Не удалось сохранить офлайн-пакет на устройстве.');
    } finally {
      setBusy(false);
    }
  }, [courts, initialPlayers, isDemoMode, pairGender, pointLimit, poolSize, store, tournamentId, variant]);

  const saveResult = useCallback(async (result: IndividualMixGameResult) => {
    if (!bundle) return;
    setBusy(true);
    setNotice('');
    try {
      const command = makeScoreCommand(bundle, result);
      const optimistic = applyIndividualMixOfflineCommand(bundle, command).bundle;
      const savedGame = allGames(bundle).find((game) => game.id === result.gameId);
      const followingGame = savedGame
        ? allGames(bundle).find((game) => game.courtNo === savedGame.courtNo && game.id !== savedGame.id && !bundle.results[game.id])
        : null;
      const score = `${result.leftScore}:${result.rightScore}`;
      const winnerSide: IndividualMixSide = result.leftScore > result.rightScore ? 'left' : 'right';
      const winnerScore = winnerSide === 'left'
        ? `${result.leftScore}:${result.rightScore}`
        : `${result.rightScore}:${result.leftScore}`;
      const winnerNames = savedGame ? teamName(bundle, savedGame, winnerSide) : '';

      // Reset the two-step input in the same render that advances to the next game.
      // Otherwise the previous winner can briefly appear selected on the new match.
      setWinner(null);
      setSelectedGameId(null);
      setManualMode(false);
      setTechConfirmOpen(false);
      setManualLeft('');
      setManualRight('');
      setLastSavedMessage(savedGame
        ? `${winnerNames} победили ${winnerScore}. ${followingGame ? `Далее ${followingGame.shortCode}: ${teamName(bundle, followingGame, 'left')} — ${teamName(bundle, followingGame, 'right')}.` : `Корт ${savedGame.courtNo} заполнен.`}`
        : `Счёт ${score} записан. Открыта следующая игра.`);
      setBundle(optimistic);
      await withStorageTimeout(store.applyCommand(command));
    } catch (error) {
      setNotice(error instanceof Error
        ? `${error.message} Результат пока сохранён только в открытой вкладке.`
        : 'Результат пока сохранён только в открытой вкладке.');
    } finally {
      setBusy(false);
    }
  }, [bundle, store]);

  const quickScore = useCallback((loserScore: number) => {
    if (!bundle || !currentGame || !winner) return;
    const score = buildIndividualMixQuickScore({ rule: bundle.scoreRule, winner, loserScore });
    if (!score) {
      setManualMode(true);
      return;
    }
    void saveResult({ gameId: currentGame.id, ...score, kind: 'played' });
  }, [bundle, currentGame, saveResult, winner]);

  const saveManual = useCallback(() => {
    if (!bundle || !currentGame) return;
    const leftScore = Number(manualLeft);
    const rightScore = Number(manualRight);
    const error = validateIndividualMixScore(bundle.scoreRule, leftScore, rightScore);
    if (error) {
      setNotice(error === `Winner must score exactly ${activePointLimit}.`
        ? `Победитель должен набрать ровно ${activePointLimit}.`
        : 'Проверьте счёт: ничья и отрицательные значения недопустимы.');
      return;
    }
    void saveResult({ gameId: currentGame.id, leftScore, rightScore, kind: 'played' });
  }, [activePointLimit, bundle, currentGame, manualLeft, manualRight, saveResult]);

  const lockPlayoff = useCallback(async () => {
    const alreadyLocked = bundle?.playoffLockedAt && bundle.playoffFormatVersion === PLAYOFF_FORMAT_VERSION;
    if (!bundle || progress.completed !== progress.total || alreadyLocked) return;
    const next = {
      ...bundle,
      playoffLockedAt: new Date().toISOString(),
      playoffFormatVersion: PLAYOFF_FORMAT_VERSION,
    };
    setBundle(next);
    setBusy(true);
    setNotice('');
    try {
      await withStorageTimeout(store.saveBundle(next));
      setNotice('Второй этап зафиксирован и сохранён на этом устройстве.');
    } catch (error) {
      setNotice(error instanceof Error
        ? `${error.message} Фиксация пока сохранена только в открытой вкладке.`
        : 'Фиксация пока сохранена только в открытой вкладке.');
    } finally {
      setBusy(false);
    }
  }, [bundle, progress.completed, progress.total, store]);

  const selectTab = useCallback((nextTab: Tab) => {
    setTab(nextTab);
    window.requestAnimationFrame(() => {
      document.getElementById('individual-mix-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const openPendingGame = useCallback((game: IndividualMixGame) => {
    setActiveCourt(game.courtNo);
    setSelectedGameId(game.id);
    setWinner(null);
    setManualMode(false);
    setTechConfirmOpen(false);
    setLastSavedMessage('');
    window.requestAnimationFrame(() => {
      document.getElementById('individual-mix-score-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  if (busy && !bundle) {
    return <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-sm text-text-secondary">Открываем офлайн-турнир…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-3 pb-24 md:space-y-5 md:pb-6">
      <header className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,90,0,.18),rgba(0,209,255,.08))] p-4 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link href="/admin/tournaments" className="inline-flex min-h-8 items-center text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300 hover:text-cyan-200">
                ← Все турниры
              </Link>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brand">{sixPairVariant ? 'Бездельники · 6 пар' : 'Личный микст'}{isDemoMode ? ' · демо-состав' : tournamentName ? '' : ' · прототип'}</p>
            </div>
            <h2 className="mt-1 text-2xl font-black leading-tight md:text-4xl">{tournamentName || 'Пульт турнира'}</h2>
            <p className="mt-1 text-xs text-text-secondary md:text-sm">{sixPairVariant ? '6 равных туров → быстрый ввод → личная таблица +/−' : 'Бумага → быстрый ввод → таблица → второй этап'}</p>
          </div>
          <div className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${online ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/40 bg-amber-400/10 text-amber-200'}`}>
            {online ? '● Онлайн' : '● Офлайн'}
          </div>
        </div>
      </header>

      {!bundle ? (
        <section className="rounded-3xl border border-white/10 bg-white/5 p-4 md:p-6">
          <p className="text-lg font-black">Подготовка перед выездом</p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">{sixPairVariant ? 'Параметры специальной схемы уже зафиксированы в мастере. Расписание и формы сохранятся на этом iPad или iPhone.' : 'Выберите загрузку кортов. Расписание и формы сохранятся на этом iPad или iPhone.'}</p>
          {sixPairVariant ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-sm"><strong className="text-cyan-200">Корт 1 · тайский</strong><span className="mt-1 block text-xs text-text-secondary">4 пары · свои составы + обмен партнёрами</span></div>
              <div className="rounded-2xl border border-white/10 bg-black/10 p-3 text-sm"><strong>Корт 2 · обычный</strong><span className="mt-1 block text-xs text-text-secondary">2 фиксированные пары · одна игра</span></div>
              <div className="rounded-2xl border border-brand/30 bg-brand/10 p-3 text-sm sm:col-span-2"><strong>12 игроков · 6 пар · 6 туров · 36 игр · всё до 11</strong><span className="mt-1 block text-xs text-text-secondary">Каждая пара сыграет 4 тайских тура и 2 тура по две полные игры со сменой партнёров.</span></div>
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <OptionGroup label="Кортов" value={courts} values={[1, 2, 3, 4]} onChange={setCourts} />
                <OptionGroup label="Игроков в группе" value={poolSize} values={[4, 5, 6]} suffix="+  столько же" onChange={setPoolSize} />
              </div>
              <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-sm"><strong>{courts * poolSize * 2} игроков</strong> · {courts * poolSize * (poolSize - 1)} игр · до {courts} кортов</div>
            </>
          )}
          {isDemoMode ? <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm leading-6 text-amber-100"><strong>Демо-состав.</strong> Используются вымышленные игроки — можно безопасно проверить расписание, быстрый ввод и таблицу{sixPairVariant ? ' +/−' : ' второго этапа'}.</div> : !initialPlayers.length ? <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-400/10 p-3 text-sm leading-6 text-red-100"><strong>Состав не заполнен.</strong> Вернитесь в мастер турнира и добавьте участников перед подготовкой расписания.</div> : null}
          <button type="button" onClick={prepareOffline} disabled={busy || (!isDemoMode && !initialPlayers.length)} className="mt-4 min-h-14 w-full rounded-2xl bg-brand px-5 text-base font-black text-white shadow-lg shadow-orange-950/30 disabled:opacity-50">
            {busy ? 'Подготавливаем…' : 'Подготовить турнир без интернета'}
          </button>
        </section>
      ) : (
        <>
          <section className="sticky top-2 z-20 rounded-2xl border border-white/10 bg-[#0b111b]/95 p-3 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-black">Готово {progress.completed}/{progress.total}</span>
              <span className={online ? 'text-cyan-300' : 'text-amber-200'}>{online ? `${pendingSync} действий в журнале` : `Офлайн · ${pendingSync} не отправлено`}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%` }} /></div>
          </section>

          <nav className={`hidden gap-1 rounded-2xl border border-white/10 bg-white/5 p-1 md:grid ${sixPairVariant ? 'grid-cols-2' : 'grid-cols-3'}`} aria-label="Этап турнира">
            <TabButton active={tab === 'input'} onClick={() => selectTab('input')} label="Ввод" note={`${progress.completed}/${progress.total}`} />
            <TabButton active={tab === 'standings'} onClick={() => selectTab('standings')} label="Таблица" note={sixPairVariant ? '+/−' : 'М / Ж'} />
            {!sixPairVariant ? <TabButton active={tab === 'playoff'} onClick={() => selectTab('playoff')} label="2-й этап" note={progress.completed === progress.total ? 'готов' : 'предпросмотр'} /> : null}
          </nav>

          {notice ? <div role="status" className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{notice}</div> : null}

          <div id="individual-mix-main" className="scroll-mt-20" />
          {tab === 'input' ? (
            <section className="space-y-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {courtNumbers.map((courtNo) => {
                  const done = games.filter((game) => game.courtNo === courtNo && bundle.results[game.id]).length;
                  const total = games.filter((game) => game.courtNo === courtNo).length;
                  return <button key={courtNo} type="button" onClick={() => { setActiveCourt(courtNo); setSelectedGameId(null); setWinner(null); setLastSavedMessage(''); setTechConfirmOpen(false); }} className={`min-h-12 min-w-28 rounded-xl border px-3 text-left ${activeCourt === courtNo ? 'border-brand bg-brand text-white' : 'border-white/10 bg-white/5'}`}><span className="block text-sm font-black">Корт {courtNo}</span><span className="text-[10px] opacity-75">{done}/{total} игр{sixPairVariant ? ` · ${courtNo === 1 ? 'тай' : 'обычный'}` : ''}</span></button>;
                })}
              </div>

              {lastSavedMessage ? (
                <div role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2.5 text-xs font-bold leading-5 text-emerald-100">
                  <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400 text-[10px] text-slate-950">✓</span>
                  <span>{lastSavedMessage}</span>
                </div>
              ) : null}

              {currentGame && currentCourtDone < courtGames.length ? (
                <div id="individual-mix-score-card" className="scroll-mt-24 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
                  <div className="border-b border-white/[0.07] px-4 py-3 md:px-5">
                    <div className="flex items-center justify-between gap-3 text-xs text-text-secondary">
                      <span>Корт {currentGame.courtNo} · Раунд {currentGame.roundNo} · Дуэль {currentGame.duelNo}</span>
                      <strong className="whitespace-nowrap rounded-full bg-white/7 px-2.5 py-1 text-white">{gameModeLabel(currentGame)} · {currentGame.gameNo}/{currentDuel?.games.length ?? 1}</strong>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="font-mono text-[10px] tracking-wide text-cyan-300">{currentGame.shortCode}</p>
                      <span className="text-[10px] text-text-secondary">{currentCourtDone + 1} из {courtGames.length}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 border-b border-white/[0.07] bg-black/10 text-[10px] font-black uppercase tracking-wide">
                    <button
                      type="button"
                      disabled={!winner}
                      onClick={() => { setWinner(null); setManualMode(false); setTechConfirmOpen(false); }}
                      className={`flex min-h-10 items-center justify-center gap-2 px-2 disabled:cursor-default ${winner ? 'text-emerald-300' : 'bg-brand/10 text-brand'}`}
                    >
                      <span className={`grid h-5 w-5 place-items-center rounded-full ${winner ? 'bg-emerald-400 text-slate-950' : 'bg-brand text-white'}`}>{winner ? '✓' : '1'}</span>
                      {winner ? 'Победитель · изменить' : 'Победитель'}
                    </button>
                    <div className={`flex min-h-10 items-center justify-center gap-2 border-l border-white/[0.07] px-2 ${winner ? 'bg-brand/10 text-brand' : 'text-text-secondary'}`}>
                      <span className={`grid h-5 w-5 place-items-center rounded-full ${winner ? 'bg-brand text-white' : 'bg-white/10'}`}>2</span>
                      Счёт
                    </div>
                  </div>

                  <div className="p-4 md:p-5">
                  <p className="text-center text-xs font-bold uppercase tracking-[0.16em] text-text-secondary">{winner ? 'Победитель выбран · укажите очки проигравших' : 'Нажмите на победившую пару'}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(['left', 'right'] as const).map((side) => (
                      <button key={side} type="button" aria-pressed={winner === side} onClick={() => { setWinner(winner === side ? null : side); setLastSavedMessage(''); setManualMode(false); setTechConfirmOpen(false); }} className={`relative min-h-24 rounded-2xl border p-3 text-left transition active:scale-[.98] ${winner === side ? 'border-brand bg-brand text-white shadow-lg shadow-orange-950/30' : winner ? 'border-white/10 bg-[#0d1520] opacity-55' : 'border-white/15 bg-[#111a27]'}`}>
                        <span className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wider opacity-70">
                          Пара {side === 'left' ? 'A' : 'Б'}
                          {winner === side ? <span className="rounded-full bg-white/20 px-2 py-0.5">Выбрано · отменить</span> : null}
                        </span>
                        <span className="mt-2 flex items-center gap-1.5 text-sm font-black leading-5 md:text-base"><span className="text-[9px] font-black text-cyan-200">{playerGenderMark(bundle, currentGame[side].maleId)}</span>{playerName(bundle, currentGame[side].maleId)}</span>
                        <span className="mt-1 flex items-center gap-1.5 text-sm font-black leading-5 md:text-base"><span className="text-[9px] font-black text-fuchsia-200">{playerGenderMark(bundle, currentGame[side].femaleId)}</span>{playerName(bundle, currentGame[side].femaleId)}</span>
                      </button>
                    ))}
                  </div>

                  {winner && !manualMode ? (
                    <div className="mt-4 rounded-2xl border border-brand/25 bg-brand/[0.06] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-black text-white">Сколько набрали проигравшие?</p>
                        <span className="whitespace-nowrap text-xs font-black text-brand">{activePointLimit} : ?</span>
                      </div>
                      <div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-8">
                        {Array.from({ length: activePointLimit }, (_, score) => <button key={score} type="button" onClick={() => quickScore(score)} disabled={busy} aria-label={`Записать счёт проигравших ${score}`} className="min-h-12 rounded-xl border border-white/10 bg-[#111a27] text-base font-black transition active:scale-95 active:bg-brand disabled:opacity-50">{score}</button>)}
                      </div>
                    </div>
                  ) : null}

                  {manualMode ? (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-sm font-black">Ручной счёт</p>
                      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <input inputMode="numeric" aria-label="Счёт левой пары" value={manualLeft} onChange={(event) => setManualLeft(event.target.value)} className="min-h-14 min-w-0 rounded-xl border border-white/15 bg-black/25 text-center text-2xl font-black outline-none focus:border-brand" />
                        <span className="font-black">:</span>
                        <input inputMode="numeric" aria-label="Счёт правой пары" value={manualRight} onChange={(event) => setManualRight(event.target.value)} className="min-h-14 min-w-0 rounded-xl border border-white/15 bg-black/25 text-center text-2xl font-black outline-none focus:border-brand" />
                      </div>
                      <button type="button" onClick={saveManual} className="mt-2 min-h-12 w-full rounded-xl bg-brand font-black text-white">Сохранить счёт</button>
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => { setManualMode((value) => !value); setTechConfirmOpen(false); }} className="min-h-11 rounded-xl border border-white/15 text-xs font-bold">Баланс / вручную</button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (!winner) {
                          setNotice('Сначала выберите победившую пару.');
                          return;
                        }
                        setManualMode(false);
                        setTechConfirmOpen(true);
                      }}
                      className="min-h-11 rounded-xl border border-white/15 text-xs font-bold disabled:opacity-50"
                    >
                      Тех. исход {activePointLimit}:0
                    </button>
                  </div>

                  {techConfirmOpen && winner ? (
                    <div role="alert" className="mt-3 rounded-2xl border border-red-400/35 bg-red-500/10 p-3">
                      <p className="text-sm font-black text-red-100">Подтвердите технический исход</p>
                      <p className="mt-1 text-xs leading-5 text-red-100/75">
                        Победа: <strong className="text-red-50">{teamName(bundle, currentGame, winner)}</strong>.
                        Будет записан счёт {winner === 'left' ? `${activePointLimit}:0` : `0:${activePointLimit}`} с отметкой «технический исход».
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setTechConfirmOpen(false)}
                          className="min-h-12 rounded-xl border border-white/15 text-sm font-bold"
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveResult({
                            gameId: currentGame.id,
                            leftScore: winner === 'left' ? activePointLimit : 0,
                            rightScore: winner === 'right' ? activePointLimit : 0,
                            kind: 'walkover',
                            reason: 'Технический исход',
                          })}
                          className="min-h-12 rounded-xl bg-red-600 px-3 text-sm font-black text-white disabled:opacity-50"
                        >
                          Подтвердить {winner === 'left' ? `${activePointLimit}:0` : `0:${activePointLimit}`}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {nextGame ? (
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3 text-[10px] text-text-secondary">
                      <span className="font-bold uppercase tracking-wide">Следом</span>
                      <span className="truncate text-right">{nextGame.shortCode} · {teamName(bundle, nextGame, 'left')} — {teamName(bundle, nextGame, 'right')}</span>
                    </div>
                  ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-emerald-400/25 bg-emerald-400/10 p-6 text-center">
                  <p className="text-xl font-black text-emerald-200">Корт {activeCourt} заполнен</p>
                  <p className="mt-1 text-sm text-emerald-100/70">Все результаты этого корта сохранены на устройстве.</p>
                </div>
              )}

              <PendingGamesPanel
                bundle={bundle}
                games={courtGames}
                activeCourt={activeCourt}
                currentGameId={currentGame?.id ?? null}
                totalPending={progress.missingGameIds.length}
                onOpen={openPendingGame}
              />
            </section>
          ) : null}

          {tab === 'standings' ? <Standings bundle={bundle} sixPairVariant={sixPairVariant} /> : null}
          {tab === 'playoff' && !sixPairVariant ? (
            <PlayoffPreview
              bundle={bundle}
              complete={progress.completed === progress.total}
              busy={busy}
              onLock={lockPlayoff}
            />
          ) : null}

          <details id="individual-mix-admin-tools" className="scroll-mt-20 rounded-2xl border border-white/10 bg-white/5 p-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-black">Настройка и аварийные действия</summary>
            <p className="mt-2 text-xs leading-5 text-text-secondary">Новая подготовка создаст чистое расписание и заменит локальные результаты этого турнира.</p>
            {sixPairVariant ? <div className="mt-3 rounded-xl border border-brand/25 bg-brand/10 p-3 text-xs leading-5 text-text-secondary"><strong className="block text-sm text-white">Схема зафиксирована мастером</strong>2 корта · 6 пар · 6 туров · все игры до 11. Чтобы выключить эти особенности, выберите «Стандартный» на шаге «Формат».</div> : <div className="mt-3 grid gap-3 sm:grid-cols-2"><OptionGroup label="Кортов" value={courts} values={[1, 2, 3, 4]} onChange={setCourts} /><OptionGroup label="Игроков в группе" value={poolSize} values={[4, 5, 6]} onChange={setPoolSize} /></div>}
            {!resetConfirmOpen ? (
              <button type="button" onClick={() => setResetConfirmOpen(true)} disabled={busy} className="mt-4 min-h-12 w-full rounded-xl border border-red-400/25 bg-red-400/[0.06] text-sm font-black text-red-200 disabled:opacity-50">{sixPairVariant ? 'Создать расписание заново' : 'Изменить формат и создать заново'}</button>
            ) : (
              <div role="alert" className="mt-4 rounded-2xl border border-red-400/40 bg-red-500/10 p-3">
                <p className="text-sm font-black text-red-100">Удалить текущее расписание?</p>
                <p className="mt-1 text-xs leading-5 text-red-100/75">Будут заменены расписание и {progress.completed} внесённых результатов на этом устройстве. Отменить это действие нельзя.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setResetConfirmOpen(false)} className="min-h-12 rounded-xl border border-white/15 text-sm font-bold">Нет, сохранить</button>
                  <button type="button" onClick={() => void prepareOffline()} disabled={busy} className="min-h-12 rounded-xl bg-red-600 px-2 text-xs font-black text-white disabled:opacity-50">Удалить {progress.completed} результатов</button>
                </div>
              </div>
            )}
          </details>

          <MobileTournamentNav
            tab={tab}
            progress={`${progress.completed}/${progress.total}`}
            playoffReady={progress.completed === progress.total}
            sixPairVariant={sixPairVariant}
            onSelect={selectTab}
          />
        </>
      )}
    </div>
  );
}

function MobileTournamentNav({
  tab,
  progress,
  playoffReady,
  sixPairVariant,
  onSelect,
}: {
  tab: Tab;
  progress: string;
  playoffReady: boolean;
  sixPairVariant: boolean;
  onSelect: (tab: Tab) => void;
}) {
  const openTools = () => {
    document.getElementById('individual-mix-admin-tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <nav className={`fixed inset-x-0 bottom-0 z-[120] grid border-t border-white/10 bg-[#090f18]/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-16px_40px_rgba(0,0,0,.45)] backdrop-blur-xl md:hidden ${sixPairVariant ? 'grid-cols-3' : 'grid-cols-4'}`} aria-label="Управление турниром">
      <MobileTournamentNavButton active={tab === 'input'} label="Ввод" note={progress} icon="●" onClick={() => onSelect('input')} />
      <MobileTournamentNavButton active={tab === 'standings'} label="Таблица" note={sixPairVariant ? '+/−' : 'М / Ж'} icon="≡" onClick={() => onSelect('standings')} />
      {!sixPairVariant ? <MobileTournamentNavButton active={tab === 'playoff'} label="2-й этап" note={playoffReady ? 'готов' : 'ожидание'} icon="◇" onClick={() => onSelect('playoff')} /> : null}
      <MobileTournamentNavButton active={false} label="Ещё" note="настройки" icon="•••" onClick={openTools} />
    </nav>
  );
}

function MobileTournamentNavButton({ active, label, note, icon, onClick }: { active: boolean; label: string; note: string; icon: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className={`min-h-[4.15rem] px-1 py-2 text-center ${active ? 'text-brand' : 'text-slate-400'}`}>
      <span aria-hidden="true" className="block text-base font-black leading-none">{icon}</span>
      <span className="mt-1 block text-[11px] font-black leading-none">{label}</span>
      <span className="mt-1 block text-[8px] font-bold uppercase tracking-wide opacity-65">{note}</span>
    </button>
  );
}

function OptionGroup({ label, value, values, suffix, onChange }: { label: string; value: number; values: number[]; suffix?: string; onChange: (value: number) => void }) {
  return <fieldset><legend className="text-xs font-black uppercase tracking-wider text-text-secondary">{label}</legend><div className="mt-2 grid grid-cols-4 gap-1.5">{values.map((option) => <button key={option} type="button" onClick={() => onChange(option)} className={`min-h-12 rounded-xl border text-sm font-black ${option === value ? 'border-brand bg-brand text-white' : 'border-white/10 bg-white/5'}`}>{option}{suffix && option === value ? <span className="sr-only"> {suffix}</span> : null}</button>)}</div>{suffix ? <p className="mt-1 text-[10px] text-text-secondary">{value} мужчин {suffix} женщин</p> : null}</fieldset>;
}

function TabButton({ active, label, note, onClick }: { active: boolean; label: string; note: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`min-h-14 rounded-xl px-2 text-center ${active ? 'bg-white/12 text-white' : 'text-text-secondary'}`}><span className="block text-sm font-black">{label}</span><span className="block text-[9px] uppercase tracking-wide opacity-70">{note}</span></button>;
}

function PendingGamesPanel({
  bundle,
  games,
  activeCourt,
  currentGameId,
  totalPending,
  onOpen,
}: {
  bundle: IndividualMixOfflineBundle;
  games: IndividualMixGame[];
  activeCourt: number;
  currentGameId: string | null;
  totalPending: number;
  onOpen: (game: IndividualMixGame) => void;
}) {
  const pending = games.filter((game) => !bundle.results[game.id]);
  return (
    <details className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-base text-cyan-300">≡</span>
          <span className="min-w-0">
            <span className="block text-sm font-black">Очередь матчей</span>
            <span className="block truncate text-[10px] text-text-secondary">Корт {activeCourt} · нажмите матч, чтобы открыть</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black text-cyan-300">{totalPending} всего</span>
          <span aria-hidden="true" className="text-xs text-text-secondary transition-transform group-open:rotate-180">⌄</span>
        </span>
      </summary>
      <div className="border-t border-white/[0.07] p-3">
        <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wide text-text-secondary">
          <span>Корт {activeCourt}</span>
          <span>{pending.length} ожидают результата</span>
        </div>
        {pending.length ? (
          <ol className="space-y-2">
            {pending.map((game) => {
              const current = game.id === currentGameId;
              return (
                <li key={game.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(game)}
                    className={`grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[.99] ${current ? 'border-brand/50 bg-brand/10' : 'border-white/[0.08] bg-[#0d1520] hover:bg-white/[0.05]'}`}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className={`font-mono text-[9px] font-black ${current ? 'text-brand' : 'text-cyan-300'}`}>{game.shortCode}</span>
                        <span className="text-[9px] text-text-secondary">Раунд {game.roundNo} · {gameModeLabel(game)}</span>
                      </span>
                      <span className="mt-1 block truncate text-[11px] font-bold text-white">A · {teamName(bundle, game, 'left')}</span>
                      <span className="mt-0.5 block truncate text-[11px] font-bold text-white">Б · {teamName(bundle, game, 'right')}</span>
                    </span>
                    <span className={`rounded-xl px-2.5 py-2 text-[10px] font-black uppercase ${current ? 'bg-brand text-white' : 'bg-white/5 text-text-secondary'}`}>{current ? 'Сейчас' : 'Открыть'}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="rounded-xl bg-emerald-400/10 px-3 py-4 text-center text-sm font-bold text-emerald-200">На этом корте всё заполнено</div>
        )}
      </div>
    </details>
  );
}

function Standings({ bundle, sixPairVariant }: { bundle: IndividualMixOfflineBundle; sixPairVariant: boolean }) {
  return <div className="space-y-4">{bundle.schedules.map((schedule) => {
    const games = schedule.rounds.flatMap((round) => round.duels.flatMap((duel) => duel.games));
    const gameIds = new Set(games.map((game) => game.id));
    const results = Object.values(bundle.results).filter((result) => gameIds.has(result.gameId));
    const rows = calculateIndividualMixStandings({ schedule, results });
    const genders = (['M', 'W'] as const).filter((gender) => rows.some((row) => row.gender === gender));
    const completed = results.length;
    const total = gameIds.size;
    return (
      <section key={schedule.poolId} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045]">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">Личный рейтинг</p>
            <h3 className="mt-0.5 text-xl font-black">{sixPairVariant ? 'Общий зачёт · +/−' : `Корт ${schedule.courtNo}`}</h3>
          </div>
          <div className={`rounded-full border px-3 py-1.5 text-xs font-black ${completed === total ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-text-secondary'}`}>
            {completed}/{total} игр
          </div>
        </header>
        <div className={`grid gap-3 p-3 md:p-4 ${genders.length > 1 ? 'md:grid-cols-2' : ''}`}>
          {genders.map((gender) => (
            <StandingsGenderCard
              key={gender}
              bundle={bundle}
              gender={gender}
              rows={rows.filter((row) => row.gender === gender)}
              games={games}
              results={bundle.results}
              advancementEnabled={!sixPairVariant}
            />
          ))}
        </div>
        <div className="border-t border-white/10 px-4 py-2.5 text-[11px] text-text-secondary">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />
          {sixPairVariant ? 'Место определяется по разнице мячей +/−, затем по победам и набранным очкам.' : 'Первые четыре места проходят во второй этап. При равенстве выше игрок с лучшей разницей мячей.'}
        </div>
      </section>
    );
  })}</div>;
}

function StandingsGenderCard({
  bundle,
  gender,
  rows,
  games,
  results,
  advancementEnabled,
}: {
  bundle: IndividualMixOfflineBundle;
  gender: 'M' | 'W';
  rows: ReturnType<typeof calculateIndividualMixStandings>;
  games: IndividualMixGame[];
  results: Record<string, IndividualMixGameResult>;
  advancementEnabled: boolean;
}) {
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/15">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-black ${gender === 'M' ? 'bg-cyan-400/15 text-cyan-300' : 'bg-fuchsia-400/15 text-fuchsia-300'}`}>
            {gender}
          </span>
          <h4 className="text-sm font-black">{gender === 'M' ? 'Мужчины' : 'Женщины'}</h4>
        </div>
        <span className="text-[9px] font-black uppercase tracking-[0.12em] text-text-secondary">Победы · +/−</span>
      </header>
      <ol className="divide-y divide-white/[0.06]">
        {rows.map((row) => {
          const advances = advancementEnabled && row.position <= 4;
          const leader = row.position === 1;
          const expanded = expandedPlayerId === row.playerId;
          const historyId = `individual-mix-history-${row.playerId}`;
          return (
            <li
              key={row.playerId}
              className={leader ? 'bg-[linear-gradient(90deg,rgba(255,90,0,.16),transparent)]' : ''}
            >
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={historyId}
                onClick={() => setExpandedPlayerId(expanded ? null : row.playerId)}
                className="grid min-h-12 w-full grid-cols-[2rem_minmax(0,1fr)_auto_auto_1rem] items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
              >
                <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black ${leader ? 'bg-brand text-white shadow-md shadow-orange-950/40' : advances ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'bg-white/5 text-text-secondary'}`}>
                  {row.position}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black">{playerName(bundle, row.playerId)}</span>
                  <span className={`mt-0.5 block text-[9px] font-bold uppercase tracking-wide ${advances ? 'text-emerald-300/80' : 'text-text-secondary'}`}>
                    {advancementEnabled ? (advances ? 'Проходит в R2' : 'Резерв') : `${row.played} игр · ${row.pointsFor}:${row.pointsAgainst}`}
                  </span>
                </span>
                <span className="whitespace-nowrap text-xs text-text-secondary">
                  <strong className="text-white">{row.wins}</strong>/{row.played}
                </span>
                <strong className={`min-w-10 rounded-lg px-2 py-1 text-center text-xs ${row.pointDiff > 0 ? 'bg-emerald-400/10 text-emerald-300' : row.pointDiff < 0 ? 'bg-red-400/10 text-red-300' : 'bg-white/5 text-text-secondary'}`}>
                  {row.pointDiff > 0 ? '+' : ''}{row.pointDiff}
                </strong>
                <span aria-hidden="true" className={`text-xs text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`}>⌄</span>
              </button>
              {expanded ? (
                <PlayerGameHistory
                  id={historyId}
                  bundle={bundle}
                  playerId={row.playerId}
                  games={games}
                  results={results}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function PlayerGameHistory({
  id,
  bundle,
  playerId,
  games,
  results,
}: {
  id: string;
  bundle: IndividualMixOfflineBundle;
  playerId: string;
  games: IndividualMixGame[];
  results: Record<string, IndividualMixGameResult>;
}) {
  const playerGames = games.filter((game) => (
    game.left.maleId === playerId
    || game.left.femaleId === playerId
    || game.right.maleId === playerId
    || game.right.femaleId === playerId
  ));
  const gameViews = playerGames.map((game) => {
    const isLeft = game.left.maleId === playerId || game.left.femaleId === playerId;
    const ownTeam = isLeft ? game.left : game.right;
    const opponentTeam = isLeft ? game.right : game.left;
    const partnerId = ownTeam.maleId === playerId ? ownTeam.femaleId : ownTeam.maleId;
    const result = results[game.id];
    const ownScore = result ? (isLeft ? result.leftScore : result.rightScore) : null;
    const opponentScore = result ? (isLeft ? result.rightScore : result.leftScore) : null;
    return { game, partnerId, opponentTeam, result, ownScore, opponentScore, won: result ? ownScore! > opponentScore! : false };
  });
  const completed = gameViews.filter((view) => view.result && view.ownScore !== null && view.opponentScore !== null);
  const wins = completed.filter((view) => view.won).length;
  const winRate = completed.length ? Math.round((wins / completed.length) * 100) : 0;
  const totalDiff = completed.reduce((sum, view) => sum + view.ownScore! - view.opponentScore!, 0);
  const averageDiff = completed.length ? totalDiff / completed.length : 0;
  const averagePoints = completed.length ? completed.reduce((sum, view) => sum + view.ownScore!, 0) / completed.length : 0;
  const closeGames = completed.filter((view) => Math.abs(view.ownScore! - view.opponentScore!) <= 3);
  const closeWins = closeGames.filter((view) => view.won).length;
  let longestWinStreak = 0;
  let currentWinStreak = 0;
  for (const view of completed) {
    currentWinStreak = view.won ? currentWinStreak + 1 : 0;
    longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
  }
  const partnerMap = new Map<string, { games: number; wins: number; pointDiff: number }>();
  for (const view of completed) {
    const stats = partnerMap.get(view.partnerId) ?? { games: 0, wins: 0, pointDiff: 0 };
    stats.games += 1;
    stats.wins += view.won ? 1 : 0;
    stats.pointDiff += view.ownScore! - view.opponentScore!;
    partnerMap.set(view.partnerId, stats);
  }
  const partnerRows = [...partnerMap.entries()]
    .map(([partnerId, stats]) => ({ partnerId, ...stats, winRate: Math.round((stats.wins / stats.games) * 100) }))
    .sort((left, right) => right.winRate - left.winRate || right.games - left.games || right.pointDiff - left.pointDiff);
  const bestPartner = partnerRows[0];

  return (
    <div id={id} className="border-t border-white/[0.07] bg-[#090f18] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand">Статистика игрока</p>
        <span className="text-[10px] text-text-secondary">{completed.length} сыграно</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <PlayerStatTile label="Победы" value={completed.length ? `${winRate}%` : '—'} note={`${wins}/${completed.length}`} tone="green" />
        <PlayerStatTile label="Средние мячи" value={completed.length ? averagePoints.toFixed(1) : '—'} note={`${averageDiff >= 0 ? '+' : ''}${averageDiff.toFixed(1)} за игру`} tone={averageDiff >= 0 ? 'green' : 'red'} />
        <PlayerStatTile label="Лучшая серия" value={completed.length ? `${longestWinStreak}` : '—'} note="побед подряд" tone="cyan" />
        <PlayerStatTile label="Концовки ≤3" value={closeGames.length ? `${Math.round((closeWins / closeGames.length) * 100)}%` : '—'} note={`${closeWins}/${closeGames.length} побед`} tone="cyan" />
      </div>

      {bestPartner ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.07] px-3 py-2.5">
          <span className="min-w-0">
            <span className="block text-[9px] font-black uppercase tracking-wide text-cyan-300">Лучший партнёр</span>
            <strong className="block truncate text-sm text-white">{playerName(bundle, bestPartner.partnerId)}</strong>
          </span>
          <span className="text-right">
            <strong className="block text-lg text-cyan-300">{bestPartner.winRate}%</strong>
            <span className="block text-[9px] text-text-secondary">{bestPartner.wins}/{bestPartner.games} побед · {bestPartner.pointDiff >= 0 ? '+' : ''}{bestPartner.pointDiff}</span>
          </span>
        </div>
      ) : null}

      {partnerRows.length ? (
        <div className="mt-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">Эффективность с партнёрами</p>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            {partnerRows.map((partner) => (
              <div key={partner.partnerId} className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-2.5 py-2">
                <span className="min-w-0">
                  <strong className="block truncate text-[11px] text-white">{playerName(bundle, partner.partnerId)}</strong>
                  <span className="block text-[9px] text-text-secondary">{partner.wins}/{partner.games} побед · {partner.pointDiff >= 0 ? '+' : ''}{partner.pointDiff}</span>
                </span>
                <strong className={`text-sm ${partner.winRate >= 50 ? 'text-emerald-300' : 'text-red-300'}`}>{partner.winRate}%</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-2 mt-4 flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">Все игры</p>
        <span className="text-[10px] text-text-secondary">партнёр выделен отдельно</span>
      </div>
      <ol className="space-y-1.5">
        {gameViews.map((view) => {
          return (
            <li key={view.game.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-2.5 py-2">
              <span className={`grid h-7 min-w-7 place-items-center rounded-lg px-1.5 text-[10px] font-black ${!view.result ? 'bg-white/5 text-text-secondary' : view.won ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'}`}>
                {!view.result ? '—' : view.won ? 'В' : 'П'}
              </span>
              <span className="min-w-0">
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-cyan-400/10 px-2 py-1 text-cyan-200">
                  <span className="text-[8px] font-black uppercase tracking-wide opacity-70">Партнёр</span>
                  <strong className="truncate text-[11px]">{playerName(bundle, view.partnerId)}</strong>
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-text-secondary">
                  Соперники: {playerName(bundle, view.opponentTeam.maleId)} + {playerName(bundle, view.opponentTeam.femaleId)}
                </span>
                <span className="mt-0.5 block text-[9px] text-text-secondary/70">
                  Раунд {view.game.roundNo} · дуэль {view.game.duelNo} · игра {view.game.gameNo}
                </span>
              </span>
              <span className="text-right">
                <strong className={`block whitespace-nowrap text-sm ${!view.result ? 'text-text-secondary' : view.won ? 'text-emerald-300' : 'text-red-300'}`}>
                  {view.result ? `${view.ownScore}:${view.opponentScore}` : 'Не сыграна'}
                </strong>
                {view.result?.kind && view.result.kind !== 'played' ? <span className="block text-[8px] uppercase text-amber-300">Тех. исход</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PlayerStatTile({ label, value, note, tone }: { label: string; value: string; note: string; tone: 'green' | 'red' | 'cyan' }) {
  const toneClass = tone === 'green' ? 'text-emerald-300' : tone === 'red' ? 'text-red-300' : 'text-cyan-300';
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-2.5 py-2">
      <span className="block text-[8px] font-black uppercase tracking-wide text-text-secondary">{label}</span>
      <strong className={`mt-0.5 block text-lg leading-none ${toneClass}`}>{value}</strong>
      <span className="mt-1 block truncate text-[8px] text-text-secondary">{note}</span>
    </div>
  );
}

function PlayoffPreview({ bundle, complete, busy, onLock }: { bundle: IndividualMixOfflineBundle; complete: boolean; busy: boolean; onLock: () => void }) {
  const locked = Boolean(bundle.playoffLockedAt && bundle.playoffFormatVersion === PLAYOFF_FORMAT_VERSION);
  const divisions = buildIndividualMixSeededDivisions({
    schedules: bundle.schedules,
    results: Object.values(bundle.results),
  });
  return <div className="space-y-4">{!complete ? <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">Предварительный посев. Зафиксировать второй этап можно после заполнения всех результатов.</div> : locked ? <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-100">Второй этап зафиксирован {new Date(bundle.playoffLockedAt!).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })} и сохранён на устройстве.</div> : <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-100">Все результаты внесены. Дивизионы готовы к проверке и фиксации.</div>}{divisions.map((division) => {
    const rows = [...division.men, ...division.women];
    return (
      <section key={division.id} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045]">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">Дивизион второго этапа</p>
            <h3 className="mt-0.5 text-xl font-black">{division.name} · пары</h3>
          </div>
          <div className="text-right">
            <span className="block rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-cyan-300">Корт {division.courtNo}</span>
            <span className="mt-1 block text-[9px] font-bold uppercase tracking-wide text-text-secondary">Обратный посев</span>
          </div>
        </header>
        <div className="m-3 overflow-hidden rounded-2xl border border-white/10 bg-black/15 md:m-4">
          {division.bracket.pairs.map((pair) => {
            const maleRow = rows.find((row) => row.playerId === pair.maleId);
            const femaleRow = rows.find((row) => row.playerId === pair.femaleId);
            if (!maleRow || !femaleRow) return null;
            return (
              <article key={pair.id} className="border-b border-white/[0.07] last:border-b-0 md:grid md:grid-cols-[minmax(15rem,.9fr)_minmax(22rem,1.1fr)]">
                <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5 md:border-r md:border-white/[0.07]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand text-xs font-black text-white shadow-md shadow-orange-950/40">
                    {pair.seedNo}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">
                      {playerName(bundle, pair.maleId)} + {playerName(bundle, pair.femaleId)}
                    </p>
                    <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-text-secondary">
                      Посев дивизиона: М{maleRow.divisionSeed} + Ж{femaleRow.divisionSeed}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 border-t border-white/[0.07] md:border-t-0">
                  <PlayoffSourceRow bundle={bundle} row={maleRow} label={`М${maleRow.divisionSeed}`} />
                  <PlayoffSourceRow bundle={bundle} row={femaleRow} label={`Ж${femaleRow.divisionSeed}`} />
                </div>
              </article>
            );
          })}
        </div>
        <p className="border-t border-white/10 px-4 py-3 text-xs leading-5 text-text-secondary">
          Игроки собраны по местам квалификационных групп и показателям при равенстве. Пары: М1 + Ж4, М2 + Ж3, М3 + Ж2, М4 + Ж1. Полуфиналы: пары 1–4 и 2–3.
        </p>
      </section>
    );
  })}<button type="button" onClick={onLock} disabled={!complete || locked || busy} className={`min-h-14 w-full rounded-2xl text-base font-black text-white disabled:cursor-not-allowed ${locked ? 'bg-emerald-600 opacity-100' : 'bg-brand disabled:opacity-35'}`}>{locked ? 'Второй этап зафиксирован' : busy ? 'Сохраняем…' : 'Зафиксировать второй этап'}</button></div>;
}

function PlayoffSourceRow({
  bundle,
  row,
  label,
}: {
  bundle: IndividualMixOfflineBundle;
  row: IndividualMixDivisionEntry;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 border-r border-white/[0.07] bg-[#0d1420] px-2 py-2 last:border-r-0 md:px-3">
      <span className="grid h-6 min-w-7 place-items-center rounded-lg border border-white/10 bg-white/5 px-1 text-[9px] font-black text-cyan-300">
        {label}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-black md:text-xs">{playerName(bundle, row.playerId)}</span>
        <span className="mt-0.5 block truncate text-[9px] font-bold text-cyan-300/80">
          Группа {row.poolCourtNo} · {row.poolRank} место
        </span>
        <span className="mt-0.5 block truncate text-[9px] text-text-secondary">
          {row.wins}/{row.played} · {row.pointsFor} оч.
        </span>
      </span>
      <strong className={`rounded-lg px-1.5 py-1 text-[10px] md:px-2 md:text-xs ${row.pointDiff >= 0 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'}`}>
        {row.pointDiff > 0 ? '+' : ''}{row.pointDiff}
      </strong>
    </div>
  );
}
