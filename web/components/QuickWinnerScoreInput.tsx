'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildQuickWinnerScore,
  parseQuickWinnerScore,
  type QuickWinnerScore,
  type QuickWinnerSide,
} from '@/lib/quick-winner-score';

type QuickWinnerScoreTone = 'light' | 'surface';

export interface QuickWinnerScoreMember {
  name: string;
  avatarUrl?: string | null;
  registered?: boolean;
}

interface QuickWinnerScoreInputProps {
  teamA: string;
  teamB: string;
  target: number;
  scoreA?: number;
  scoreB?: number;
  teamAMembers?: QuickWinnerScoreMember[];
  teamBMembers?: QuickWinnerScoreMember[];
  teamAKicker?: string;
  teamBKicker?: string;
  disabled?: boolean;
  compact?: boolean;
  tone?: QuickWinnerScoreTone;
  resetKey?: string | number;
  onComplete: (score: QuickWinnerScore) => void;
}

const TONE = {
  light: {
    prompt: 'text-[#6e7787]',
    teamIdleA: 'border-[#b9cbea] bg-[#f1f6ff] text-[#172033] hover:border-[#2463eb]',
    teamIdleB: 'border-[#edc0b4] bg-[#fff5f0] text-[#172033] hover:border-[#e65324]',
    teamMuted: 'border-[#d8d2c6] bg-[#f1eee7] text-[#172033] opacity-55',
    teamSelectedA: 'border-[#2463eb] bg-[#2463eb] text-white shadow-lg',
    teamSelectedB: 'border-[#e65324] bg-[#e65324] text-white shadow-lg',
    change: 'text-[#e65324]',
    chip: 'border-[#d8d2c6] bg-[#f8f6f1] text-[#172033] hover:border-[#e65324]',
    chipSelected: 'border-[#e65324] bg-[#fff0e8] text-[#a72f0a]',
    result: 'border-[#8bcdb8] bg-[#e9f8f2] text-[#12634d]',
  },
  surface: {
    prompt: 'text-text-secondary',
    teamIdleA: 'border-cyan-300/20 bg-cyan-300/[0.06] text-text-primary hover:border-cyan-300/50',
    teamIdleB: 'border-orange-300/20 bg-orange-300/[0.06] text-text-primary hover:border-orange-300/50',
    teamMuted: 'border-white/10 bg-card/25 text-text-primary opacity-55',
    teamSelectedA: 'border-cyan-300/60 bg-cyan-300/15 text-cyan-50 shadow-lg',
    teamSelectedB: 'border-orange-300/60 bg-orange-300/15 text-orange-50 shadow-lg',
    change: 'text-cyan-200',
    chip: 'border-white/10 bg-card/50 text-text-primary hover:border-emerald-300/40',
    chipSelected: 'border-emerald-300/50 bg-emerald-400/15 text-emerald-100',
    result: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100',
  },
} satisfies Record<QuickWinnerScoreTone, Record<string, string>>;

export function QuickWinnerScoreInput({
  teamA,
  teamB,
  target,
  scoreA = 0,
  scoreB = 0,
  teamAMembers,
  teamBMembers,
  teamAKicker = 'Команда A',
  teamBKicker = 'Команда Б',
  disabled = false,
  compact = false,
  tone = 'surface',
  resetKey,
  onComplete,
}: QuickWinnerScoreInputProps) {
  const currentScore = useMemo(
    () => parseQuickWinnerScore(target, scoreA, scoreB),
    [scoreA, scoreB, target],
  );
  const [winner, setWinner] = useState<QuickWinnerSide | null>(() => currentScore?.winner ?? null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const styles = TONE[tone];
  const visibleScore = currentScore?.winner === winner ? currentScore : null;

  useEffect(() => {
    setWinner(parseQuickWinnerScore(target, scoreA, scoreB)?.winner ?? null);
    // resetKey intentionally represents a different match/set; score changes after
    // a chip click must not collapse the open losing-score chooser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, target]);

  function chooseWinner(side: QuickWinnerSide) {
    const nextWinner = winner === side ? null : side;
    setWinner(nextWinner);
    if (nextWinner) {
      window.requestAnimationFrame(() => {
        chipsRef.current?.querySelector<HTMLButtonElement>('button[data-loser-score]')?.focus();
      });
    }
  }

  function submit(loserPoints: number) {
    if (!winner) return;
    onComplete(buildQuickWinnerScore(target, winner, loserPoints));
  }

  return (
    <div className="grid gap-3">
      <p className={`text-center text-xs font-black uppercase tracking-[0.16em] ${styles.prompt}`}>Кто выиграл?</p>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Выберите победившую команду">
        {([
          ['A', teamAKicker, teamA, teamAMembers],
          ['B', teamBKicker, teamB, teamBMembers],
        ] as const).map(([side, kicker, label, members]) => {
          const selected = winner === side;
          const className = selected
            ? side === 'A' ? styles.teamSelectedA : styles.teamSelectedB
            : winner
              ? styles.teamMuted
              : side === 'A' ? styles.teamIdleA : styles.teamIdleB;
          return (
            <button
              key={side}
              type="button"
              data-quick-winner
              aria-pressed={selected}
              disabled={disabled || !label}
              onClick={() => chooseWinner(side)}
              className={`${compact ? 'min-h-16' : 'min-h-24'} rounded-2xl border p-3 text-left transition active:scale-[.99] disabled:opacity-40 ${className}`}
            >
              <span className="block text-[10px] font-black uppercase tracking-wider opacity-60">{kicker}</span>
              <span className="mt-2 flex items-center gap-2">
                {members?.length ? <TeamMemberAvatars members={members} side={side} tone={tone} /> : null}
                <strong className="min-w-0 text-sm leading-5 sm:text-base">{label || 'Состав не определён'}</strong>
              </span>
              {selected ? <span className="mt-2 block text-xs font-black">Выбрано</span> : null}
            </button>
          );
        })}
      </div>

      {winner ? (
        <div ref={chipsRef}>
          <div className="flex items-center justify-between gap-2">
            <p className={`text-xs font-black uppercase tracking-[0.14em] ${styles.prompt}`}>Очки проигравших</p>
            <button type="button" disabled={disabled} onClick={() => setWinner(null)} className={`min-h-10 text-xs font-bold ${styles.change}`}>Сменить победителя</button>
          </div>
          <div className="mt-1 grid grid-cols-5 gap-1.5 sm:grid-cols-8" role="group" aria-label={`Очки проигравших, игра до ${target}`}>
            {Array.from({ length: target }, (_, loserPoints) => (
              <button
                key={loserPoints}
                type="button"
                data-loser-score={loserPoints}
                aria-pressed={visibleScore?.loserPoints === loserPoints}
                disabled={disabled}
                onClick={() => submit(loserPoints)}
                className={`min-h-11 rounded-xl border text-sm font-black transition active:scale-[.97] disabled:opacity-40 ${visibleScore?.loserPoints === loserPoints ? styles.chipSelected : styles.chip}`}
              >
                {loserPoints}
              </button>
            ))}
          </div>
          {visibleScore ? (
            <div className={`mt-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${styles.result}`} aria-live="polite">
              <p className="text-sm font-black">Итог: {visibleScore.scoreA}:{visibleScore.scoreB}</p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => chipsRef.current?.querySelector<HTMLButtonElement>('button[data-loser-score]')?.focus()}
                className="min-h-10 text-xs font-bold underline underline-offset-2"
              >
                Исправить
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TeamMemberAvatars({ members, side, tone }: { members: readonly QuickWinnerScoreMember[]; side: QuickWinnerSide; tone: QuickWinnerScoreTone }) {
  const ring = side === 'A' ? 'ring-cyan-300' : 'ring-orange-300';
  const fallback = side === 'A' ? 'bg-cyan-500 text-white' : 'bg-orange-500 text-white';
  const ringOffset = tone === 'light' ? 'ring-offset-white' : 'ring-offset-surface';
  return (
    <span className="flex shrink-0 -space-x-2" aria-hidden="true">
      {members.map((member, index) => {
        const guest = member.registered === false;
        const initials = member.name.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || '?';
        return member.avatarUrl && !guest ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${member.name}-${index}`}
            src={member.avatarUrl}
            alt=""
            className={`h-8 w-8 rounded-full object-cover ring-2 ${ring} ring-offset-2 ${ringOffset}`}
          />
        ) : (
          <span
            key={`${member.name}-${index}`}
            title={guest ? `${member.name} · гость` : member.name}
            className={`grid h-8 w-8 place-items-center rounded-full text-[10px] font-black ring-2 ring-offset-2 ${ringOffset} ${guest ? 'bg-amber-300 text-amber-950 ring-amber-100' : `${fallback} ${ring}`}`}
          >
            {initials}
          </span>
        );
      })}
    </span>
  );
}
