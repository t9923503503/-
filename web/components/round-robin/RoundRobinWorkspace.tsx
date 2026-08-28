'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QuickWinnerScoreInput } from '@/components/QuickWinnerScoreInput';
import {
  isHardCapSetFinished,
  proposeFixedTeams,
  seedRrGroups,
} from '@/lib/round-robin/core';
import {
  enqueueRrJudgeEvent,
  listRrJudgeEvents,
  removeRrJudgeEvent,
} from '@/lib/round-robin/offline-queue';
import type {
  RrInitializeInput,
  RrJudgeActionName,
  RrJudgeSnapshot,
  RrMatch,
  RrMatchFormat,
  RrOperatorActionName,
  RrPairing,
  RrQueuedJudgeEvent,
  RrScoringMode,
  RrTeam,
} from '@/lib/round-robin';

type WorkspaceTab = 'schedule' | 'standings' | 'teams' | 'playoff';
type SyncState = 'online' | 'offline' | 'syncing' | 'conflict';
type RrPlayerSearchRow = { id: string; name: string; gender: 'M' | 'W'; activityCount?: number };

function estimatedMatchMinutes(format: RrMatchFormat): number {
  if (format.code === 'single11') return 14;
  if (format.code === 'single15') return 19;
  if (format.code === 'single21') return 25;
  if (format.code === 'bo3_21_15') return 48;
  return Math.max(5, Math.min(180, format.durationMinutes ?? 15)) + 2;
}

function durationLabel(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (!hours) return `${rest} мин`;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

function estimateGroupSchedule(teamCount: number, groupCount: number, courtCount: number): { matches: number; waves: number } {
  if (teamCount < 2) return { matches: 0, waves: 0 };
  const groups = Math.max(1, Math.min(groupCount, teamCount));
  const baseSize = Math.floor(teamCount / groups);
  const largerGroups = teamCount % groups;
  const matches: Array<[number, number]> = [];
  let offset = 0;
  for (let groupIndex = 0; groupIndex < groups; groupIndex += 1) {
    const size = baseSize + (groupIndex < largerGroups ? 1 : 0);
    for (let left = 0; left < size; left += 1) for (let right = left + 1; right < size; right += 1) matches.push([offset + left, offset + right]);
    offset += size;
  }
  const remaining = [...matches];
  let waves = 0;
  while (remaining.length) {
    const used = new Set<number>();
    const selected: number[] = [];
    for (let index = 0; index < remaining.length && selected.length < Math.max(1, courtCount); index += 1) {
      const [left, right] = remaining[index];
      if (used.has(left) || used.has(right)) continue;
      used.add(left); used.add(right); selected.push(index);
    }
    for (let index = selected.length - 1; index >= 0; index -= 1) remaining.splice(selected[index], 1);
    waves += 1;
  }
  return { matches: matches.length, waves };
}

function TimeEstimate({ teamCount, groupCount, courtCount, groupFormat, playoffFormat }: { teamCount: number; groupCount: number; courtCount: number; groupFormat: RrMatchFormat; playoffFormat: RrMatchFormat }) {
  const groups = estimateGroupSchedule(teamCount, groupCount, courtCount);
  const playoffMatches = teamCount >= 4 ? 4 : teamCount >= 2 ? 1 : 0;
  const playoffWaves = playoffMatches === 4 ? 2 * Math.ceil(2 / Math.max(1, courtCount)) : playoffMatches;
  const groupMinutes = groups.waves * estimatedMatchMinutes(groupFormat);
  const playoffMinutes = playoffWaves * estimatedMatchMinutes(playoffFormat);
  const total = groupMinutes + playoffMinutes + (groups.matches && playoffMatches ? 10 : 0);
  const withReserve = Math.ceil(total * 1.15 / 5) * 5;
  return <section className="mt-4 rounded-2xl border border-[#e0c99e] bg-[#fff8e9] p-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#a24a21]">Подсказка организатору</p><h3 className="mt-1 text-xl font-black">Турнир займёт примерно {durationLabel(total)}</h3></div><div className="rounded-xl bg-[#172033] px-4 py-2 text-white"><span className="block text-[10px] uppercase tracking-wide text-white/65">Заложить с запасом</span><strong className="text-lg">{durationLabel(withReserve)}</strong></div></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-white p-3"><span className="text-xs text-[#6e7787]">Группы</span><strong className="mt-1 block">{groups.matches} матчей · {groups.waves} волн</strong><span className="text-xs text-[#557064]">≈ {durationLabel(groupMinutes)}</span></div><div className="rounded-xl bg-white p-3"><span className="text-xs text-[#6e7787]">Плей-офф</span><strong className="mt-1 block">{playoffMatches} матча · {playoffWaves} волн</strong><span className="text-xs text-[#557064]">≈ {durationLabel(playoffMinutes)}</span></div><div className="rounded-xl bg-white p-3"><span className="text-xs text-[#6e7787]">Одновременно</span><strong className="mt-1 block">До {courtCount} матчей</strong><span className="text-xs text-[#557064]">Смена команд включена</span></div></div>
    <p className="mt-3 text-xs leading-5 text-[#6f604d]">Ориентир на матч: до 11 — 12 минут, до 15 — 17, до 21 — 23, BO3 — 45. В каждую волн добавлено 2–3 минуты на смену команд.</p>
  </section>;
}

const FORMAT_OPTIONS: Array<{ code: RrMatchFormat['code']; label: string }> = [
  { code: 'single11', label: '1 сет до 11' },
  { code: 'single15', label: '1 сет до 15' },
  { code: 'single21', label: '1 сет до 21' },
  { code: 'bo3_21_15', label: 'BO3 · 21/21/15' },
  { code: 'timed', label: 'По времени' },
];

const STAGE_LABELS: Record<RrJudgeSnapshot['stage'], string> = {
  setup: 'Формирование',
  groups_ready: 'Группы готовы',
  groups_live: 'Групповой этап',
  groups_finished: 'Группы завершены',
  playoff_preview: 'Проверка плей-офф',
  playoff_ready: 'Плей-офф готов',
  playoff_live: 'Плей-офф',
  finished: 'Завершён',
};

function eventId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `rr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function teamTitle(team: RrTeam | undefined): string {
  return team ? `${team.player1.name} + ${team.player2.name}` : 'Команда определяется';
}

function validGroupCounts(teamCount: number): number[] {
  return [1, 2, 3, 4].filter((count) => teamCount >= count * 3 && teamCount <= count * 8);
}

function countLabel(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
  return `${count} ${word}`;
}

function formatLabel(format: RrMatchFormat): string {
  const option = FORMAT_OPTIONS.find((row) => row.code === format.code);
  if (format.code === 'timed') return `${format.durationMinutes ?? 15} минут`;
  return option?.label ?? format.code;
}

function stateColor(state: SyncState): string {
  if (state === 'offline' || state === 'conflict') return 'bg-[#e1493e]';
  if (state === 'syncing') return 'bg-[#e5a425]';
  return 'bg-[#158466]';
}

function syncLabel(state: SyncState, pending: number): string {
  if (state === 'conflict') return 'Нужна сверка';
  if (state === 'offline') return pending ? `Офлайн · ${pending}` : 'Офлайн';
  if (state === 'syncing') return `Синхронизация · ${pending}`;
  return 'Онлайн';
}

function cloneSnapshot(snapshot: RrJudgeSnapshot): RrJudgeSnapshot {
  return {
    ...snapshot,
    teams: snapshot.teams.map((team) => ({ ...team, player1: { ...team.player1 }, player2: { ...team.player2 } })),
    groups: snapshot.groups.map((group) => ({ ...group, teamIds: [...group.teamIds] })),
    courts: snapshot.courts.map((court) => ({ ...court })),
    matches: snapshot.matches.map((match) => ({ ...match, scoreA: [...match.scoreA], scoreB: [...match.scoreB], format: { ...match.format } })),
    standings: snapshot.standings.map((row) => ({ ...row })),
  };
}

function applyOptimisticAction(snapshot: RrJudgeSnapshot, matchId: string, action: RrJudgeActionName, payload: Record<string, unknown> = {}): RrJudgeSnapshot {
  const next = cloneSnapshot(snapshot);
  const match = next.matches.find((row) => row.id === matchId);
  if (!match) return snapshot;
  match.version += 1;
  if (action === 'start' || action === 'resume') match.status = 'live';
  if (action === 'pause') { match.status = 'paused'; match.timerRunning = false; }
  if (action === 'serve_a' || action === 'serve_b') {
    match.serving = action === 'serve_a' ? 'a' : 'b';
    if (match.status === 'scheduled' || match.status === 'ready') match.status = 'live';
  }
  if (action === 'timer_start') { match.status = 'live'; match.timerRunning = true; }
  if (action === 'timer_pause') match.timerRunning = false;
  if (action === 'point_a' || action === 'point_b') {
    if (match.status === 'scheduled' || match.status === 'ready' || match.status === 'paused') match.status = 'live';
    const setIndex = Math.max(match.scoreA.length, match.scoreB.length) - 1;
    if (action === 'point_a') match.scoreA[setIndex] = (match.scoreA[setIndex] ?? 0) + 1;
    else match.scoreB[setIndex] = (match.scoreB[setIndex] ?? 0) + 1;
    if (match.format.code !== 'timed' && isHardCapSetFinished(match.format, setIndex, match.scoreA[setIndex], match.scoreB[setIndex])) {
      const aWon = match.scoreA[setIndex] > match.scoreB[setIndex];
      if (aWon) match.setsA += 1; else match.setsB += 1;
      if (match.format.code !== 'bo3_21_15' || match.setsA >= 2 || match.setsB >= 2) {
        match.status = 'finished';
        match.winnerId = aWon ? match.teamAId : match.teamBId;
      } else {
        match.scoreA.push(0);
        match.scoreB.push(0);
      }
    }
  }
  if (action === 'quick_result') {
    const scoreA = Number(payload.scoreA);
    const scoreB = Number(payload.scoreB);
    if (Number.isFinite(scoreA) && Number.isFinite(scoreB) && scoreA !== scoreB) {
      match.scoreA = [scoreA];
      match.scoreB = [scoreB];
      match.setsA = scoreA > scoreB ? 1 : 0;
      match.setsB = scoreB > scoreA ? 1 : 0;
      match.winnerId = scoreA > scoreB ? match.teamAId : match.teamBId;
      match.status = 'finished';
    }
  }
  return next;
}

function MatchFormatField({ label, value, onChange }: { label: string; value: RrMatchFormat; onChange: (value: RrMatchFormat) => void }) {
  return (
    <fieldset className="rounded-2xl border border-[#d8d2c6] bg-white p-4">
      <legend className="px-2 text-sm font-bold text-[#172033]">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {FORMAT_OPTIONS.map((option) => (
          <button key={option.code} type="button" onClick={() => onChange({ code: option.code, ...(option.code === 'timed' ? { durationMinutes: value.durationMinutes ?? 15 } : {}) })}
            className={`min-h-12 rounded-xl border px-3 text-left text-sm font-semibold ${value.code === option.code ? 'border-[#e65324] bg-[#fff0e8] text-[#a72f0a]' : 'border-[#d8d2c6] text-[#3c4658]'}`}>
            {option.label}
          </button>
        ))}
      </div>
      {value.code === 'timed' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {[12, 15, 20].map((minutes) => (
            <button key={minutes} type="button" onClick={() => onChange({ code: 'timed', durationMinutes: minutes })}
              className={`min-h-11 min-w-16 rounded-xl border font-bold ${value.durationMinutes === minutes ? 'border-[#158466] bg-[#e6f7f1] text-[#0f6b53]' : 'border-[#d8d2c6]'}`}>{minutes}</button>
          ))}
          <input type="number" min={1} max={180} value={value.durationMinutes ?? 15} onChange={(event) => onChange({ code: 'timed', durationMinutes: Math.max(1, Number(event.target.value) || 1) })}
            aria-label="Своя длительность матча" className="min-h-11 w-24 rounded-xl border border-[#d8d2c6] px-3" />
        </div>
      ) : null}
    </fieldset>
  );
}

function SetupWorkspace({ snapshot, onReady }: { snapshot: RrJudgeSnapshot; onReady: (snapshot: RrJudgeSnapshot) => void }) {
  const [pairs, setPairs] = useState<RrPairing[]>(() => proposeFixedTeams(snapshot.availablePlayers, snapshot.tournament.division, 'roster'));
  const allowedGroupCounts = useMemo(() => validGroupCounts(pairs.length), [pairs.length]);
  const [groupCount, setGroupCount] = useState(() => allowedGroupCounts.includes(snapshot.config.groupCount) ? snapshot.config.groupCount : allowedGroupCounts[0] ?? 1);
  const [courtCount, setCourtCount] = useState(snapshot.config.courtCount);
  const [customCourts, setCustomCourts] = useState(snapshot.config.courtCount > 4 ? snapshot.config.courtCount : 5);
  const [playoffMode, setPlayoffMode] = useState(() => allowedGroupCounts.includes(2) ? snapshot.config.playoffMode : 'all_levels');
  const [seedingMode, setSeedingMode] = useState(snapshot.config.seedingMode);
  const [groupFormat, setGroupFormat] = useState(snapshot.config.groupMatchFormat);
  const [playoffFormat, setPlayoffFormat] = useState(snapshot.config.playoffMatchFormat);
  const [scoringMode, setScoringMode] = useState<RrScoringMode>(() => snapshot.config.groupMatchFormat.scoringMode === 'referee' ? 'referee' : 'quick');
  const [manualGroupByTeam, setManualGroupByTeam] = useState<number[]>(() => pairs.map((_, index) => index % snapshot.config.groupCount));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [addTeamSlot, setAddTeamSlot] = useState<0 | 1>(0);
  const [addTeamSearch, setAddTeamSearch] = useState('');
  const [addTeamResults, setAddTeamResults] = useState<RrPlayerSearchRow[]>([]);
  const [addTeamResultsLoading, setAddTeamResultsLoading] = useState(false);
  const [newTeamPlayers, setNewTeamPlayers] = useState<[RrPlayerSearchRow | null, RrPlayerSearchRow | null]>([null, null]);
  const [addingTeam, setAddingTeam] = useState(false);
  const playersById = useMemo(() => new Map(snapshot.availablePlayers.map((player) => [player.id, player])), [snapshot.availablePlayers]);
  const assigned = useMemo(() => new Set(pairs.flatMap((pair) => [pair.player1Id, pair.player2Id]).filter(Boolean)), [pairs]);
  const errors = useMemo(() => pairs.map((pair) => {
    const first = playersById.get(pair.player1Id);
    const second = playersById.get(pair.player2Id);
    if (!first || !second) return 'Заполните обе позиции.';
    if (first.id === second.id) return 'Игрок выбран дважды.';
    if (snapshot.tournament.division === 'mixed' && (first.gender !== 'M' || second.gender !== 'W')) return 'Слева выберите мужчину, справа женщину.';
    if (snapshot.tournament.division === 'male' && (first.gender !== 'M' || second.gender !== 'M')) return 'Нужны два мужчины.';
    if (snapshot.tournament.division === 'female' && (first.gender !== 'W' || second.gender !== 'W')) return 'Нужны две женщины.';
    return null;
  }), [pairs, playersById, snapshot.tournament.division]);
  const duplicateCount = assigned.size !== pairs.length * 2;
  const previewTeams = useMemo(() => pairs.map((pair, index) => ({
    id: String(index + 1), seed: index + 1,
    rating: (playersById.get(pair.player1Id)?.rating ?? 0) + (playersById.get(pair.player2Id)?.rating ?? 0),
  })), [pairs, playersById]);
  const groupPreview = useMemo(() => {
    if (seedingMode === 'manual') {
      const manual = Array.from({ length: groupCount }, () => [] as typeof previewTeams);
      previewTeams.forEach((team, index) => manual[Math.max(0, Math.min(groupCount - 1, manualGroupByTeam[index] ?? index % groupCount))].push(team));
      return manual;
    }
    return seedRrGroups(previewTeams, groupCount, seedingMode, 20260811);
  }, [groupCount, manualGroupByTeam, previewTeams, seedingMode]);

  useEffect(() => {
    if (allowedGroupCounts.includes(groupCount)) return;
    const nextGroupCount = allowedGroupCounts[0] ?? 1;
    setGroupCount(nextGroupCount);
    if (nextGroupCount !== 2 && playoffMode === 'championship') setPlayoffMode('all_levels');
  }, [allowedGroupCounts, groupCount, playoffMode]);

  function changePair(index: number, key: 'player1Id' | 'player2Id', value: string) {
    setPairs((current) => current.map((pair, pairIndex) => pairIndex === index ? { ...pair, [key]: value } : pair));
  }

  async function initialize() {
    setMessage(null);
    if (errors.some(Boolean) || duplicateCount) { setMessage('Исправьте составы команд: каждый игрок должен быть назначен ровно один раз.'); return; }
    if (pairs.length < groupCount * 3 || pairs.length > groupCount * 8) { setMessage(`Для ${groupCount} групп требуется от ${groupCount * 3} до ${groupCount * 8} команд.`); return; }
    if (groupPreview.some((group) => group.length < 3 || group.length > 8)) { setMessage('В каждой группе должно быть от 3 до 8 команд.'); return; }
    const input: RrInitializeInput = {
      teams: pairs,
      groupCount,
      courtCount,
      playoffMode,
      seedingMode,
      groupMatchFormat: { ...groupFormat, scoringMode },
      playoffMatchFormat: { ...playoffFormat, scoringMode },
      ...(seedingMode === 'manual' ? { manualGroups: groupPreview.map((group) => group.map((team) => String(team.seed))) } : {}),
    };
    setPending(true);
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(snapshot.tournament.id)}/rr-action`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'initialize', payload: input }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data.message ?? 'Не удалось сформировать турнир.'));
      onReady(data as RrJudgeSnapshot);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сформировать турнир.');
    } finally { setPending(false); }
  }

  const requiredText = snapshot.tournament.division === 'mixed'
    ? 'Каждая команда: 1 мужчина + 1 женщина'
    : snapshot.tournament.division === 'female' ? 'Каждая команда: 2 женщины' : 'Каждая команда: 2 мужчины';
  const slotLabels = snapshot.tournament.division === 'mixed'
    ? ['Мужчина', 'Женщина']
    : snapshot.tournament.division === 'female' ? ['Женщина 1', 'Женщина 2'] : ['Мужчина 1', 'Мужчина 2'];
  const slotGenders = snapshot.tournament.division === 'mixed'
    ? ['M', 'W'] as const
    : snapshot.tournament.division === 'female' ? ['W', 'W'] as const : ['M', 'M'] as const;
  const activeAddTeamGender = slotGenders[addTeamSlot];

  useEffect(() => {
    if (!addTeamOpen) {
      setAddTeamResults([]);
      setAddTeamResultsLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setAddTeamResultsLoading(true);
      try {
        const query = addTeamSearch.trim();
        const url = query.length >= 2
          ? `/api/admin/players?q=${encodeURIComponent(query)}`
          : `/api/admin/tournaments/${encodeURIComponent(snapshot.tournament.id)}/rr-setup-team?gender=${activeAddTeamGender}`;
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal }).catch(() => null);
        if (!response?.ok) { setAddTeamResults([]); return; }
        const data = await response.json().catch(() => []);
        if (!Array.isArray(data)) { setAddTeamResults([]); return; }
        const rosterIds = new Set(snapshot.availablePlayers.map((player) => player.id));
        setAddTeamResults(data
          .filter((row): row is RrPlayerSearchRow => Boolean(row && typeof row.id === 'string' && typeof row.name === 'string' && (row.gender === 'M' || row.gender === 'W')))
          .filter((player) => player.gender === activeAddTeamGender && !rosterIds.has(player.id) && !newTeamPlayers.some((selected) => selected?.id === player.id))
          .slice(0, query.length >= 2 ? 12 : 10));
      } finally {
        setAddTeamResultsLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [activeAddTeamGender, addTeamOpen, addTeamSearch, addTeamSlot, newTeamPlayers, snapshot.availablePlayers, snapshot.tournament.id]);

  function chooseNewTeamPlayer(player: RrPlayerSearchRow) {
    setNewTeamPlayers((current) => current.map((selected, index) => index === addTeamSlot ? player : selected) as [RrPlayerSearchRow | null, RrPlayerSearchRow | null]);
    const otherSlot = addTeamSlot === 0 ? 1 : 0;
    if (!newTeamPlayers[otherSlot]) setAddTeamSlot(otherSlot);
    setAddTeamSearch('');
    setAddTeamResults([]);
  }

  async function addTeam() {
    const [first, second] = newTeamPlayers;
    if (!first || !second) return;
    setAddingTeam(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(snapshot.tournament.id)}/rr-setup-team`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ player1Id: first.id, player2Id: second.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data.message ?? 'Не удалось добавить команду.'));
      setPairs((current) => [...current, { player1Id: first.id, player2Id: second.id }]);
      setNewTeamPlayers([null, null]);
      setAddTeamSearch('');
      setAddTeamOpen(false);
      onReady(data as RrJudgeSnapshot);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось добавить команду.');
    } finally {
      setAddingTeam(false);
    }
  }

  return (
    <main className="round-robin-workspace min-h-screen bg-[#f4f1ea] px-3 py-5 pb-32 text-[#172033] sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-3xl bg-[#172033] px-5 py-6 text-white sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#ff8a5f]">Round Robin Next</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">Сформируйте фиксированные команды</h1>
          <p className="mt-3 max-w-3xl text-sm text-white/70">{snapshot.tournament.name} · {requiredText}. Автосборка ничего не запускает без вашего подтверждения.</p>
        </header>

        <section className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-[#d8d2c6] bg-[#fffdf8] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e65324]">1 · Команды</p><h2 className="mt-1 text-2xl font-black">Две явные позиции</h2></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setAddTeamOpen((open) => !open)} className="min-h-11 rounded-xl bg-[#172033] px-3 text-sm font-bold text-white">+ Добавить команду</button>
                <button type="button" onClick={() => setPairs(proposeFixedTeams(snapshot.availablePlayers, snapshot.tournament.division, 'roster'))} className="min-h-11 rounded-xl border border-[#d8d2c6] px-3 text-sm font-bold">По списку</button>
                <button type="button" onClick={() => setPairs(proposeFixedTeams(snapshot.availablePlayers, snapshot.tournament.division, 'rating'))} className="min-h-11 rounded-xl border border-[#d8d2c6] px-3 text-sm font-bold">По рейтингу</button>
              </div>
            </div>
            {addTeamOpen ? <section className="mt-4 rounded-2xl border-2 border-[#158466] bg-[#eefaf5] p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-black">Новая команда</h3><p className="text-xs text-[#557064]">Выберите двух новых участников. Вместимость турнира увеличится автоматически.</p></div><button type="button" onClick={() => { setAddTeamOpen(false); setAddTeamSearch(''); setAddTeamResults([]); setNewTeamPlayers([null, null]); }} className="min-h-10 rounded-lg border border-[#a9cfc1] px-3 text-sm font-bold">Закрыть</button></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{([0, 1] as const).map((slot) => <button key={slot} type="button" onClick={() => { setAddTeamSlot(slot); setAddTeamSearch(''); setAddTeamResults([]); }} className={`min-h-16 rounded-xl border bg-white p-3 text-left ${addTeamSlot === slot ? 'border-[#158466]' : 'border-[#c7ded5]'}`}><span className="block text-xs font-bold uppercase tracking-wide text-[#557064]">{slotLabels[slot]}</span><strong className="mt-1 block">{newTeamPlayers[slot]?.name ?? 'Не выбран'}</strong></button>)}</div>
              <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-[#557064]">Поиск: {slotLabels[addTeamSlot]}
                <input value={addTeamSearch} onChange={(event) => setAddTeamSearch(event.target.value)} placeholder="Введите фамилию или выберите ниже" className="mt-1 min-h-12 w-full rounded-xl border border-[#a9cfc1] bg-white px-3 text-sm normal-case text-[#172033] outline-none focus:border-[#158466]" />
              </label>
              <div className="mt-2"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#557064]">{addTeamSearch.trim().length >= 2 ? 'Результаты поиска' : 'Часто играют · топ-10'}</p><div className="max-h-64 space-y-1 overflow-y-auto">{addTeamResults.map((player) => <button key={player.id} type="button" onClick={() => chooseNewTeamPlayer(player)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#c7ded5] bg-white px-3 text-left text-sm"><strong className="min-w-0 truncate">{player.name}</strong><span className="shrink-0 text-xs font-bold text-[#158466]">{player.activityCount != null ? countLabel(player.activityCount, 'турнир', 'турнира', 'турниров') : 'Выбрать'}</span></button>)}{addTeamResultsLoading ? <p className="rounded-xl border border-dashed border-[#c7ded5] bg-white px-3 py-4 text-center text-sm text-[#557064]">Загружаем игроков…</p> : !addTeamResults.length ? <p className="rounded-xl border border-dashed border-[#c7ded5] bg-white px-3 py-4 text-center text-sm text-[#557064]">Подходящих новых игроков не найдено.</p> : null}</div></div>
              <button type="button" disabled={addingTeam || newTeamPlayers.some((player) => !player)} onClick={addTeam} className="mt-3 min-h-12 w-full rounded-xl bg-[#158466] px-4 font-black text-white disabled:opacity-40">{addingTeam ? 'Добавляем…' : 'Добавить команду в турнир'}</button>
            </section> : null}
            <div className="mt-4 space-y-3">
              {pairs.map((pair, index) => (
                <article key={index} className={`rounded-2xl border p-3 ${errors[index] ? 'border-[#e1493e] bg-[#fff1ef]' : 'border-[#d8d2c6] bg-white'}`}>
                  <div className="mb-2 flex items-center justify-between"><strong>Команда {index + 1}</strong><span className="text-xs text-[#6e7787]">{requiredText.replace('Каждая команда: ', '')}</span></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(['player1Id', 'player2Id'] as const).map((key, slot) => (
                      <label key={key} className="text-xs font-bold uppercase tracking-wide text-[#6e7787]">{slotLabels[slot]}
                        <select value={pair[key]} onChange={(event) => changePair(index, key, event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-[#cfc8bb] bg-white px-3 text-sm normal-case text-[#172033]">
                          <option value="">Выберите игрока</option>
                          {snapshot.availablePlayers
                            .filter((player) => player.gender === slotGenders[slot] && (!assigned.has(player.id) || player.id === pair[key]))
                            .map((player) => <option key={player.id} value={player.id}>{player.name} · {player.gender === 'M' ? 'М' : 'Ж'} · {Math.round(player.rating)}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                  {errors[index] ? <p className="mt-2 text-sm font-bold text-[#b8322a]">{errors[index]}</p> : null}
                  {seedingMode === 'manual' ? <label className="mt-2 block text-xs font-bold uppercase tracking-wide text-[#6e7787]">Группа<select value={manualGroupByTeam[index] ?? index % groupCount} onChange={(event) => setManualGroupByTeam((current) => pairs.map((_, pairIndex) => pairIndex === index ? Number(event.target.value) : current[pairIndex] ?? pairIndex % groupCount))} className="mt-1 min-h-11 w-full rounded-xl border border-[#cfc8bb] bg-white px-3 text-sm normal-case text-[#172033]">{Array.from({ length: groupCount }, (_, groupIndex) => <option key={groupIndex} value={groupIndex}>Группа {String.fromCharCode(1040 + groupIndex)}</option>)}</select></label> : null}
                </article>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-3xl border border-[#d8d2c6] bg-white p-4 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e65324]">2 · Группы и корты</p>
              <h2 className="mt-1 text-2xl font-black">Структура</h2>
              <label className="mt-4 block text-sm font-bold">Сценарий плей-офф
                <select value={playoffMode} onChange={(event) => { const value = event.target.value === 'all_levels' ? 'all_levels' : 'championship'; setPlayoffMode(value); if (value === 'championship') setGroupCount(2); }} className="mt-1 min-h-12 w-full rounded-xl border border-[#d8d2c6] px-3">
                  <option value="championship" disabled={!allowedGroupCounts.includes(2)}>Чемпионский · топ-2 из двух групп</option><option value="all_levels">{groupCount === 1 ? 'Одна группа · плей-офф по общему месту' : 'Все уровни · HARD / MEDIUM / LITE'}</option>
                </select>
              </label>
              <div className="mt-4"><span className="text-sm font-bold">Групп</span><div className="mt-2 flex gap-2">{[1, 2, 3, 4].map((count) => <button key={count} disabled={!allowedGroupCounts.includes(count) || (playoffMode === 'championship' && count !== 2)} type="button" onClick={() => setGroupCount(count)} className={`min-h-12 min-w-14 rounded-xl border text-lg font-black disabled:opacity-30 ${groupCount === count ? 'border-[#e65324] bg-[#fff0e8] text-[#a72f0a]' : 'border-[#d8d2c6]'}`}>{count}</button>)}</div><p className="mt-2 text-xs text-[#6e7787]">В каждой группе должно быть от 3 до 8 команд.</p></div>
              <div className="mt-4"><span className="text-sm font-bold">Кортов</span><div className="mt-2 flex flex-wrap gap-2">{[1, 2, 3, 4].map((count) => <button key={count} type="button" onClick={() => setCourtCount(count)} className={`min-h-12 min-w-14 rounded-xl border text-lg font-black ${courtCount === count ? 'border-[#158466] bg-[#e6f7f1] text-[#0f6b53]' : 'border-[#d8d2c6]'}`}>{count}</button>)}<label className="flex min-h-12 items-center gap-2 rounded-xl border border-[#d8d2c6] px-3 text-sm font-bold">Ещё<input type="number" min={5} max={16} value={customCourts} onChange={(event) => setCustomCourts(Math.max(5, Number(event.target.value) || 5))} onFocus={() => setCourtCount(customCourts)} onBlur={() => setCourtCount(customCourts)} className="w-12 bg-transparent text-lg font-black outline-none" /></label></div></div>
              <label className="mt-4 block text-sm font-bold">Посев
                <select value={seedingMode} onChange={(event) => setSeedingMode(event.target.value as typeof seedingMode)} className="mt-1 min-h-12 w-full rounded-xl border border-[#d8d2c6] px-3"><option value="serpentine">Змейка по рейтингу</option><option value="random">Случайная жеребьёвка</option><option value="manual">Ручной · после создания</option></select>
              </label>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">{groupPreview.map((group, index) => <div key={index} className="rounded-xl bg-[#f4f1ea] p-3"><strong>Группа {String.fromCharCode(1040 + index)}</strong><p className="mt-1 text-sm text-[#6e7787]">Команды: {group.map((team) => team.seed).join(', ') || '—'}</p></div>)}</div>
            </section>
            <section className="rounded-2xl border border-[#d8d2c6] bg-white p-4">
              <p className="text-sm font-black">Ведение матчей</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setScoringMode('referee')} className={`min-h-24 rounded-xl border p-3 text-left ${scoringMode === 'referee' ? 'border-[#158466] bg-[#eaf8f3]' : 'border-[#d8d2c6]'}`}><strong className="block">С судьёй</strong><span className="mt-1 block text-xs leading-5 text-[#6e7787]">Подача, таймер, начисление и отмена каждого очка.</span></button>
                <button type="button" onClick={() => setScoringMode('quick')} className={`min-h-24 rounded-xl border p-3 text-left ${scoringMode === 'quick' ? 'border-[#e65324] bg-[#fff0e8]' : 'border-[#d8d2c6]'}`}><strong className="block">Быстрый результат · по умолчанию</strong><span className="mt-1 block text-xs leading-5 text-[#6e7787]">Победитель получает 11/15/21, остаётся выбрать очки проигравших.</span></button>
              </div>
              {scoringMode === 'quick' ? <p className="mt-2 text-xs font-bold text-[#9a5b00]">Для BO3 и матчей по времени автоматически останется полный судейский экран.</p> : null}
            </section>
            <MatchFormatField label="Матчи в группах" value={groupFormat} onChange={setGroupFormat} />
            <MatchFormatField label="Матчи плей-офф" value={playoffFormat} onChange={setPlayoffFormat} />
          </div>
        </section>

        <TimeEstimate teamCount={pairs.length} groupCount={groupCount} courtCount={courtCount} groupFormat={groupFormat} playoffFormat={playoffFormat} />
        <section className="sticky bottom-3 mt-4 flex flex-col gap-3 rounded-2xl border border-[#d8d2c6] bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div><strong>{countLabel(pairs.length, 'команда', 'команды', 'команд')} · {countLabel(groupCount, 'группа', 'группы', 'групп')} · {countLabel(courtCount, 'корт', 'корта', 'кортов')}</strong><p className="text-xs text-[#6e7787]">{formatLabel(groupFormat)} в группах, {formatLabel(playoffFormat)} в плей-офф · {scoringMode === 'quick' ? 'быстрый результат' : 'с судьёй'}</p>{message ? <p className="mt-1 text-sm font-bold text-[#b8322a]">{message}</p> : null}</div>
          <button type="button" disabled={pending} onClick={initialize} className="min-h-14 rounded-xl bg-[#e65324] px-7 text-base font-black text-white disabled:opacity-50">{pending ? 'Формируем…' : 'Подтвердить и сформировать'}</button>
        </section>
      </div>
    </main>
  );
}

function ScorePanel({ match, teams, onAction, disabled }: { match: RrMatch; teams: Map<string, RrTeam>; onAction: (action: RrJudgeActionName, payload?: Record<string, unknown>) => void; disabled: boolean }) {
  const teamA = match.teamAId ? teams.get(match.teamAId) : undefined;
  const teamB = match.teamBId ? teams.get(match.teamBId) : undefined;
  const setIndex = Math.max(match.scoreA.length, match.scoreB.length) - 1;
  const scoreA = match.scoreA[setIndex] ?? 0;
  const scoreB = match.scoreB[setIndex] ?? 0;
  const finished = match.status === 'finished' || match.status === 'forfeit' || match.status === 'cancelled';
  const target = match.format.code === 'single11' ? 11 : match.format.code === 'single15' ? 15 : match.format.code === 'single21' ? 21 : null;
  const canFinish = target
    ? (scoreA === target && scoreB < target) || (scoreB === target && scoreA < target)
    : match.format.code === 'bo3_21_15'
      ? match.setsA >= 2 || match.setsB >= 2
      : scoreA !== scoreB;
  const [visibleSeconds, setVisibleSeconds] = useState(match.timerRemainingSec ?? 0);
  useEffect(() => { setVisibleSeconds(match.timerRemainingSec ?? 0); }, [match.id, match.timerRemainingSec]);
  useEffect(() => {
    if (!match.timerRunning || finished) return;
    const timer = window.setInterval(() => setVisibleSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [finished, match.timerRunning]);
  return (
    <article className="overflow-hidden rounded-3xl border border-[#d8d2c6] bg-white shadow-[0_18px_50px_rgba(23,32,51,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e6e0d5] bg-[#fff9ef] px-4 py-3">
        <div><span className="text-xs font-bold uppercase tracking-[0.16em] text-[#e65324]">Матч {match.matchNo}</span><p className="text-sm text-[#6e7787]">{formatLabel(match.format)} · сет {setIndex + 1}</p></div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${finished ? 'bg-[#e6f7f1] text-[#0f6b53]' : match.status === 'paused' ? 'bg-[#fff0d7] text-[#9a5b00]' : 'bg-[#eaf0ff] text-[#2d5eb7]'}`}>{finished ? 'Завершён' : match.status === 'paused' ? 'Пауза' : match.status === 'live' ? 'Идёт' : 'Готов'}</span>
      </div>
      {match.format.code === 'timed' ? <div className="flex flex-wrap items-center justify-center gap-3 border-b border-[#e6e0d5] bg-[#172033] px-4 py-3 text-white"><span className="text-3xl font-black tabular-nums">{String(Math.floor(visibleSeconds / 60)).padStart(2, '0')}:{String(visibleSeconds % 60).padStart(2, '0')}</span><button type="button" disabled={disabled || finished} onClick={() => onAction(match.timerRunning ? 'timer_pause' : 'timer_start')} className="min-h-11 rounded-xl bg-white/15 px-4 font-black">{match.timerRunning ? 'Пауза таймера' : 'Запустить таймер'}</button>{visibleSeconds === 0 && scoreA === scoreB ? <span className="rounded-full bg-[#e65324] px-3 py-2 text-sm font-black">Golden Point</span> : null}</div> : null}
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch">
        {(['a', 'b'] as const).map((side, index) => {
          const team = side === 'a' ? teamA : teamB;
          const score = side === 'a' ? scoreA : scoreB;
          return <div key={side} className={`${index ? 'order-3' : 'order-1'} flex min-w-0 flex-col items-center justify-between px-3 py-5 text-center sm:px-7`}>
            <button type="button" disabled={disabled || finished} onClick={() => onAction(side === 'a' ? 'serve_a' : 'serve_b')} className={`min-h-9 rounded-full px-3 text-xs font-black ${match.serving === side ? 'bg-[#e65324] text-white' : 'bg-[#f1eee7] text-[#6e7787]'}`}>{match.serving === side ? 'Подача' : 'Назначить подачу'}</button>
            <h3 className="mt-4 min-h-12 text-base font-black leading-tight sm:text-xl">{teamTitle(team)}</h3>
            <button type="button" disabled={disabled || finished || !team} onClick={() => onAction(side === 'a' ? 'point_a' : 'point_b')}
              className={`mt-4 flex h-36 w-full max-w-52 items-center justify-center rounded-3xl text-7xl font-black text-white shadow-lg active:scale-[0.98] disabled:opacity-40 ${side === 'a' ? 'bg-[#2463eb]' : 'bg-[#e43c35]'}`}>{score}</button>
            <p className="mt-3 text-sm font-bold text-[#6e7787]">Сеты {side === 'a' ? match.setsA : match.setsB}</p>
          </div>;
        })}
        <div className="order-2 flex items-center px-1 text-3xl font-black text-[#a6adba]">:</div>
      </div>
      <div className="grid gap-2 border-t border-[#e6e0d5] p-3 sm:grid-cols-3">
        <button type="button" disabled={disabled || finished} onClick={() => onAction('undo')} className="min-h-12 rounded-xl border border-[#d8d2c6] font-bold">↶ Отменить очко</button>
        <button type="button" disabled={disabled || finished} onClick={() => onAction(match.status === 'paused' ? 'resume' : match.status === 'live' ? 'pause' : 'start')} className="min-h-12 rounded-xl border border-[#d8d2c6] font-bold">{match.status === 'paused' ? '▶ Продолжить' : match.status === 'live' ? 'Ⅱ Пауза' : '▶ Начать'}</button>
        <button type="button" disabled={disabled || finished || !canFinish} onClick={() => onAction('finish_match')} className="min-h-12 rounded-xl bg-[#158466] px-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-40">Завершить матч</button>
      </div>
    </article>
  );
}

function quickTarget(format: RrMatchFormat): number | null {
  return format.code === 'single11' ? 11 : format.code === 'single15' ? 15 : format.code === 'single21' ? 21 : null;
}

function QuickScorePanel({ match, teams, onAction, disabled }: { match: RrMatch; teams: Map<string, RrTeam>; onAction: (action: RrJudgeActionName, payload?: Record<string, unknown>) => void; disabled: boolean }) {
  const teamA = match.teamAId ? teams.get(match.teamAId) : undefined;
  const teamB = match.teamBId ? teams.get(match.teamBId) : undefined;
  const target = quickTarget(match.format);
  if (!target) return <ScorePanel match={match} teams={teams} onAction={onAction} disabled={disabled} />;
  const finished = match.status === 'finished' || match.status === 'forfeit';
  const finalA = match.scoreA[match.scoreA.length - 1] ?? 0;
  const finalB = match.scoreB[match.scoreB.length - 1] ?? 0;
  return <article className="overflow-hidden rounded-3xl border border-[#d8d2c6] bg-white shadow-[0_18px_50px_rgba(23,32,51,0.08)]">
    <div className="flex items-center justify-between gap-2 border-b border-[#e6e0d5] bg-[#fff9ef] px-4 py-3"><div><span className="text-xs font-bold uppercase tracking-[0.16em] text-[#e65324]">Матч {match.matchNo}</span><p className="text-sm text-[#6e7787]">Быстрый результат · игра до {target}</p></div><span className="rounded-full bg-[#eaf0ff] px-3 py-1 text-xs font-black text-[#2d5eb7]">{finished ? 'Завершён' : 'Готов'}</span></div>
    {finished ? <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-5 text-center"><div><strong className="block text-lg">{teamTitle(teamA)}</strong><span className="mt-2 block text-5xl font-black text-[#2463eb]">{finalA}</span></div><span className="text-2xl font-black text-[#9aa1ad]">:</span><div><strong className="block text-lg">{teamTitle(teamB)}</strong><span className="mt-2 block text-5xl font-black text-[#e43c35]">{finalB}</span></div></div> : <div className="p-4 sm:p-6">
      <QuickWinnerScoreInput
        teamA={teamTitle(teamA)}
        teamB={teamTitle(teamB)}
        teamAKicker="Пара A"
        teamBKicker="Пара Б"
        target={target}
        scoreA={finalA}
        scoreB={finalB}
        disabled={disabled || !teamA || !teamB}
        tone="light"
        resetKey={match.id}
        onComplete={(score) => onAction('quick_result', { scoreA: score.scoreA, scoreB: score.scoreB })}
      />
    </div>}
  </article>;
}

function ScheduleView({ snapshot, courtNo, currentMatchId, onOpen }: { snapshot: RrJudgeSnapshot; courtNo: number; currentMatchId?: string; onOpen: (match: RrMatch) => void }) {
  const teams = new Map(snapshot.teams.map((team) => [team.id, team]));
  return <div className="space-y-3">{snapshot.matches.filter((match) => match.courtNo === courtNo).map((match) => {
    const isCurrent = match.id === currentMatchId;
    const canOpen = Boolean(match.teamAId && match.teamBId && !['finished', 'forfeit', 'cancelled'].includes(match.status));
    return <button type="button" key={match.id} disabled={!canOpen} onClick={() => onOpen(match)} className={`grid min-h-20 w-full gap-2 rounded-2xl border p-4 text-left transition active:scale-[.99] disabled:cursor-default sm:grid-cols-[7rem_1fr_auto] sm:items-center ${isCurrent ? 'border-[#158466] bg-[#eefaf5] ring-2 ring-[#158466]/20' : 'border-[#d8d2c6] bg-white'}`}>
      <div className={`text-sm font-black ${isCurrent ? 'text-[#158466]' : 'text-[#e65324]'}`}>{isCurrent ? 'Сейчас' : `Слот ${match.scheduleSlot}`}<span className="block text-xs font-medium text-[#6e7787]">Корт {match.courtNo ?? '—'}</span></div>
      <div><strong>{teamTitle(match.teamAId ? teams.get(match.teamAId) : undefined)}</strong><span className="mx-2 text-[#9aa1ad]">vs</span><strong>{teamTitle(match.teamBId ? teams.get(match.teamBId) : undefined)}</strong><p className="mt-1 text-xs text-[#6e7787]">{match.bracketRound ?? snapshot.groups.find((group) => group.id === match.groupId)?.label ?? 'Матч'}</p></div>
      <div className="text-right font-black">{isCurrent ? <span className="rounded-full bg-[#158466] px-3 py-1 text-xs text-white">Открыт</span> : match.status === 'finished' || match.status === 'forfeit' ? `${match.scoreA.join('/')} : ${match.scoreB.join('/')}` : match.status === 'cancelled' ? 'Отменён' : <span className="rounded-full bg-[#fff0e8] px-3 py-1 text-xs text-[#a72f0a]">Открыть →</span>}</div>
    </button>;
  })}</div>;
}

function StandingsView({ snapshot }: { snapshot: RrJudgeSnapshot }) {
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const teams = new Map(snapshot.teams.map((team) => [team.id, team]));
  return <div className="grid gap-4 lg:grid-cols-2">{snapshot.groups.map((group) => <section key={group.id} className="overflow-hidden rounded-2xl border border-[#d8d2c6] bg-white"><div className="flex items-center justify-between bg-[#172033] px-4 py-3 text-white"><h3 className="text-lg font-black">{group.label}</h3><span className="text-[10px] font-bold uppercase tracking-wide text-white/60">В/И · очки · +/−</span></div><ol className="divide-y divide-[#ece7dd]">{snapshot.standings.filter((row) => row.groupId === group.id).map((row) => {
    const expanded = expandedTeamId === row.teamId;
    const team = teams.get(row.teamId);
    const teamMatches = snapshot.matches.filter((match) => match.groupId === group.id && (match.teamAId === row.teamId || match.teamBId === row.teamId));
    const finishedMatches = teamMatches.filter((match) => match.status === 'finished' || match.status === 'forfeit');
    const winRate = row.played ? Math.round((row.wins / row.played) * 100) : 0;
    const avgDiff = row.played ? row.pointDiff / row.played : 0;
    return <li key={row.teamId} className={row.position === 1 ? 'bg-[#fff7ec]' : ''}>
      <button type="button" aria-expanded={expanded} onClick={() => setExpandedTeamId(expanded ? null : row.teamId)} className="grid min-h-16 w-full grid-cols-[2rem_minmax(0,1fr)_auto_auto_auto_1rem] items-center gap-2 px-3 py-2 text-left hover:bg-[#f8f6f1]">
        <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-black ${row.position === 1 ? 'bg-[#e65324] text-white' : 'bg-[#f1eee7] text-[#3c4658]'}`}>{row.position}</span>
        <span className="min-w-0"><strong className="block truncate text-sm">{teamTitle(team)}</strong><span className="mt-0.5 block text-[9px] uppercase tracking-wide text-[#6e7787]">Посев {row.seed} · сеты {row.setsWon}:{row.setsLost}</span></span>
        <span className="whitespace-nowrap text-xs text-[#6e7787]"><strong className="text-[#172033]">{row.wins}</strong>/{row.played}</span>
        <strong className="rounded-lg bg-[#f1eee7] px-2 py-1 text-xs">{row.matchPoints}</strong>
        <strong className={`min-w-10 rounded-lg px-2 py-1 text-center text-xs ${row.pointDiff >= 0 ? 'bg-[#e6f7f1] text-[#0f6b53]' : 'bg-[#fff1ef] text-[#b8322a]'}`}>{row.pointDiff > 0 ? '+' : ''}{row.pointDiff}</strong>
        <span className={`text-xs text-[#6e7787] transition-transform ${expanded ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {expanded ? <div className="border-t border-[#ece7dd] bg-[#f8f6f1] p-3">
        <div className="grid grid-cols-3 gap-2"><RrStatTile label="Победы" value={row.played ? `${winRate}%` : '—'} /><RrStatTile label="В среднем" value={row.played ? `${avgDiff >= 0 ? '+' : ''}${avgDiff.toFixed(1)}` : '—'} /><RrStatTile label="Коэффициент" value={row.pointQuotient.toFixed(3)} /></div>
        <div className="mt-3 rounded-xl border border-[#c7ded5] bg-[#eefaf5] px-3 py-2"><span className="text-[9px] font-black uppercase tracking-wide text-[#557064]">Постоянный состав</span><p className="mt-0.5 text-sm font-black">{team?.player1.name ?? '—'} + {team?.player2.name ?? '—'}</p></div>
        <p className="mb-2 mt-3 text-[10px] font-black uppercase tracking-wide text-[#6e7787]">Матчи и соперники</p>
        <ol className="space-y-1.5">{teamMatches.map((match) => {
          const isA = match.teamAId === row.teamId;
          const opponentId = isA ? match.teamBId : match.teamAId;
          const ownScores = isA ? match.scoreA : match.scoreB;
          const opponentScores = isA ? match.scoreB : match.scoreA;
          const done = match.status === 'finished' || match.status === 'forfeit';
          const won = done && match.winnerId === row.teamId;
          return <li key={match.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-[#ded8cc] bg-white px-2.5 py-2"><span className={`grid h-7 min-w-7 place-items-center rounded-lg text-[10px] font-black ${!done ? 'bg-[#f1eee7] text-[#6e7787]' : won ? 'bg-[#e6f7f1] text-[#0f6b53]' : 'bg-[#fff1ef] text-[#b8322a]'}`}>{!done ? '—' : won ? 'В' : 'П'}</span><span className="min-w-0"><strong className="block truncate text-[11px]">против {teamTitle(opponentId ? teams.get(opponentId) : undefined)}</strong><span className="block text-[9px] text-[#6e7787]">Матч {match.matchNo} · корт {match.courtNo ?? '—'} · слот {match.scheduleSlot}</span></span><strong className={`whitespace-nowrap text-sm ${!done ? 'text-[#6e7787]' : won ? 'text-[#0f6b53]' : 'text-[#b8322a]'}`}>{done ? `${ownScores.join('/')} : ${opponentScores.join('/')}` : 'Ожидает'}</strong></li>;
        })}</ol>
        {finishedMatches.length === 0 ? <p className="mt-2 text-xs text-[#6e7787]">Завершённых матчей пока нет.</p> : null}
      </div> : null}
    </li>;
  })}</ol></section>)}</div>;
}

function RrStatTile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[#ded8cc] bg-white px-2.5 py-2"><span className="block text-[8px] font-black uppercase tracking-wide text-[#6e7787]">{label}</span><strong className="mt-1 block text-lg leading-none text-[#172033]">{value}</strong></div>;
}

function TeamsView({ snapshot }: { snapshot: RrJudgeSnapshot }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{snapshot.teams.map((team) => <article key={team.id} className="rounded-2xl border border-[#d8d2c6] bg-white p-4"><div className="flex items-center justify-between"><span className="rounded-full bg-[#172033] px-3 py-1 text-xs font-black text-white">Посев {team.seed}</span><span className="text-sm font-bold text-[#158466]">Σ {Math.round(team.rating)}</span></div><h3 className="mt-4 text-lg font-black">{team.player1.name}</h3><p className="text-sm text-[#6e7787]">{team.player1.gender === 'M' ? 'Мужчина' : 'Женщина'}</p><h3 className="mt-3 text-lg font-black">{team.player2.name}</h3><p className="text-sm text-[#6e7787]">{team.player2.gender === 'M' ? 'Мужчина' : 'Женщина'}</p>{team.finalPlacement ? <p className="mt-4 border-t border-[#ece7dd] pt-3 font-black text-[#e65324]">Итоговое место: {team.finalPlacement}</p> : null}</article>)}</div>;
}

function PlayoffView({ snapshot }: { snapshot: RrJudgeSnapshot }) {
  const teams = new Map(snapshot.teams.map((team) => [team.id, team]));
  if (!snapshot.playoffPreview) return <div className="rounded-2xl border border-dashed border-[#bdb6aa] bg-white p-10 text-center text-[#6e7787]">Плей-офф появится после завершения групп.</div>;
  return <div className="grid gap-4 lg:grid-cols-3">{snapshot.playoffPreview.levels.map((level) => <section key={level.key} className="rounded-2xl border border-[#d8d2c6] bg-white p-4"><h3 className="text-xl font-black">{level.label}</h3><p className="mt-1 text-sm text-[#6e7787]">Сетка {level.bracketSize} · матч за 3-е место</p><ol className="mt-4 space-y-2">{level.teamIds.map((teamId, index) => <li key={teamId} className="rounded-xl bg-[#f4f1ea] px-3 py-2 text-sm"><span className="mr-2 font-black text-[#e65324]">{index + 1}</span>{teamTitle(teams.get(teamId))}</li>)}</ol></section>)}</div>;
}

function PlayoffEditor({ snapshot, onChange }: { snapshot: RrJudgeSnapshot; onChange: (snapshot: RrJudgeSnapshot) => void }) {
  const [draft, setDraft] = useState(() => snapshot.playoffPreview ? { ...snapshot.playoffPreview, levels: snapshot.playoffPreview.levels.map((level) => ({ ...level, teamIds: [...level.teamIds] })) } : null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const teams = new Map(snapshot.teams.map((team) => [team.id, team]));
  if (!draft) return null;
  function moveTeam(teamId: string, fromKey: string, toKey: string) {
    if (fromKey === toKey) return;
    setDraft((current) => current ? {
      ...current,
      levels: current.levels.map((level) => level.key === fromKey
        ? { ...level, teamIds: level.teamIds.filter((id) => id !== teamId) }
        : level.key === toKey ? { ...level, teamIds: [...level.teamIds, teamId] } : level),
    } : current);
  }
  async function confirm() {
    const currentDraft = draft;
    if (!currentDraft) return;
    if (currentDraft.levels.some((level) => level.teamIds.length < 2 || level.teamIds.length > level.bracketSize)) {
      setMessage('В каждой сетке должно быть от 2 команд до выбранного размера сетки.'); return;
    }
    setPending(true); setMessage(null);
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(snapshot.tournament.id)}/rr-action`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_playoff', payload: { preview: currentDraft } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data.message ?? 'Не удалось подтвердить сетки.'));
      onChange(data as RrJudgeSnapshot);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось подтвердить сетки.'); }
    finally { setPending(false); }
  }
  return <section className="mt-4 rounded-3xl border-2 border-[#e65324] bg-[#fff7ec] p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a95b13]">Предварительный расклад</p><div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-black">Проверьте сетки перед запуском</h2><p className="text-sm text-[#6e4a28]">Команды можно переносить между уровнями, размер каждой сетки — 4 или 8.</p></div><button type="button" onClick={confirm} disabled={pending} className="min-h-12 rounded-xl bg-[#e65324] px-5 font-black text-white">{pending ? 'Сохраняем…' : 'Подтвердить состав'}</button></div>{message ? <p className="mt-3 font-bold text-[#b8322a]">{message}</p> : null}<div className="mt-4 grid gap-3 lg:grid-cols-3">{draft.levels.map((level) => <article key={level.key} className="rounded-2xl border border-[#d8d2c6] bg-white p-3"><div className="flex items-center justify-between gap-2"><strong>{level.label}</strong><select value={level.bracketSize} onChange={(event) => setDraft((current) => current ? { ...current, levels: current.levels.map((row) => row.key === level.key ? { ...row, bracketSize: Number(event.target.value) as 4 | 8 } : row) } : current)} className="min-h-10 rounded-lg border border-[#d8d2c6] px-2"><option value={4}>Сетка 4</option><option value={8}>Сетка 8</option></select></div><div className="mt-3 space-y-2">{level.teamIds.map((teamId, index) => <div key={teamId} className="rounded-xl bg-[#f4f1ea] p-2"><p className="text-sm font-bold">{index + 1}. {teamTitle(teams.get(teamId))}</p>{draft.levels.length > 1 ? <select value={level.key} onChange={(event) => moveTeam(teamId, level.key, event.target.value)} className="mt-2 min-h-9 w-full rounded-lg border border-[#d8d2c6] bg-white px-2 text-xs">{draft.levels.map((target) => <option key={target.key} value={target.key}>{target.label}</option>)}</select> : null}</div>)}</div></article>)}</div></section>;
}

function OperatorControls({ snapshot, onChange }: { snapshot: RrJudgeSnapshot; onChange: (snapshot: RrJudgeSnapshot) => void }) {
  const [pending, setPending] = useState<RrOperatorActionName | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rollbackConfirmOpen, setRollbackConfirmOpen] = useState(false);
  const actionForStage: Partial<Record<RrJudgeSnapshot['stage'], { action: RrOperatorActionName; label: string }>> = {
    groups_ready: { action: 'start_groups', label: 'Запустить групповой этап' },
    groups_live: { action: 'finish_groups', label: 'Завершить группы' },
    groups_finished: { action: 'preview_playoff', label: 'Сформировать плей-офф' },
    playoff_ready: { action: 'start_playoff', label: 'Запустить плей-офф' },
    playoff_live: { action: 'finish_tournament', label: 'Завершить турнир' },
  };
  const primary = actionForStage[snapshot.stage];
  async function run(action: RrOperatorActionName) {
    setPending(action); setMessage(null);
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(snapshot.tournament.id)}/rr-action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data.message ?? 'Действие не выполнено.'));
      onChange(data as RrJudgeSnapshot);
      setRollbackConfirmOpen(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Действие не выполнено.'); }
    finally { setPending(null); }
  }
  const canRollback = snapshot.stage !== 'finished' && snapshot.stage !== 'groups_ready';
  return <section className="mt-4 rounded-2xl border border-[#e4b286] bg-[#fff7ec] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a95b13]">Управление организатора</p><p className="mt-1 text-sm text-[#6e4a28]">Структурные действия отделены от судейского счёта.</p>{message ? <p className="mt-1 font-bold text-[#b8322a]">{message}</p> : null}</div><div className="flex flex-wrap gap-2">{canRollback ? <button type="button" disabled={Boolean(pending)} onClick={() => setRollbackConfirmOpen(true)} className="min-h-12 rounded-xl border border-[#d4a271] bg-white px-4 font-bold">Откатить этап</button> : null}{primary ? <button type="button" disabled={Boolean(pending)} onClick={() => run(primary.action)} className="min-h-12 rounded-xl bg-[#e65324] px-5 font-black text-white">{pending === primary.action ? 'Выполняем…' : primary.label}</button> : null}</div></div>{rollbackConfirmOpen ? <div role="alert" className="mt-3 rounded-2xl border border-[#e1493e] bg-[#fff1ef] p-3"><p className="font-black text-[#9e2823]">Подтвердите откат этапа</p><p className="mt-1 text-xs leading-5 text-[#7d4540]">Структура турнира вернётся на предыдущий этап. Проверьте, что текущие матчи и результаты больше не используются.</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setRollbackConfirmOpen(false)} className="min-h-12 rounded-xl border border-[#d8d2c6] bg-white font-bold">Отмена</button><button type="button" disabled={Boolean(pending)} onClick={() => run('rollback_stage')} className="min-h-12 rounded-xl bg-[#e1493e] px-3 text-sm font-black text-white disabled:opacity-40">Да, откатить этап</button></div></div> : null}</section>;
}

export function RoundRobinWorkspace({ initialSnapshot, canManage }: { initialSnapshot: RrJudgeSnapshot; canManage: boolean }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedCourt, setSelectedCourt] = useState(initialSnapshot.courts[0]?.courtNo ?? 1);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('schedule');
  const [sync, setSync] = useState<SyncState>(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online');
  const [pendingCount, setPendingCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [resultNotice, setResultNotice] = useState<string | null>(null);
  const [scoreViewByMatch, setScoreViewByMatch] = useState<Record<string, RrScoringMode>>({});
  const snapshotRef = useRef(snapshot);
  const localPointHistory = useRef(new Map<string, RrMatch[]>());
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);

  const refreshQueueCount = useCallback(async () => {
    if (typeof indexedDB === 'undefined') return;
    const events = await listRrJudgeEvents(snapshotRef.current.tournament.id);
    setPendingCount(events.length);
  }, []);

  const flushQueue = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setSync('offline'); return; }
    const events = await listRrJudgeEvents(snapshotRef.current.tournament.id);
    if (!events.length) { setPendingCount(0); setSync('online'); return; }
    setSync('syncing'); setPendingCount(events.length);
    for (const event of events) {
      const response = await fetch('/api/sudyam/rr', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) }).catch(() => null);
      if (!response) { setSync('offline'); return; }
      const data = await response.json();
      if (response.status === 409) {
        if (data.snapshot) { setSnapshot(data.snapshot as RrJudgeSnapshot); snapshotRef.current = data.snapshot as RrJudgeSnapshot; }
        setMessage('Серверное состояние изменилось. Автоматическая отправка остановлена: проверьте счёт матча.');
        setSync('conflict'); return;
      }
      if (!response.ok) { setMessage(String(data.message ?? 'Не удалось синхронизировать событие.')); setSync('conflict'); return; }
      await removeRrJudgeEvent(event.clientEventId);
      setSnapshot(data as RrJudgeSnapshot); snapshotRef.current = data as RrJudgeSnapshot;
      setPendingCount((count) => Math.max(0, count - 1));
    }
    setSync('online'); setMessage(null);
  }, []);

  useEffect(() => {
    void refreshQueueCount().then(() => { if (navigator.onLine) void flushQueue(); });
    const online = () => void flushQueue();
    const offline = () => setSync('offline');
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, [flushQueue, refreshQueueCount]);

  async function judgeAction(match: RrMatch, action: RrJudgeActionName, payload: Record<string, unknown> = {}) {
    if (sync === 'conflict') return;
    if (action === 'quick_result') {
      setMessage(null);
      setResultNotice(null);
    }
    const queued: RrQueuedJudgeEvent = {
      tournamentId: snapshot.tournament.id, matchId: match.id, action, clientEventId: eventId(),
      expectedVersion: match.version, payload, queuedAt: new Date().toISOString(),
    };
    if (action === 'point_a' || action === 'point_b') {
      const history = localPointHistory.current.get(match.id) ?? [];
      history.push({ ...match, scoreA: [...match.scoreA], scoreB: [...match.scoreB], format: { ...match.format } });
      localPointHistory.current.set(match.id, history.slice(-50));
    }
    let optimistic = applyOptimisticAction(snapshot, match.id, action, payload);
    if (action === 'undo') {
      const history = localPointHistory.current.get(match.id) ?? [];
      const previous = history.pop();
      localPointHistory.current.set(match.id, history);
      if (previous) {
        optimistic = cloneSnapshot(snapshot);
        const index = optimistic.matches.findIndex((row) => row.id === match.id);
        if (index >= 0) optimistic.matches[index] = { ...previous, version: match.version + 1 };
      }
    }
    setSnapshot(optimistic); snapshotRef.current = optimistic;
    if (action === 'quick_result') {
      const scoreA = Number(payload.scoreA);
      const scoreB = Number(payload.scoreB);
      const teamMap = new Map(snapshot.teams.map((team) => [team.id, team]));
      const winnerTeam = scoreA > scoreB ? teamMap.get(match.teamAId ?? '') : teamMap.get(match.teamBId ?? '');
      const winnerScore = scoreA > scoreB ? `${scoreA}:${scoreB}` : `${scoreB}:${scoreA}`;
      const nextCourtMatch = optimistic.matches
        .filter((candidate) => candidate.id !== match.id
          && candidate.courtNo === match.courtNo
          && candidate.teamAId
          && candidate.teamBId
          && !['finished', 'forfeit', 'cancelled'].includes(candidate.status))
        .sort((left, right) => left.scheduleSlot - right.scheduleSlot || left.matchNo - right.matchNo)[0];
      setSelectedMatchId(null);
      setResultNotice(nextCourtMatch
        ? `${teamTitle(winnerTeam)} победили ${winnerScore}. Далее: ${teamTitle(teamMap.get(nextCourtMatch.teamAId ?? ''))} — ${teamTitle(teamMap.get(nextCourtMatch.teamBId ?? ''))}.`
        : `${teamTitle(winnerTeam)} победили ${winnerScore}. Корт ${match.courtNo} заполнен.`);
    }
    if (!navigator.onLine) {
      await enqueueRrJudgeEvent(queued); setPendingCount((count) => count + 1); setSync('offline'); return;
    }
    setSync('syncing');
    const response = await fetch('/api/sudyam/rr', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(queued) }).catch(() => null);
    if (!response) { await enqueueRrJudgeEvent(queued); setPendingCount((count) => count + 1); setSync('offline'); return; }
    const data = await response.json();
    if (response.status === 409) {
      if (data.snapshot) { setSnapshot(data.snapshot as RrJudgeSnapshot); snapshotRef.current = data.snapshot as RrJudgeSnapshot; }
      setMessage(String(data.message ?? 'Нужна сверка счёта.')); setSync('conflict'); return;
    }
    if (!response.ok) { setSnapshot(snapshot); snapshotRef.current = snapshot; setMessage(String(data.message ?? 'Действие не сохранено.')); setSync('online'); return; }
    const nextSnapshot = data as RrJudgeSnapshot;
    setSnapshot(nextSnapshot); snapshotRef.current = nextSnapshot; setSync('online'); setMessage(null);
  }

  if (!snapshot.initialized) {
    if (canManage) return <SetupWorkspace snapshot={snapshot} onReady={setSnapshot} />;
    return <main className="flex min-h-screen items-center justify-center bg-[#f4f1ea] p-5 text-[#172033]"><section className="max-w-xl rounded-3xl border border-[#d8d2c6] bg-white p-8 text-center"><div className="text-5xl">🏐</div><h1 className="mt-4 text-3xl font-black">Организатор формирует команды</h1><p className="mt-3 text-[#6e7787]">Судейский экран откроется после подтверждения фиксированных пар, групп и расписания.</p></section></main>;
  }

  const teams = new Map(snapshot.teams.map((team) => [team.id, team]));
  const courtMatches = snapshot.matches.filter((match) => match.courtNo === selectedCourt && match.status !== 'cancelled').sort((a, b) => a.scheduleSlot - b.scheduleSlot || a.matchNo - b.matchNo);
  const selectedMatch = selectedMatchId
    ? courtMatches.find((match) => match.id === selectedMatchId && !['finished', 'forfeit', 'cancelled'].includes(match.status))
    : undefined;
  const currentMatch = courtMatches.find((match) => match.status === 'live' || match.status === 'paused')
    ?? selectedMatch
    ?? courtMatches.find((match) => match.status === 'ready')
    ?? courtMatches.find((match) => match.status === 'scheduled' && match.teamAId && match.teamBId)
    ?? courtMatches[courtMatches.length - 1];
  const nextMatch = currentMatch ? courtMatches.find((match) => match.scheduleSlot > currentMatch.scheduleSlot && match.status !== 'finished' && match.status !== 'forfeit') : undefined;
  const scoreView = currentMatch
    ? scoreViewByMatch[currentMatch.id] ?? (currentMatch.format.scoringMode === 'referee' ? 'referee' : 'quick')
    : 'quick';

  return (
    <main className="round-robin-workspace min-h-screen bg-[#f4f1ea] pb-24 text-[#172033]">
      <header className="bg-[#172033] text-white">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#ff8a5f]">Round Robin · {STAGE_LABELS[snapshot.stage]}</p><h1 className="mt-1 text-2xl font-black sm:text-4xl">{snapshot.tournament.name}</h1><p className="mt-2 text-sm text-white/65">{snapshot.tournament.date} · {snapshot.tournament.time} · {snapshot.tournament.location}</p></div><div className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black ${stateColor(sync)}`}><span className="h-2 w-2 rounded-full bg-white" />{syncLabel(sync, pendingCount)}</div></div>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">{snapshot.courts.map((court) => <button key={court.id} type="button" onClick={() => { setSelectedCourt(court.courtNo); setSelectedMatchId(null); }} className={`min-h-12 shrink-0 rounded-xl px-5 font-black ${selectedCourt === court.courtNo ? 'bg-[#e65324] text-white' : 'bg-white/10 text-white/70'}`}>{court.label}</button>)}</div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6">
        {message ? <div className={`mb-4 rounded-2xl border p-4 font-bold ${sync === 'conflict' ? 'border-[#e1493e] bg-[#fff1ef] text-[#9e2823]' : 'border-[#d8d2c6] bg-white'}`}>{message}{sync === 'conflict' ? <button type="button" onClick={() => { setSync(navigator.onLine ? 'online' : 'offline'); setMessage(null); }} className="ml-3 rounded-lg bg-[#172033] px-3 py-2 text-sm text-white">Счёт проверен</button> : null}</div> : null}
        {resultNotice ? <div className="mb-4 rounded-2xl border border-[#8bcdb8] bg-[#e9f8f2] p-4 font-bold text-[#12634d]">{resultNotice}</div> : null}
        {currentMatch ? <section className="mb-3 rounded-2xl border-2 border-[#158466] bg-[#eefaf5] p-4 shadow-sm"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#158466]">Сейчас проходит</p><div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black">Матч {currentMatch.matchNo} · Корт {currentMatch.courtNo}</h2><p className="mt-1 font-bold">{teamTitle(currentMatch.teamAId ? teams.get(currentMatch.teamAId) : undefined)} <span className="text-[#9aa1ad]">vs</span> {teamTitle(currentMatch.teamBId ? teams.get(currentMatch.teamBId) : undefined)}</p></div><span className="mt-2 w-fit rounded-full bg-[#158466] px-3 py-2 text-xs font-black text-white sm:mt-0">Текущий матч</span></div></section> : null}
        {currentMatch && quickTarget(currentMatch.format) ? <section className="mb-3 flex flex-col gap-2 rounded-2xl border border-[#d8d2c6] bg-white p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#6e7787]">Ввод результата</p><p className="mt-1 text-sm text-[#6e7787]">Можно переключаться без изменения матча и текущего счёта.</p></div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setScoreViewByMatch((current) => ({ ...current, [currentMatch.id]: 'quick' }))} className={`min-h-11 rounded-xl px-4 text-sm font-black ${scoreView === 'quick' ? 'bg-[#e65324] text-white' : 'border border-[#d8d2c6] bg-[#f8f6f1]'}`}>Быстрый ввод</button><button type="button" onClick={() => setScoreViewByMatch((current) => ({ ...current, [currentMatch.id]: 'referee' }))} className={`min-h-11 rounded-xl px-4 text-sm font-black ${scoreView === 'referee' ? 'bg-[#172033] text-white' : 'border border-[#d8d2c6] bg-[#f8f6f1]'}`}>Полное табло</button></div></section> : null}
        <div id="rr-score-panel" className="scroll-mt-4">{currentMatch ? scoreView === 'quick'
          ? <QuickScorePanel match={currentMatch} teams={teams} onAction={(action, payload) => void judgeAction(currentMatch, action, payload)} disabled={sync === 'syncing' || sync === 'conflict'} />
          : <ScorePanel match={currentMatch} teams={teams} onAction={(action, payload) => void judgeAction(currentMatch, action, payload)} disabled={sync === 'syncing' || sync === 'conflict'} />
          : <div className="rounded-3xl border border-dashed border-[#bdb6aa] bg-white p-10 text-center"><h2 className="text-2xl font-black">На этом корте пока нет матча</h2><p className="mt-2 text-[#6e7787]">Переключитесь на другой корт или запустите следующий этап.</p></div>}</div>
        {nextMatch ? <section className="mt-3 flex flex-col gap-2 rounded-2xl border border-[#d8d2c6] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6e7787]">Следующий матч на корте</p><p className="mt-1 font-black">{teamTitle(nextMatch.teamAId ? teams.get(nextMatch.teamAId) : undefined)} <span className="text-[#9aa1ad]">vs</span> {teamTitle(nextMatch.teamBId ? teams.get(nextMatch.teamBId) : undefined)}</p></div><span className="font-black text-[#e65324]">Слот {nextMatch.scheduleSlot}</span></section> : null}

        <nav className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-[#e8e3d9] p-1 sm:grid-cols-4">{([['schedule', 'Расписание'], ['standings', 'Таблица'], ['teams', 'Команды'], ['playoff', 'Плей-офф']] as Array<[WorkspaceTab, string]>).map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={`min-h-12 rounded-xl font-black ${tab === key ? 'bg-white text-[#e65324] shadow-sm' : 'text-[#687183]'}`}>{label}</button>)}</nav>
        <section className="mt-4">{tab === 'schedule' ? <ScheduleView snapshot={snapshot} courtNo={selectedCourt} currentMatchId={currentMatch?.id} onOpen={(match) => { setSelectedMatchId(match.id); setResultNotice(null); window.requestAnimationFrame(() => document.getElementById('rr-score-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} /> : tab === 'standings' ? <StandingsView snapshot={snapshot} /> : tab === 'teams' ? <TeamsView snapshot={snapshot} /> : <PlayoffView snapshot={snapshot} />}</section>
        {canManage && snapshot.stage === 'playoff_preview' ? <PlayoffEditor snapshot={snapshot} onChange={(next) => { setSnapshot(next); snapshotRef.current = next; }} /> : null}
        {canManage ? <OperatorControls snapshot={snapshot} onChange={(next) => { setSnapshot(next); snapshotRef.current = next; }} /> : null}
      </div>
    </main>
  );
}
