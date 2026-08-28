'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  QuickWinnerScoreInput,
  type QuickWinnerScoreMember,
} from '@/components/QuickWinnerScoreInput';
import {
  PLAY_KING_MAX_TIMER,
  PLAY_KING_MIN_TIMER,
  PLAY_KING_POINT_LIMIT,
  buildPlayResultStandings,
  generateKingRounds,
  generatePlayMatches,
  type PlayKingRound,
  type PlayPairingMode,
  type PlayResultFormat,
  type PlayResultMatch,
  type StructuredPlayResult,
} from '@/lib/play-result-core';
import { buildQuickWinnerScore, parseQuickWinnerScore } from '@/lib/quick-winner-score';

interface Participant {
  resultKey: number;
  name: string;
  registered: boolean;
  avatarUrl?: string | null;
}

const FORMAT_OPTIONS: Array<{ id: PlayResultFormat; label: string; hint: string }> = [
  { id: 'classic_2x2', label: '2×2', hint: 'Обычный матч или несколько сетов' },
  { id: 'king_sideout', label: 'Сайдаут / KING', hint: 'Турнирные раунды, до 15 очков пары' },
  { id: 'thai_8', label: 'Тайский', hint: 'Турнирная схема: 1 корт, 8 игроков' },
];
const QUICK_POINT_LIMITS = [11, 15, 21] as const;

interface PlayResultFormProps {
  postId: string;
  participants: Participant[];
  initialFormat?: PlayResultFormat;
  initialPointLimit?: number;
  initialDecidingPointLimit?: number;
  ratingMode?: 'rated' | 'friendly';
  submitterRole?: 'organizer' | 'participant';
  initialPayload?: unknown;
  resultId?: string;
  expectedRevision?: number;
  focusMode?: boolean;
}

function readStructuredResult(value: unknown): StructuredPlayResult | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StructuredPlayResult>;
  if (candidate.version !== 2 || !['classic_2x2', 'thai_8', 'king_sideout'].includes(String(candidate.format))) return null;
  if (!Array.isArray(candidate.matches)) return null;
  return candidate as StructuredPlayResult;
}

export default function PlayResultForm({
  postId,
  participants,
  initialFormat,
  initialPointLimit,
  initialDecidingPointLimit,
  ratingMode = 'rated',
  submitterRole = 'organizer',
  initialPayload,
  resultId,
  expectedRevision,
  focusMode = false,
}: PlayResultFormProps) {
  const router = useRouter();
  const participantIds = useMemo(() => participants.map((participant) => participant.resultKey), [participants]);
  const suppliedResult = useMemo(() => readStructuredResult(initialPayload), [initialPayload]);
  const defaultFormat: PlayResultFormat = suppliedResult?.format || initialFormat || (participants.length === 8 ? 'thai_8' : participants.length === 4 ? 'classic_2x2' : 'king_sideout');
  const [format, setFormat] = useState<PlayResultFormat>(defaultFormat);
  const [pairingMode, setPairingMode] = useState<PlayPairingMode>(suppliedResult?.pairingMode || 'fixed');
  const [pointLimit, setPointLimit] = useState(suppliedResult?.pointLimit || initialPointLimit || (defaultFormat === 'classic_2x2' ? 21 : 15));
  const [decidingPointLimit, setDecidingPointLimit] = useState(
    suppliedResult?.format === 'classic_2x2' && suppliedResult.matches[2]?.pointLimit
      ? suppliedResult.matches[2].pointLimit
      : initialDecidingPointLimit || 15,
  );
  const [roundDurationMinutes, setRoundDurationMinutes] = useState(suppliedResult?.roundDurationMinutes || 10);
  const [matches, setMatches] = useState<PlayResultMatch[]>(() => suppliedResult && suppliedResult.format !== 'king_sideout' ? suppliedResult.matches : generatePlayMatches(participantIds, defaultFormat, suppliedResult?.pairingMode || 'fixed'));
  const [kingRounds, setKingRounds] = useState<PlayKingRound[]>(() => suppliedResult?.format === 'king_sideout' && Array.isArray(suppliedResult.rounds) ? suppliedResult.rounds : generateKingRounds(participantIds, suppliedResult?.pairingMode || 'fixed'));
  const [loading, setLoading] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingNote, setPairingNote] = useState('');
  const [error, setError] = useState('');
  const names = useMemo(() => new Map(participants.map((participant) => [participant.resultKey, participant.name])), [participants]);
  const participantVisuals = useMemo(() => new Map<number, QuickWinnerScoreMember>(participants.map((participant) => [
    participant.resultKey,
    { name: participant.name, avatarUrl: participant.avatarUrl, registered: participant.registered },
  ])), [participants]);
  const guestCount = participants.filter((participant) => !participant.registered).length;
  const ratedGuestsBlockApproval = ratingMode === 'rated' && guestCount > 0;

  function regenerate(nextFormat = format, nextPairing = pairingMode) {
    const seed = Date.now();
    if (nextFormat === 'king_sideout') {
      setKingRounds(generateKingRounds(participantIds, nextPairing, seed));
      setMatches([]);
    } else {
      setMatches(generatePlayMatches(participantIds, nextFormat, nextPairing, seed));
      setKingRounds([]);
    }
    setError('');
  }

  function changeFormat(next: PlayResultFormat) {
    setFormat(next);
    const nextPairing = next === 'classic_2x2' ? 'fixed' : pairingMode;
    setPairingMode(nextPairing);
    regenerate(next, nextPairing);
  }

  function setQuickScore(index: number, winner: 'A' | 'B', loserPoints: number) {
    setMatches((current) => current.map((match, matchIndex) => {
      if (matchIndex !== index) return match;
      const score = buildQuickWinnerScore(match.pointLimit ?? pointLimit, winner, loserPoints);
      return { ...match, scoreA: score.scoreA, scoreB: score.scoreB };
    }));
    window.requestAnimationFrame(() => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-play-score-row]'));
      const next = rows.find((row) => Number(row.dataset.matchIndex) > index && row.dataset.complete === 'false');
      if (!next) return;
      next.scrollIntoView({ behavior: 'smooth', block: 'center' });
      next.querySelector<HTMLButtonElement>('button[data-quick-winner]')?.focus({ preventScroll: true });
    });
  }

  function setManualScore(index: number, scoreA: number, scoreB: number) {
    setMatches((current) => current.map((match, matchIndex) => {
      if (matchIndex !== index) return match;
      const max = format === 'classic_2x2' ? 99 : match.pointLimit ?? pointLimit;
      const normalize = (value: number) => Math.max(0, Math.min(max, Math.trunc(Number(value) || 0)));
      return { ...match, scoreA: normalize(scoreA), scoreB: normalize(scoreB) };
    }));
  }

  function changePointLimit(nextLimit: number) {
    const previousLimit = pointLimit;
    setPointLimit(nextLimit);
    setMatches((current) => current.map((match) => {
      if (match.pointLimit != null) return match;
      const quickScore = parseQuickWinnerScore(previousLimit, match.scoreA, match.scoreB);
      if (!quickScore) return match;
      const nextScore = buildQuickWinnerScore(nextLimit, quickScore.winner, quickScore.loserPoints);
      return {
        ...match,
        scoreA: nextScore.scoreA,
        scoreB: nextScore.scoreB,
      };
    }));
  }

  function changeDecidingPointLimit(nextLimit: number) {
    const previousLimit = decidingPointLimit;
    setDecidingPointLimit(nextLimit);
    setMatches((current) => current.map((match, index) => {
      if (index !== 2) return match;
      const quickScore = parseQuickWinnerScore(match.pointLimit ?? previousLimit, match.scoreA, match.scoreB);
      if (!quickScore) return { ...match, pointLimit: nextLimit };
      const nextScore = buildQuickWinnerScore(nextLimit, quickScore.winner, quickScore.loserPoints);
      return { ...match, pointLimit: nextLimit, scoreA: nextScore.scoreA, scoreB: nextScore.scoreB };
    }));
  }

  function updateKingPoints(roundIndex: number, pairIndex: number, value: string) {
    const points = Math.max(0, Math.min(PLAY_KING_POINT_LIMIT, Math.trunc(Number(value) || 0)));
    setKingRounds((current) => current.map((round, currentRoundIndex) => currentRoundIndex !== roundIndex ? round : {
      ...round,
      pairs: round.pairs.map((pair, currentPairIndex) => currentPairIndex === pairIndex ? { ...pair, points } : pair),
    }));
  }

  function addSet() {
    setMatches((current) => {
      const base = current[0];
      if (!base) return current;
      const setIndex = current.length;
      const next: PlayResultMatch = { ...base, id: `set-${setIndex + 1}`, scoreA: 0, scoreB: 0 };
      delete next.pointLimit;
      if (setIndex === 2) next.pointLimit = decidingPointLimit;
      return [...current, next];
    });
  }

  async function requestPairing(mode: 'random' | 'balanced' | 'fresh' | 'rematch') {
    setPairingBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/play-posts/${postId}/pairing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось собрать пары');
      const teamA = Array.isArray(data.teamA) ? data.teamA.map(Number) : [];
      const teamB = Array.isArray(data.teamB) ? data.teamB.map(Number) : [];
      if (teamA.length !== 2 || teamB.length !== 2) throw new Error('Сервис вернул неполные пары');
      setPairingMode('fixed');
      setMatches((current) => current.map((match) => ({ ...match, teamA, teamB, scoreA: 0, scoreB: 0 })));
      const labels = { random: 'Случайная жеребьёвка', balanced: 'Равные пары', fresh: 'Новые сочетания', rematch: 'Пары прошлого матча' };
      setPairingNote(`${labels[mode]} · разница силы пар: ${Number(data.ratingDifference || 0)}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Ошибка жеребьёвки');
    } finally {
      setPairingBusy(false);
    }
  }

  async function submit() {
    if (format === 'king_sideout') {
      if (!kingRounds.length) {
        setError('Для KING нужно чётное число игроков: от 6 до 10');
        return;
      }
      if (kingRounds.some((round) => Math.max(...round.pairs.map((pair) => pair.points)) === 0)) {
        setError('Укажите очки пар в каждом раунде KING');
        return;
      }
    } else {
      if (!matches.length) {
        setError(format === 'thai_8' ? 'Для тайского формата нужно ровно 8 игроков' : 'Для 2×2 нужно ровно 4 игрока');
        return;
      }
      if (matches.some((match) => match.scoreA === match.scoreB)) {
        setError('Укажите счёт всех матчей — ничья не допускается');
        return;
      }
      if (format === 'thai_8' && matches.some((match) => Math.max(match.scoreA, match.scoreB) !== pointLimit)) {
        setError(`Победитель каждого матча должен набрать ровно ${pointLimit} очков`);
        return;
      }
    }

    const payload: StructuredPlayResult = format === 'king_sideout'
      ? {
          version: 2,
          format,
          pairingMode,
          pointLimit: PLAY_KING_POINT_LIMIT,
          matches: [],
          roundDurationMinutes,
          rounds: kingRounds,
        }
      : { version: 2, format, pairingMode, pointLimit, matches };
    setLoading(true);
    setError('');
    try {
      const response = await fetch(resultId ? `/api/play-results/${resultId}` : `/api/play-posts/${postId}/result`, {
        method: resultId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resultId ? { payload, expectedRevision } : { payload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Не удалось сохранить результат');
        return;
      }
      router.refresh();
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }

  const previewResult: StructuredPlayResult = format === 'king_sideout'
    ? { version: 2, format, pairingMode, pointLimit: PLAY_KING_POINT_LIMIT, matches: [], roundDurationMinutes, rounds: kingRounds }
    : { version: 2, format, pairingMode, pointLimit, matches: matches.filter((match) => match.scoreA !== match.scoreB) };
  const standings = format === 'king_sideout'
    ? (kingRounds.some((round) => round.pairs.some((pair) => pair.points > 0)) ? buildPlayResultStandings(previewResult) : [])
    : (previewResult.matches.length ? buildPlayResultStandings(previewResult) : []);
  const tours = format === 'thai_8'
    ? Array.from(new Set(matches.map((match) => match.tourNumber ?? 1)))
    : [];

  return (
    <div className="grid gap-5">
      {focusMode ? (
        <p className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 px-3 py-2 text-sm font-semibold text-emerald-100">
          {format === 'king_sideout' ? 'Внесите очки каждой пары в текущем раунде.' : 'Нажмите на победившую команду, затем выберите очки проигравших.'}
        </p>
      ) : null}

      <details open={!focusMode} className={focusMode ? 'rounded-xl border border-white/10 bg-white/[0.025] p-3' : 'contents'}>
        <summary className={focusMode ? 'flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-text-secondary' : 'hidden'}>
          <span>Проверить пары и настройки</span>
          <span className="shrink-0 text-xs font-semibold text-text-primary">{FORMAT_OPTIONS.find((option) => option.id === format)?.label}</span>
        </summary>
        <div className={focusMode ? 'mt-3 grid gap-5 border-t border-white/10 pt-3' : 'contents'}>
      <div className="grid grid-cols-3 gap-2">
        {FORMAT_OPTIONS.map((option) => (
          <button key={option.id} type="button" onClick={() => changeFormat(option.id)} className={`rounded-xl border p-3 text-left ${format === option.id ? 'border-brand bg-brand/10' : 'border-white/10 bg-surface/50'}`}>
            <strong className="block text-sm text-text-primary">{option.label}</strong>
            <span className="mt-1 hidden text-[11px] text-text-secondary sm:block">{option.hint}</span>
          </button>
        ))}
      </div>

      {format === 'king_sideout' ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-surface/40 p-3">
          <label className="text-xs text-text-secondary">Пары
            <select value={pairingMode} onChange={(event) => { const value = event.target.value as PlayPairingMode; setPairingMode(value); regenerate(format, value); }} className="mt-1 block rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary">
              <option value="fixed">Фиксированные</option><option value="random">Ротация как в турнире</option>
            </select>
          </label>
          <label className="text-xs text-text-secondary">Время раунда
            <select value={roundDurationMinutes} onChange={(event) => setRoundDurationMinutes(Number(event.target.value))} className="mt-1 block rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary">
              {Array.from({ length: PLAY_KING_MAX_TIMER - PLAY_KING_MIN_TIMER + 1 }, (_, index) => index + PLAY_KING_MIN_TIMER).map((value) => <option key={value} value={value}>{value} мин</option>)}
            </select>
          </label>
          <button type="button" onClick={() => regenerate()} className="rounded-lg border border-cyan-300/25 px-3 py-2 text-xs font-semibold text-cyan-100">↻ Переформировать</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-surface/40 p-3">
          {format === 'thai_8' ? <label className="text-xs text-text-secondary">Жеребьёвка состава
            <select value={pairingMode} onChange={(event) => { const value = event.target.value as PlayPairingMode; setPairingMode(value); regenerate(format, value); }} className="mt-1 block rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary"><option value="fixed">По списку</option><option value="random">Случайная</option></select>
          </label> : null}
          {format === 'classic_2x2' ? (
            <>
              <label className="text-xs text-text-secondary">Основные сеты до
                <select value={pointLimit} onChange={(event) => changePointLimit(Number(event.target.value))} className="mt-1 block rounded-lg border border-cyan-300/20 bg-surface px-3 py-2 text-sm font-bold text-text-primary">
                  {QUICK_POINT_LIMITS.map((value) => <option key={value} value={value}>{value} очков</option>)}
                </select>
              </label>
              <label className="text-xs text-text-secondary">Решающий сет до
                <select value={decidingPointLimit} onChange={(event) => changeDecidingPointLimit(Number(event.target.value))} className="mt-1 block rounded-lg border border-orange-300/25 bg-surface px-3 py-2 text-sm font-bold text-text-primary">
                  {QUICK_POINT_LIMITS.map((value) => <option key={value} value={value}>{value} очков</option>)}
                </select>
              </label>
              {submitterRole === 'organizer' && participantIds.length === 4 ? <div className="basis-full rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-3"><p className="text-xs font-bold text-text-primary">Собрать пары автоматически</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={pairingBusy} onClick={() => void requestPairing('balanced')} className="min-h-10 rounded-lg bg-cyan-300/15 px-3 text-xs font-bold text-cyan-100 disabled:opacity-40">⚖ Равные</button><button type="button" disabled={pairingBusy} onClick={() => void requestPairing('fresh')} className="min-h-10 rounded-lg border border-cyan-300/20 px-3 text-xs font-bold text-cyan-100 disabled:opacity-40">Новые сочетания</button><button type="button" disabled={pairingBusy} onClick={() => void requestPairing('random')} className="min-h-10 rounded-lg border border-white/15 px-3 text-xs font-bold text-text-primary disabled:opacity-40">Случайно</button><button type="button" disabled={pairingBusy} onClick={() => void requestPairing('rematch')} className="min-h-10 rounded-lg border border-white/15 px-3 text-xs font-bold text-text-primary disabled:opacity-40">Реванш парами</button></div>{pairingNote ? <p className="mt-2 text-[11px] text-emerald-200">✓ {pairingNote}</p> : null}</div> : null}
            </>
          ) : (
            <label className="text-xs text-text-secondary">Игра до
              <select value={pointLimit} onChange={(event) => changePointLimit(Number(event.target.value))} className="mt-1 block rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm font-bold text-text-primary">
                {QUICK_POINT_LIMITS.map((value) => <option key={value} value={value}>{value} очков</option>)}
              </select>
            </label>
          )}
          {format === 'thai_8' ? <button type="button" onClick={() => regenerate()} className="rounded-lg border border-cyan-300/25 px-3 py-2 text-xs font-semibold text-cyan-100">↻ Переформировать</button> : null}
          <p className="basis-full text-[11px] leading-5 text-text-secondary">Нажмите на победившую команду и укажите только очки проигравших — итоговый счёт подставится автоматически.{format === 'classic_2x2' ? ` Третий, решающий сет автоматически будет до ${decidingPointLimit}.` : ''}</p>
        </div>
      )}
        </div>
      </details>

      {format === 'king_sideout' ? (
        <div className="grid gap-3">
          <p className="text-xs text-text-secondary">{kingRounds.length} раундов · {kingRounds[0]?.pairs.length ?? 0} пар · максимум {PLAY_KING_POINT_LIMIT} очков у пары за раунд</p>
          {kingRounds.map((round, roundIndex) => (
            <section key={round.id} className="rounded-xl border border-white/10 bg-surface/50 p-3">
              <h4 className="mb-2 text-sm font-bold text-text-primary">Раунд {round.roundNumber} · {roundDurationMinutes} мин</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {round.pairs.map((pair, pairIndex) => (
                  <label key={`${round.id}-${pair.pairIndex}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-card/50 px-3 py-2 text-xs font-semibold text-text-primary">
                    <span>{pair.team.map((id) => names.get(id) || `#${id}`).join(' + ')}</span>
                    <ScoreNumberInput
                      ariaLabel={`Очки пары ${pairIndex + 1}, раунд ${round.roundNumber}`}
                      value={pair.points}
                      max={PLAY_KING_POINT_LIMIT}
                      onUpdate={(value) => updateKingPoints(roundIndex, pairIndex, value)}
                      className="h-10 w-14 rounded-lg border border-white/10 bg-surface text-center text-lg font-black text-text-primary"
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : format === 'thai_8' ? (
        <div className="grid gap-3">
          <p className="text-xs text-text-secondary">4 тура · по 2 матча в туре · пары сформированы турнирным модулем Thai</p>
          {tours.map((tourNumber) => (
            <section key={tourNumber} className="rounded-xl border border-white/10 bg-surface/50 p-3">
              <h4 className="mb-2 text-sm font-bold text-text-primary">Тур {tourNumber}</h4>
              <div className="grid gap-2">
                {matches.map((match, index) => match.tourNumber === tourNumber ? (
                  <ScoreRow key={match.id} match={match} index={index} names={names} participantVisuals={participantVisuals} pointLimit={match.pointLimit ?? pointLimit} onSetResult={setQuickScore} onSetManualResult={setManualScore} />
                ) : null)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-2">
          {matches.map((match, index) => <ScoreRow key={match.id} match={match} index={index} names={names} participantVisuals={participantVisuals} pointLimit={match.pointLimit ?? pointLimit} onSetResult={setQuickScore} onSetManualResult={setManualScore} allowExtendedManual isDeciding={index === 2} />)}
        </div>
      )}

      {format === 'classic_2x2' && matches.length ? <button type="button" onClick={addSet} className="w-fit text-xs font-semibold text-cyan-200">{matches.length === 2 ? `+ Добавить решающий сет до ${decidingPointLimit}` : '+ Добавить ещё сет'}</button> : null}
      {standings.length > 4 ? (
        <div className="rounded-xl border border-white/10 p-3">
          <p className="text-xs font-bold text-text-secondary">Предварительный итог</p>
          <ol className="mt-2 grid gap-1 text-xs text-text-primary">
            {standings.map((row, index) => <li key={row.userId}>{index + 1}. {names.get(row.userId)} · {format === 'king_sideout' ? `${row.pointsFor} очков` : `${row.wins} побед · ${row.diff > 0 ? '+' : ''}${row.diff}`}</li>)}
          </ol>
        </div>
      ) : null}
      {error ? <p className="text-xs text-rose-200" role="alert">{error}</p> : null}
      <button type="button" onClick={() => void submit()} disabled={loading || (ratedGuestsBlockApproval && submitterRole === 'organizer') || (format === 'king_sideout' ? !kingRounds.length : !matches.length)} className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50">{loading ? 'Сохраняю…' : resultId ? 'Сохранить исправление' : submitterRole === 'organizer' ? 'Утвердить результат' : 'Отправить организатору'}</button>
      <p className={`text-xs ${ratedGuestsBlockApproval ? 'text-amber-200' : 'text-text-secondary'}`}>{ratedGuestsBlockApproval
        ? `Рейтинговый результат пока нельзя утвердить: ${guestCount} участник(а) без аккаунта. Привяжите гостей или переведите игру в обычную.`
        : guestCount
          ? `${guestCount} гость(я) войдут в статистику обычной игры без начисления рейтинга.`
          : submitterRole === 'organizer'
            ? 'После утверждения результат появится в кабинетах игроков. Игровой рейтинг считается отдельно от турнирного.'
            : 'Счёт сохранится как предложение. Официальным его сделает организатор или администратор.'}</p>
    </div>
  );
}

function ScoreRow({
  match,
  index,
  names,
  participantVisuals,
  pointLimit,
  onSetResult,
  onSetManualResult,
  allowExtendedManual = false,
  isDeciding = false,
}: {
  match: PlayResultMatch;
  index: number;
  names: Map<number, string>;
  participantVisuals: Map<number, QuickWinnerScoreMember>;
  pointLimit: number;
  onSetResult: (index: number, winner: 'A' | 'B', loserPoints: number) => void;
  onSetManualResult: (index: number, scoreA: number, scoreB: number) => void;
  allowExtendedManual?: boolean;
  isDeciding?: boolean;
}) {
  const initialQuickScore = parseQuickWinnerScore(pointLimit, match.scoreA, match.scoreB);
  const [entryMode, setEntryMode] = useState<'quick' | 'manual'>(() => Boolean(initialQuickScore) || (match.scoreA === 0 && match.scoreB === 0) ? 'quick' : 'manual');
  const teamA = match.teamA.map((id) => names.get(id) || `#${id}`).join(' + ');
  const teamB = match.teamB.map((id) => names.get(id) || `#${id}`).join(' + ');
  const teamAMembers = match.teamA.map((id) => participantVisuals.get(id) || { name: names.get(id) || `#${id}`, registered: false });
  const teamBMembers = match.teamB.map((id) => participantVisuals.get(id) || { name: names.get(id) || `#${id}`, registered: false });
  const complete = match.scoreA !== match.scoreB;
  const matchLabel = match.tourNumber ? `Тур ${match.tourNumber} · Матч ${(index % 2) + 1}` : isDeciding ? `Решающий сет ${index + 1}` : `Сет ${index + 1}`;
  const manualMax = allowExtendedManual ? 99 : pointLimit;

  return (
    <article
      id={`play-result-match-${index + 1}`}
      data-play-score-row
      data-match-index={index}
      data-complete={complete}
      className="rounded-xl border border-white/10 bg-surface/60 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200">{matchLabel}</p>
          <p className="mt-1 text-xs text-text-secondary">Игра до {pointLimit}</p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-card/30 p-1">
          <button type="button" onClick={() => setEntryMode('quick')} className={`min-h-10 rounded-lg px-3 text-xs font-bold ${entryMode === 'quick' ? 'bg-brand text-white' : 'text-text-secondary'}`}>Быстрый ввод</button>
          <button type="button" onClick={() => setEntryMode('manual')} className={`min-h-10 rounded-lg px-3 text-xs font-bold ${entryMode === 'manual' ? 'bg-white text-surface' : 'text-text-secondary'}`}>Полный ввод</button>
        </div>
      </div>

      <div className="mt-3">
        {entryMode === 'quick' ? (
          <QuickWinnerScoreInput
            teamA={teamA}
            teamB={teamB}
            teamAMembers={teamAMembers}
            teamBMembers={teamBMembers}
            target={pointLimit}
            scoreA={match.scoreA}
            scoreB={match.scoreB}
            compact
            tone="surface"
            resetKey={`${match.id}:${pointLimit}`}
            onComplete={(score) => onSetResult(index, score.winner, score.loserPoints)}
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <label className="rounded-xl border border-white/10 bg-card/40 p-3 text-xs font-semibold text-text-primary">
              <span className="block min-h-8">{teamA}</span>
              <ScoreNumberInput
                ariaLabel={`Счёт команды A, ${matchLabel}`}
                value={match.scoreA}
                max={manualMax}
                onUpdate={(value) => onSetManualResult(index, Number(value), match.scoreB)}
                className="mt-2 h-12 w-full rounded-lg border border-white/10 bg-surface text-center text-xl font-black text-text-primary"
              />
            </label>
            <span className="text-center text-xl font-black text-text-secondary">:</span>
            <label className="rounded-xl border border-white/10 bg-card/40 p-3 text-xs font-semibold text-text-primary">
              <span className="block min-h-8">{teamB}</span>
              <ScoreNumberInput
                ariaLabel={`Счёт команды Б, ${matchLabel}`}
                value={match.scoreB}
                max={manualMax}
                onUpdate={(value) => onSetManualResult(index, match.scoreA, Number(value))}
                className="mt-2 h-12 w-full rounded-lg border border-white/10 bg-surface text-center text-xl font-black text-text-primary"
              />
            </label>
            <p className="text-[11px] leading-5 text-text-secondary sm:col-span-3">
              {allowExtendedManual ? 'Для нестандартной концовки можно ввести полный счёт, например 22:20.' : `Для этого формата победитель должен набрать ${pointLimit} очков.`}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

function ScoreNumberInput({
  ariaLabel,
  value,
  max,
  onUpdate,
  className,
}: {
  ariaLabel: string;
  value: number;
  max: number;
  onUpdate: (value: string) => void;
  className: string;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <input
      aria-label={ariaLabel}
      inputMode="numeric"
      type="number"
      min="0"
      max={max}
      value={draft}
      onFocus={() => {
        if (draft === '0') setDraft('');
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        setDraft(nextValue);
        if (nextValue !== '') onUpdate(nextValue);
      }}
      onBlur={() => {
        if (draft === '') {
          setDraft('0');
          onUpdate('0');
        }
      }}
      className={className}
    />
  );
}
