'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Dispatch } from 'react';
import type { Action } from '@/lib/judge-scoreboard/reducer';
import type { MatchState, TeamId } from '@/lib/judge-scoreboard/types';
import {
  getAdvantage,
  getCurrentTarget,
  isDeuce,
  isMatchPoint,
  isSetPoint,
} from '@/lib/judge-scoreboard/rules';
import { ConfirmModal } from './ConfirmModal';
import { EditFieldModal } from './EditFieldModal';
import { useDoubleTap } from './useDoubleTap';
import { useLongPress } from './useLongPress';

interface Props {
  state: MatchState;
  dispatch: Dispatch<Action>;
}

type EditField =
  | { kind: 'teamA' }
  | { kind: 'teamB' }
  | { kind: 'matchName' }
  | { kind: 'judgeName' }
  | { kind: 'courtId' };

type ConfirmKind = 'resetSet' | 'finishMatch' | 'backToSetup';

function vibrate(ms: number) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      /* ignore */
    }
  }
}

function toggleFullscreen() {
  if (typeof document === 'undefined') return;
  const doc = document as Document & {
    webkitFullscreenElement?: Element;
    webkitExitFullscreen?: () => Promise<void>;
  };
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
    (el.requestFullscreen?.() || el.webkitRequestFullscreen?.())?.catch(() => {
      /* ignore */
    });
  } else {
    (document.exitFullscreen?.() || doc.webkitExitFullscreen?.())?.catch(() => {
      /* ignore */
    });
  }
}

export function MatchScreen({ state, dispatch }: Props) {
  const { core, config, meta, history } = state;
  const [editField, setEditField] = useState<EditField | null>(null);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [addMenuTeam, setAddMenuTeam] = useState<TeamId | null>(null);

  const target = getCurrentTarget(config, core.currentSet);

  const statusBadge = useMemo(() => {
    if (core.status === 'finished') return null;
    const matchPoint = isMatchPoint(core, config);
    if (matchPoint) {
      return { label: `Match point ${matchPoint}`, tone: 'rose' as const };
    }
    const setPoint = isSetPoint(core.scoreA, core.scoreB, target);
    if (setPoint) return { label: `Set point ${setPoint}`, tone: 'amber' as const };
    const deuce = isDeuce(core.scoreA, core.scoreB, target);
    if (deuce) return { label: 'Deuce', tone: 'sky' as const };
    const adv = getAdvantage(core.scoreA, core.scoreB, target);
    if (adv && (core.scoreA >= target - 1 || core.scoreB >= target - 1)) {
      return { label: `Advantage ${adv}`, tone: 'sky' as const };
    }
    return null;
  }, [core, config, target]);

  const handleAddPoint = useCallback(
    (team: TeamId, delta: 1 | 2 | 3) => {
      dispatch({ type: 'ADD_POINT', team, delta });
      vibrate(50);
    },
    [dispatch],
  );

  const handleRemovePoint = useCallback(
    (team: TeamId) => {
      dispatch({ type: 'REMOVE_POINT', team });
      vibrate(30);
    },
    [dispatch],
  );

  const onEditMatch = useDoubleTap(() => setEditField({ kind: 'matchName' }));
  const onEditJudge = useDoubleTap(() => setEditField({ kind: 'judgeName' }));
  const onEditCourt = useDoubleTap(() => setEditField({ kind: 'courtId' }));
  const onEditTeamA = useDoubleTap(() => setEditField({ kind: 'teamA' }));
  const onEditTeamB = useDoubleTap(() => setEditField({ kind: 'teamB' }));
  const onToggleServer = useDoubleTap(() => {
    dispatch({ type: 'TOGGLE_SERVER' });
    vibrate(35);
  });

  const longPressA = useLongPress({
    onClick: () => handleAddPoint('A', 1),
    onLongPress: () => setAddMenuTeam('A'),
  });
  const longPressB = useLongPress({
    onClick: () => handleAddPoint('B', 1),
    onLongPress: () => setAddMenuTeam('B'),
  });

  const leftTeam = core.leftTeam;
  const rightTeam: TeamId = leftTeam === 'A' ? 'B' : 'A';
  const leftName = leftTeam === 'A' ? core.teamA : core.teamB;
  const rightName = rightTeam === 'A' ? core.teamA : core.teamB;
  const leftScore = leftTeam === 'A' ? core.scoreA : core.scoreB;
  const rightScore = rightTeam === 'A' ? core.scoreA : core.scoreB;
  const leftSets = leftTeam === 'A' ? core.setsA : core.setsB;
  const rightSets = rightTeam === 'A' ? core.setsA : core.setsB;

  const onEditLeft = leftTeam === 'A' ? onEditTeamA : onEditTeamB;
  const onEditRight = rightTeam === 'A' ? onEditTeamA : onEditTeamB;

  const editFieldLabel: Record<EditField['kind'], string> = {
    teamA: 'Команда A',
    teamB: 'Команда B',
    matchName: 'Название матча',
    judgeName: 'Имя судьи',
    courtId: 'Номер корта',
  };
  const editFieldValue = editField
    ? editField.kind === 'teamA'
      ? core.teamA
      : editField.kind === 'teamB'
        ? core.teamB
        : editField.kind === 'matchName'
          ? meta.matchName
          : editField.kind === 'judgeName'
            ? meta.judgeName
            : meta.courtId
    : '';

  const onSaveEdit = (value: string) => {
    if (!editField) return;
    if (editField.kind === 'teamA') dispatch({ type: 'UPDATE_TEAM_NAME', team: 'A', name: value });
    else if (editField.kind === 'teamB')
      dispatch({ type: 'UPDATE_TEAM_NAME', team: 'B', name: value });
    else if (editField.kind === 'matchName')
      dispatch({ type: 'UPDATE_META', patch: { matchName: value } });
    else if (editField.kind === 'judgeName')
      dispatch({ type: 'UPDATE_META', patch: { judgeName: value } });
    else if (editField.kind === 'courtId')
      dispatch({ type: 'UPDATE_META', patch: { courtId: value } });
    setEditField(null);
  };

  const toneClass = (tone: 'rose' | 'amber' | 'sky') =>
    tone === 'rose'
      ? 'bg-rose-500/90 text-white'
      : tone === 'amber'
        ? 'bg-amber-400 text-slate-900'
        : 'bg-sky-400 text-slate-900';

  const finished = core.status === 'finished';
  const winnerName = core.winner === 'A' ? core.teamA : core.winner === 'B' ? core.teamB : null;
  const servingName = core.server === 'A' ? core.teamA : core.teamB;

  return (
    <div
      className="relative flex min-h-[100dvh] w-full flex-col bg-[#050914] text-white select-none"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 10px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 10px)',
      }}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-2 border-b border-white/10 pb-2 text-xs">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onPointerUp={onEditCourt}
            className="text-left uppercase tracking-widest text-white/60"
          >
            Корт <span className="text-white">{meta.courtId}</span>
          </button>
          <button
            type="button"
            onPointerUp={onEditMatch}
            className="max-w-[55vw] truncate text-left text-sm font-bold text-white/90"
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.02em' }}
          >
            {meta.matchName || 'Без названия'}
          </button>
          <button
            type="button"
            onPointerUp={onEditJudge}
            className="text-left text-[10px] uppercase tracking-widest text-white/40"
          >
            Судья: {meta.judgeName || '—'}
          </button>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div
            className="text-base font-black uppercase text-white"
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}
          >
            Сет {core.currentSet}
          </div>
          <div className="text-xs uppercase tracking-widest text-white/60">
            по сетам {core.setsA}:{core.setsB}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/40">
            до {target} {config.winByTwo ? '· win by 2' : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label="Fullscreen"
          className="rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-[10px] uppercase tracking-widest text-white/70 active:bg-white/10"
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          ⛶
        </button>
      </header>

      {/* Status badge */}
      <div className="mt-2 flex min-h-[56px] flex-col items-center justify-center gap-2">
        {statusBadge ? (
          <div
            className={`rounded-full px-4 py-1 text-sm font-black uppercase tracking-widest ${toneClass(statusBadge.tone)}`}
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.1em' }}
          >
            {statusBadge.label}
          </div>
        ) : (
          <div className="h-[28px]" />
        )}

        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onPointerUp={onToggleServer}
            className="rounded-full border border-sky-400/35 bg-sky-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-sky-100 active:bg-sky-500/20"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            title="Двойной тап — исправить подачу"
          >
            🏐 Подача: {servingName}
          </button>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'TOGGLE_SERVER' });
              vibrate(35);
            }}
            className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-white/70 active:bg-white/10"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            aria-label="Исправить подачу"
            title="Исправить подачу"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Score */}
      <div className="flex flex-1 flex-col justify-center">
        <div className="grid grid-cols-2 gap-3 text-center">
          {/* Left */}
          <div className={`flex flex-col items-center ${core.server === leftTeam ? 'opacity-100' : 'opacity-90'}`}>
            <button
              type="button"
              onPointerUp={onEditLeft}
              className="mb-1 max-w-full truncate px-2 text-sm font-bold uppercase tracking-wide text-white/80"
              style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.04em' }}
              title="Двойной тап — редактировать"
            >
              {leftName}
            </button>
            <div className="flex items-center gap-1 text-xs uppercase tracking-widest text-white/40">
              {core.server === leftTeam && <span aria-hidden>🏐</span>}
              <span>{leftSets} сет.</span>
            </div>
            <div
              className={`mt-1 font-black leading-none ${core.server === leftTeam ? 'text-white drop-shadow-[0_0_25px_rgba(56,189,248,0.55)]' : 'text-white/80'}`}
              style={{
                fontFamily: 'Bebas Neue, sans-serif',
                fontSize: 'clamp(7rem, 26vw, 16rem)',
              }}
            >
              {leftScore}
            </div>
          </div>
          {/* Right */}
          <div className={`flex flex-col items-center ${core.server === rightTeam ? 'opacity-100' : 'opacity-90'}`}>
            <button
              type="button"
              onPointerUp={onEditRight}
              className="mb-1 max-w-full truncate px-2 text-sm font-bold uppercase tracking-wide text-white/80"
              style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.04em' }}
              title="Двойной тап — редактировать"
            >
              {rightName}
            </button>
            <div className="flex items-center gap-1 text-xs uppercase tracking-widest text-white/40">
              {core.server === rightTeam && <span aria-hidden>🏐</span>}
              <span>{rightSets} сет.</span>
            </div>
            <div
              className={`mt-1 font-black leading-none ${core.server === rightTeam ? 'text-white drop-shadow-[0_0_25px_rgba(56,189,248,0.55)]' : 'text-white/80'}`}
              style={{
                fontFamily: 'Bebas Neue, sans-serif',
                fontSize: 'clamp(7rem, 26vw, 16rem)',
              }}
            >
              {rightScore}
            </div>
          </div>
        </div>
      </div>

      {/* Main +1 buttons */}
      <div className="mt-2 grid grid-cols-2 gap-3">
        <button
          type="button"
          {...longPressA}
          disabled={finished}
          className="min-h-[120px] rounded-3xl bg-emerald-500 text-5xl font-black uppercase tracking-wide text-white shadow-lg shadow-emerald-500/30 transition active:scale-[0.97] active:bg-emerald-600 disabled:bg-white/5 disabled:text-white/30 disabled:shadow-none"
          style={{ fontFamily: 'Bebas Neue, sans-serif', touchAction: 'manipulation' }}
          aria-label={`+1 ${core.teamA}`}
        >
          +1 {core.teamA.length <= 6 ? core.teamA : 'A'}
        </button>
        <button
          type="button"
          {...longPressB}
          disabled={finished}
          className="min-h-[120px] rounded-3xl bg-sky-500 text-5xl font-black uppercase tracking-wide text-white shadow-lg shadow-sky-500/30 transition active:scale-[0.97] active:bg-sky-600 disabled:bg-white/5 disabled:text-white/30 disabled:shadow-none"
          style={{ fontFamily: 'Bebas Neue, sans-serif', touchAction: 'manipulation' }}
          aria-label={`+1 ${core.teamB}`}
        >
          +1 {core.teamB.length <= 6 ? core.teamB : 'B'}
        </button>
      </div>

      {/* -1 row */}
      <div className="mt-2 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handleRemovePoint('A')}
          disabled={finished || core.scoreA <= 0}
          className="min-h-[56px] rounded-2xl border border-emerald-400/30 bg-emerald-500/10 text-lg font-bold uppercase tracking-wide text-emerald-100 active:bg-emerald-500/20 disabled:border-white/10 disabled:bg-white/5 disabled:text-white/20"
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          −1 A
        </button>
        <button
          type="button"
          onClick={() => handleRemovePoint('B')}
          disabled={finished || core.scoreB <= 0}
          className="min-h-[56px] rounded-2xl border border-sky-400/30 bg-sky-500/10 text-lg font-bold uppercase tracking-wide text-sky-100 active:bg-sky-500/20 disabled:border-white/10 disabled:bg-white/5 disabled:text-white/20"
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          −1 B
        </button>
      </div>

      {/* Bottom panel */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'UNDO' })}
          disabled={history.length === 0}
          className="min-h-[56px] rounded-2xl border border-white/20 bg-white/10 text-xs font-bold uppercase tracking-widest text-white active:bg-white/20 disabled:border-white/5 disabled:bg-white/5 disabled:text-white/20"
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          ↶ Undo
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'MANUAL_SWAP_SIDES' })}
          className="min-h-[56px] rounded-2xl border border-white/20 bg-white/5 text-xs font-bold uppercase tracking-widest text-white active:bg-white/10"
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          ⇄ Swap
        </button>
        <button
          type="button"
          onClick={() => setConfirm('resetSet')}
          className="min-h-[56px] rounded-2xl border border-rose-400/40 bg-rose-500/15 text-xs font-bold uppercase tracking-widest text-rose-100 active:bg-rose-500/25"
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          ⟲ Сет
        </button>
        <button
          type="button"
          onClick={() => setConfirm('finishMatch')}
          className="min-h-[56px] rounded-2xl border border-emerald-400/40 bg-emerald-500/15 text-xs font-bold uppercase tracking-widest text-emerald-100 active:bg-emerald-500/25"
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          ✓ Финиш
        </button>
      </div>

      {/* Side-swap modal */}
      {core.pendingSideSwap && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-5"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-amber-400/40 bg-[#1a1408] p-6 text-center text-white shadow-2xl">
            <div
              className="text-5xl font-black uppercase tracking-wide text-amber-300"
              style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}
            >
              Смена сторон!
            </div>
            <p className="mt-3 text-sm text-white/70">
              Суммарный счёт: {core.scoreA + core.scoreB}
            </p>
            <button
              type="button"
              onClick={() => dispatch({ type: 'ACCEPT_SIDE_SWAP' })}
              className="mt-5 min-h-[72px] w-full rounded-2xl bg-amber-400 text-2xl font-black uppercase tracking-wide text-slate-900 active:bg-amber-500"
              style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}
            >
              Ок, поменяли
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'DISMISS_SIDE_SWAP' })}
              className="mt-2 min-h-[44px] w-full rounded-xl border border-white/20 bg-white/5 text-xs font-semibold uppercase tracking-widest text-white/70 active:bg-white/10"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              Пропустить
            </button>
          </div>
        </div>
      )}

      {/* Winner overlay */}
      {finished && winnerName && (
        <div
          className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/90 p-5 text-center text-white"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
          }}
        >
          <div
            className="text-2xl font-bold uppercase tracking-widest text-white/60"
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.1em' }}
          >
            Победитель
          </div>
          <div
            className="mt-3 text-6xl font-black uppercase text-emerald-300 drop-shadow-[0_0_30px_rgba(52,211,153,0.55)]"
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.04em' }}
          >
            {winnerName}
          </div>
          <div className="mt-3 text-xl font-bold text-white/80">
            {core.setsA}:{core.setsB} по сетам
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'BACK_TO_SETUP' })}
            className="mt-8 min-h-[80px] w-full max-w-sm rounded-3xl bg-emerald-500 text-2xl font-black uppercase tracking-wide text-white active:bg-emerald-600"
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}
          >
            Новый матч
          </button>
        </div>
      )}

      {/* Add point menu (long-press) */}
      {addMenuTeam && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-5"
          role="dialog"
          aria-modal="true"
          onClick={() => setAddMenuTeam(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b1222] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p
              className="mb-3 text-center text-xs uppercase tracking-widest text-white/50"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              +N команде {addMenuTeam}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    handleAddPoint(addMenuTeam, n as 1 | 2 | 3);
                    setAddMenuTeam(null);
                  }}
                  className="min-h-[80px] rounded-2xl bg-white/10 text-4xl font-black text-white active:bg-white/20"
                  style={{ fontFamily: 'Bebas Neue, sans-serif' }}
                >
                  +{n}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAddMenuTeam(null)}
              className="mt-3 min-h-[44px] w-full rounded-xl border border-white/20 bg-white/5 text-xs font-bold uppercase tracking-widest text-white/70 active:bg-white/10"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Edit field modal */}
      {editField && (
        <EditFieldModal
          label={editFieldLabel[editField.kind]}
          initialValue={editFieldValue}
          onSave={onSaveEdit}
          onCancel={() => setEditField(null)}
        />
      )}

      {/* Confirm modals */}
      {confirm === 'resetSet' && (
        <ConfirmModal
          title="Сбросить сет?"
          message={`Текущий счёт ${core.scoreA}:${core.scoreB} будет обнулён.`}
          confirmLabel="Сбросить"
          tone="danger"
          onConfirm={() => {
            dispatch({ type: 'RESET_SET' });
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'finishMatch' && (
        <ConfirmModal
          title="Завершить матч?"
          message="Матч будет помечен как завершённый."
          confirmLabel="Завершить"
          tone="success"
          onConfirm={() => {
            dispatch({ type: 'FINISH_MATCH' });
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
