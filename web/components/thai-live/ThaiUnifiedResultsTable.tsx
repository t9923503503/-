'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { ThaiUnifiedResultsModel } from '@/lib/thai-live/unified-results';

type ViewMode = 'total' | 'r1' | 'r2';
type SortDirection = 'asc' | 'desc';
type SortState = { key: string; direction: SortDirection } | null;
type ResultRow = ThaiUnifiedResultsModel['players'][number];
type RoundStats = NonNullable<ResultRow['rounds']['r1']>;
type MatchStats = ResultRow['matches'][number];

const EMPTY_FILTER = 'all';

const MODE_LABELS: Record<ViewMode, string> = {
  total: 'Итог',
  r1: 'R1',
  r2: 'R2',
};

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

function formatSigned(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value > 0 ? `+${value}` : String(value);
}

function formatNumber(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : String(value);
}

function formatDecimal(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(2);
}

function formatPercent(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : `${Math.round(value)}%`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('ru-RU'))
    .join('');
}

function genderLabel(value: string | null | undefined): string {
  const key = String(value || '').trim().toUpperCase();
  if (key === 'M' || key === 'MALE' || key === 'М') return 'Мужчины';
  if (key === 'W' || key === 'F' || key === 'FEMALE' || key === 'Ж') return 'Женщины';
  return value || 'Без пола';
}

function statusLabel(value: string | null | undefined): string {
  switch (String(value || '').trim().toLowerCase()) {
    case 'confirmed':
    case 'finished':
      return 'Подтверждён';
    case 'live':
      return 'Идёт';
    case 'pending':
      return 'Ожидает';
    case 'cancelled':
      return 'Отменён';
    default:
      return value || '—';
  }
}

function safeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function getRound(row: ResultRow, mode: ViewMode): RoundStats | null {
  if (mode === 'r1') return row.rounds.r1 ?? null;
  if (mode === 'r2') return row.rounds.r2 ?? null;
  return null;
}

function getPlace(row: ResultRow, mode: ViewMode): number | null {
  if (mode === 'total') return row.finalGlobalPlace ?? row.finalLocalPlace ?? null;
  return getRound(row, mode)?.localPlace ?? null;
}

function numericSortValue(row: ResultRow, mode: ViewMode, key: string): number | null {
  if (key === 'place') return getPlace(row, mode);

  if (mode === 'total') {
    switch (key) {
      case 'matches':
        return row.overall.matches;
      case 'wins':
        return row.overall.wins;
      case 'winRate':
        return row.overall.winRate;
      case 'points':
        return row.overall.pointsP;
      case 'diff':
        return row.overall.diff;
      case 'scored':
        return row.overall.scored;
      case 'conceded':
        return row.overall.conceded;
      case 'ratio':
        return row.overall.ratio;
      case 'rating':
        return row.ratingPts;
      default:
        return null;
    }
  }

  const round = getRound(row, mode);
  if (!round) return null;
  if (key.startsWith('tour-')) {
    const index = Number(key.slice(5));
    return Number.isInteger(index) ? (round.tourDiffs[index] ?? null) : null;
  }
  switch (key) {
    case 'matches':
      return round.matches;
    case 'wins':
      return round.wins;
    case 'winRate':
      return round.winRate;
    case 'points':
      return round.pointsP;
    case 'diff':
      return round.diff;
    case 'scored':
      return round.scored;
    case 'conceded':
      return round.conceded;
    case 'kef':
      return round.kef;
    default:
      return null;
  }
}

function defaultDirection(key: string): SortDirection {
  return key === 'place' ? 'asc' : 'desc';
}

function PlaceBadge({ place }: { place: number | null }) {
  const podium = place != null && place <= 3;
  return (
    <span
      className={cx(
        'inline-flex h-9 min-w-9 items-center justify-center rounded-xl border px-2 text-sm font-black tabular-nums',
        place === 1
          ? 'border-amber-400 bg-amber-400 text-slate-950'
          : place === 2
            ? 'border-slate-400 bg-slate-200 text-slate-800'
            : place === 3
              ? 'border-orange-400 bg-orange-200 text-orange-950'
              : 'border-[var(--tur-border)] bg-[var(--tur-soft)] text-[var(--tur-text)]',
      )}
      aria-label={place == null ? 'Место не определено' : `${place} место`}
    >
      {podium ? <span className="sr-only">Место </span> : null}
      {place ?? '—'}
    </span>
  );
}

function Avatar({ row, size = 'md' }: { row: ResultRow; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-[10px]' : 'h-10 w-10 text-xs';
  const photoUrl = row.playerPhotoUrl.replace(/["\\\n\r\f]/g, (character) => encodeURIComponent(character));
  return (
    <span
      className={cx(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--tur-border)] bg-[var(--tur-soft)] font-black text-[var(--tur-muted)]',
        sizeClass,
      )}
      aria-hidden="true"
    >
      {row.playerPhotoUrl ? (
        // A background image avoids coupling player photos to Next.js remote image host configuration.
        <span
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${photoUrl}")` }}
        />
      ) : (
        initials(row.playerName)
      )}
    </span>
  );
}

function PlayerIdentity({ row, compact = false }: { row: ResultRow; compact?: boolean }) {
  const content = (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar row={row} size={compact ? 'sm' : 'md'} />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-[var(--tur-text)]">{row.playerName}</span>
        <span className="mt-0.5 block truncate text-[10px] uppercase tracking-[0.12em] text-[var(--tur-muted)]">
          {row.poolLabel}
        </span>
      </span>
    </span>
  );

  return row.playerId ? (
    <Link
      href={`/players/${encodeURIComponent(row.playerId)}`}
      className="block min-w-0 rounded-lg outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--tur-accent)]"
    >
      {content}
    </Link>
  ) : (
    content
  );
}

function PlayerRefLink({ player }: { player: MatchStats['partner'] }) {
  if (!player.playerName) return <>—</>;
  return player.playerId ? (
    <Link
      href={`/players/${encodeURIComponent(player.playerId)}`}
      className="rounded font-medium text-[var(--tur-text)] underline decoration-[var(--tur-border)] underline-offset-2 outline-none hover:decoration-[var(--tur-accent)] focus-visible:ring-2 focus-visible:ring-[var(--tur-accent)]"
    >
      {player.playerName}
    </Link>
  ) : (
    <span className="font-medium text-[var(--tur-text)]">{player.playerName}</span>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
  title,
  disabled = false,
}: {
  label: ReactNode;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  className?: string;
  title?: string;
  disabled?: boolean;
}) {
  const active = sort?.key === sortKey;
  return (
    <th scope="col" className={cx('whitespace-nowrap px-2 py-3 text-center', className)} title={title}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        disabled={disabled}
        className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg px-1.5 font-semibold text-[var(--tur-muted)] outline-none transition enabled:hover:bg-[var(--tur-soft)] enabled:hover:text-[var(--tur-text)] focus-visible:ring-2 focus-visible:ring-[var(--tur-accent)] disabled:cursor-not-allowed disabled:opacity-55"
        aria-label={`Сортировать: ${typeof label === 'string' ? label : sortKey}`}
      >
        {label}
        <span className={cx('text-[9px]', active ? 'text-[var(--tur-accent)]' : 'opacity-40')} aria-hidden="true">
          {disabled ? '—' : active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-[var(--tur-border)] bg-[var(--tur-soft)] px-3 py-2.5" title={hint}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--tur-muted)]">{label}</div>
      <div className="mt-1 text-base font-black tabular-nums text-[var(--tur-text)]">{value}</div>
    </div>
  );
}

function MatchLine({ match, roundLabel }: { match: MatchStats; roundLabel: string }) {
  const won = match.outcome === 'win';
  const lost = match.outcome === 'loss';
  return (
    <div
      className={cx(
        'rounded-xl border px-3 py-3',
        won
          ? 'border-emerald-500/25 bg-emerald-500/10'
          : lost
            ? 'border-rose-500/25 bg-rose-500/10'
            : 'border-[var(--tur-border)] bg-[var(--tur-soft)]',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--tur-muted)]">
          <span>{roundLabel}</span>
          <span>Тур {match.tourNo}</span>
          <span>{statusLabel(match.status)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-black tabular-nums text-[var(--tur-text)]">
            {match.teamScore ?? '—'}:{match.opponentScore ?? '—'}
          </span>
          <span
            className={cx(
              'rounded-full px-2 py-0.5 text-[10px] font-bold',
              won ? 'bg-emerald-500/15 text-emerald-600' : lost ? 'bg-rose-500/15 text-rose-600' : 'bg-[var(--tur-soft-strong)] text-[var(--tur-muted)]',
            )}
          >
            {won ? 'Победа' : lost ? 'Поражение' : 'Нет итога'}
          </span>
        </div>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-[var(--tur-muted)] sm:grid-cols-2">
        <div>
          <span className="opacity-70">Партнёр:</span>{' '}
          <PlayerRefLink player={match.partner} />
        </div>
        <div>
          <span className="opacity-70">Соперники:</span>{' '}
          {match.opponents.length
            ? match.opponents.map((opponent, index) => (
                <Fragment key={`${opponent.playerId || opponent.playerName}-${index}`}>
                  {index ? ' / ' : null}
                  <PlayerRefLink player={opponent} />
                </Fragment>
              ))
            : '—'}
        </div>
      </div>
      <div className="mt-2 flex gap-3 text-[11px] font-semibold tabular-nums text-[var(--tur-muted)]">
        <span>Δ {formatSigned(match.diff)}</span>
        <span>P {formatNumber(match.pointsP)}</span>
      </div>
    </div>
  );
}

function RoundDetail({ label, round }: { label: string; round: RoundStats | null }) {
  if (!round) {
    return (
      <section className="rounded-2xl border border-dashed border-[var(--tur-border)] p-4">
        <h4 className="font-bold text-[var(--tur-text)]">{label}</h4>
        <p className="mt-2 text-sm text-[var(--tur-muted)]">Данные раунда пока недоступны.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--tur-border)] bg-[var(--tur-card)] p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-black text-[var(--tur-text)]">{label}</h4>
          <p className="mt-1 text-xs text-[var(--tur-muted)]">
            {[
              round.round === 'r1' && round.courtLabel ? `Корт ${round.courtLabel}` : null,
              round.zoneLabel,
              round.localPlace != null ? `${round.localPlace} место` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Раунд без распределения'}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-black tabular-nums text-[var(--tur-accent)]">P {round.pointsP}</div>
          <div className="text-[10px] text-[var(--tur-muted)]">K {formatDecimal(round.kef)}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Матчи" value={formatNumber(round.matches)} />
        <StatTile label="В–П" value={`${round.wins}–${formatNumber(round.losses)}`} />
        <StatTile label="Δ" value={formatSigned(round.diff)} />
        <StatTile label="Мячи" value={`${round.scored}:${round.conceded}`} hint="Командные мячи начисляются каждому участнику пары" />
      </div>
      {round.tourDiffs.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {round.tourDiffs.map((diff, index) => (
            <span
              key={`${label}-tour-${index + 1}`}
              className="rounded-lg border border-[var(--tur-border)] bg-[var(--tur-soft)] px-2 py-1 text-[11px] font-semibold tabular-nums text-[var(--tur-text)]"
            >
              T{index + 1} {formatSigned(diff)}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ExpandedDetails({ row }: { row: ResultRow }) {
  const matches = row.matches.map((match) => ({ match, roundLabel: match.round === 'r1' ? 'R1' : 'R2' }));

  return (
    <div className="space-y-4 bg-[var(--tur-detail)] p-3 sm:p-5">
      <div className="grid gap-3 xl:grid-cols-2">
        <RoundDetail label="Раунд 1" round={row.rounds.r1 ?? null} />
        <RoundDetail label="Раунд 2" round={row.rounds.r2 ?? null} />
      </div>

      <section>
        <h4 className="text-xs font-black uppercase tracking-[0.14em] text-[var(--tur-muted)]">Расширенная статистика</h4>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          <StatTile label="Близкие победы" value={row.advanced.closeWins} />
          <StatTile label="Макс. победа" value={formatSigned(row.advanced.bestWin?.diff)} />
          <StatTile label="Макс. поражение" value={formatSigned(row.advanced.worstLoss?.diff)} />
          <StatTile label="Серия побед" value={row.advanced.longestWinStreak} />
          <StatTile label="Партнёры" value={row.advanced.uniquePartners} />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-black uppercase tracking-[0.14em] text-[var(--tur-muted)]">Все матчи · {matches.length}</h4>
          <span className="text-[10px] text-[var(--tur-muted)]">История розыгрышей не записывалась</span>
        </div>
        {matches.length ? (
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {matches.map(({ match, roundLabel }, index) => (
              <MatchLine key={`${roundLabel}-${match.matchId || index}`} match={match} roundLabel={roundLabel} />
            ))}
          </div>
        ) : (
          <p className="mt-2 rounded-xl border border-dashed border-[var(--tur-border)] p-4 text-sm text-[var(--tur-muted)]">
            Подтверждённых матчей пока нет.
          </p>
        )}
      </section>
    </div>
  );
}

function SummaryDesktopCells({ row, isOfficial }: { row: ResultRow; isOfficial: boolean }) {
  return (
    <>
      <td className="whitespace-nowrap px-2 py-3 text-center text-xs text-[var(--tur-muted)]">{row.poolLabel}</td>
      <td className="whitespace-nowrap px-2 py-3 text-center text-xs font-semibold text-[var(--tur-text)]">{row.finalZoneLabel || '—'}</td>
      <td className="px-2 py-3 text-center tabular-nums">{formatNumber(row.overall.matches)}</td>
      <td className="px-2 py-3 text-center font-semibold tabular-nums">{row.overall.wins}–{formatNumber(row.overall.losses)}</td>
      <td className="px-2 py-3 text-center tabular-nums">{formatPercent(row.overall.winRate)}</td>
      <td className="px-2 py-3 text-center text-base font-black tabular-nums text-[var(--tur-accent)]">{row.overall.pointsP}</td>
      <td className="px-2 py-3 text-center font-semibold tabular-nums">{formatSigned(row.overall.diff)}</td>
      <td className="px-2 py-3 text-center tabular-nums" title="Командные мячи начисляются каждому участнику пары">
        {row.overall.scored}:{row.overall.conceded}
      </td>
      <td className="px-2 py-3 text-center tabular-nums">{formatDecimal(row.overall.ratio)}</td>
      <td className="px-2 py-3 text-center font-black tabular-nums text-orange-500">{isOfficial ? (row.ratingPts ?? '—') : '—'}</td>
    </>
  );
}

function RoundDesktopCells({ row, mode, tourCount }: { row: ResultRow; mode: Exclude<ViewMode, 'total'>; tourCount: number }) {
  const round = getRound(row, mode);
  return (
    <>
      <td className="whitespace-nowrap px-2 py-3 text-center text-xs text-[var(--tur-muted)]">
        {round?.zoneLabel || (round?.courtLabel ? `Корт ${round.courtLabel}` : '—')}
      </td>
      {Array.from({ length: tourCount }, (_, index) => (
        <td key={`${row.playerId}-${mode}-tour-${index}`} className="px-2 py-3 text-center font-semibold tabular-nums">
          {formatSigned(round?.tourDiffs[index] ?? null)}
        </td>
      ))}
      <td className="px-2 py-3 text-center font-semibold tabular-nums">
        {round ? `${round.wins}–${round.losses}` : '—'}
      </td>
      <td className="px-2 py-3 text-center text-base font-black tabular-nums text-[var(--tur-accent)]">{round?.pointsP ?? '—'}</td>
      <td className="px-2 py-3 text-center font-semibold tabular-nums">{formatSigned(round?.diff)}</td>
      <td className="px-2 py-3 text-center tabular-nums">{formatDecimal(round?.kef)}</td>
      <td className="px-2 py-3 text-center tabular-nums" title="Командные мячи начисляются каждому участнику пары">
        {round ? `${round.scored}:${round.conceded}` : '—'}
      </td>
    </>
  );
}

function MobileResultCard({
  row,
  mode,
  open,
  onToggle,
  isOfficial,
}: {
  row: ResultRow;
  mode: ViewMode;
  open: boolean;
  onToggle: () => void;
  isOfficial: boolean;
}) {
  const round = getRound(row, mode);
  const place = getPlace(row, mode);
  const detailId = `thai-unified-mobile-${safeDomId(row.playerId)}`;
  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--tur-border)] bg-[var(--tur-card)]">
      <div className="flex min-h-16 items-center gap-2 px-3 py-2.5">
        <PlaceBadge place={place} />
        <div className="min-w-0 flex-1">
          <PlayerIdentity row={row} compact />
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-black tabular-nums text-[var(--tur-accent)]">
            P {mode === 'total' ? row.overall.pointsP : (round?.pointsP ?? '—')}
          </div>
          <div className="text-[10px] text-[var(--tur-muted)]">
            {mode === 'total'
              ? `${row.overall.wins}–${formatNumber(row.overall.losses)} · рейтинг ${isOfficial ? (row.ratingPts ?? '—') : '—'}`
              : round
                ? `${round.wins}–${formatNumber(round.losses)}`
                : '—'}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--tur-border)] bg-[var(--tur-soft)] text-lg text-[var(--tur-muted)] outline-none transition hover:text-[var(--tur-text)] focus-visible:ring-2 focus-visible:ring-[var(--tur-accent)]"
          aria-expanded={open}
          aria-controls={detailId}
          aria-label={`${open ? 'Скрыть' : 'Показать'} подробности: ${row.playerName}`}
        >
          <span className={cx('transition-transform', open && 'rotate-180')} aria-hidden="true">⌄</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-px border-t border-[var(--tur-border)] bg-[var(--tur-border)] text-center">
        {mode === 'total' ? (
          <>
            <div className="bg-[var(--tur-card)] px-2 py-2">
              <div className="text-[9px] uppercase tracking-wide text-[var(--tur-muted)]">Матчи</div>
              <div className="mt-0.5 font-bold tabular-nums text-[var(--tur-text)]">{formatNumber(row.overall.matches)}</div>
            </div>
            <div className="bg-[var(--tur-card)] px-2 py-2">
              <div className="text-[9px] uppercase tracking-wide text-[var(--tur-muted)]">Δ</div>
              <div className="mt-0.5 font-bold tabular-nums text-[var(--tur-text)]">{formatSigned(row.overall.diff)}</div>
            </div>
            <div className="bg-[var(--tur-card)] px-2 py-2">
              <div className="text-[9px] uppercase tracking-wide text-[var(--tur-muted)]">Мячи</div>
              <div className="mt-0.5 font-bold tabular-nums text-[var(--tur-text)]">{row.overall.scored}:{row.overall.conceded}</div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-[var(--tur-card)] px-2 py-2">
              <div className="text-[9px] uppercase tracking-wide text-[var(--tur-muted)]">{mode === 'r1' ? 'Корт' : 'Зона'}</div>
              <div className="mt-0.5 truncate font-bold text-[var(--tur-text)]">{round?.zoneLabel || round?.courtLabel || '—'}</div>
            </div>
            <div className="bg-[var(--tur-card)] px-2 py-2">
              <div className="text-[9px] uppercase tracking-wide text-[var(--tur-muted)]">Δ</div>
              <div className="mt-0.5 font-bold tabular-nums text-[var(--tur-text)]">{formatSigned(round?.diff)}</div>
            </div>
            <div className="bg-[var(--tur-card)] px-2 py-2">
              <div className="text-[9px] uppercase tracking-wide text-[var(--tur-muted)]">K</div>
              <div className="mt-0.5 font-bold tabular-nums text-[var(--tur-text)]">{formatDecimal(round?.kef)}</div>
            </div>
          </>
        )}
      </div>

      {open ? (
        <div id={detailId} className="border-t border-[var(--tur-border)]">
          <ExpandedDetails row={row} />
        </div>
      ) : null}
    </article>
  );
}

function themeStyle(surface: 'live' | 'calendar'): CSSProperties {
  const values =
    surface === 'calendar'
      ? {
          '--tur-bg': 'var(--color-card, #ffffff)',
          '--tur-card': 'var(--color-card, #ffffff)',
          '--tur-detail': 'var(--color-surface, #f8fafc)',
          '--tur-soft': 'var(--color-surface-lighter, #f1f5f9)',
          '--tur-soft-strong': 'color-mix(in srgb, var(--color-text-primary, #172033) 10%, transparent)',
          '--tur-border': 'color-mix(in srgb, var(--color-text-primary, #172033) 12%, transparent)',
          '--tur-text': 'var(--color-text-primary, #172033)',
          '--tur-muted': 'var(--color-text-secondary, #64748b)',
          '--tur-accent': 'var(--color-brand, #f25c19)',
          '--tur-accent-contrast': '#ffffff',
          '--tur-hover': 'color-mix(in srgb, var(--color-brand, #f25c19) 7%, var(--color-card, #ffffff))',
        }
      : {
          '--tur-bg': '#0d0d18',
          '--tur-card': '#11111d',
          '--tur-detail': '#0a0a13',
          '--tur-soft': 'rgba(255,255,255,0.055)',
          '--tur-soft-strong': 'rgba(255,255,255,0.10)',
          '--tur-border': 'rgba(255,255,255,0.10)',
          '--tur-text': '#ffffff',
          '--tur-muted': '#9299ad',
          '--tur-accent': '#ffd24a',
          '--tur-accent-contrast': '#17130b',
          '--tur-hover': 'rgba(255,210,74,0.055)',
        };
  return values as CSSProperties;
}

export function ThaiUnifiedResultsTable({
  model,
  surface = 'live',
  className = '',
}: {
  model: ThaiUnifiedResultsModel;
  surface?: 'live' | 'calendar';
  className?: string;
}) {
  const [mode, setMode] = useState<ViewMode>('total');
  const [gender, setGender] = useState(EMPTY_FILTER);
  const [pool, setPool] = useState(EMPTY_FILTER);
  const [zone, setZone] = useState(EMPTY_FILTER);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const genderOptions = useMemo(() => {
    const values = new Set<NonNullable<ResultRow['gender']>>();
    for (const row of model.players) {
      if (row.gender) values.add(row.gender);
    }
    return Array.from(values).sort((left, right) => genderLabel(left).localeCompare(genderLabel(right), 'ru'));
  }, [model.players]);

  const poolOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const row of model.players) values.set(row.pool, row.poolLabel);
    return Array.from(values, ([key, label]) => ({ key, label })).sort((left, right) => left.label.localeCompare(right.label, 'ru'));
  }, [model.players]);

  const zoneOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const row of model.players) {
      if (row.finalZone) values.set(row.finalZone, row.finalZoneLabel || row.finalZone);
      if (row.rounds.r2?.zone) values.set(row.rounds.r2.zone, row.rounds.r2.zoneLabel || row.rounds.r2.zone);
    }
    return Array.from(values, ([key, label]) => ({ key, label })).sort((left, right) =>
      left.label.localeCompare(right.label, 'ru', { numeric: true }),
    );
  }, [model.players]);

  const filteredRows = useMemo(() => {
    const query = normalizeSearch(search);
    const officialOrder = new Map(model.players.map((row, index) => [row.playerId, index]));
    const rows = model.players.filter((row) => {
      if (gender !== EMPTY_FILTER && row.gender !== gender) return false;
      if (pool !== EMPTY_FILTER && row.pool !== pool) return false;
      if (zone !== EMPTY_FILTER && row.finalZone !== zone && row.rounds.r2?.zone !== zone) return false;
      if (query && !normalizeSearch(row.playerName).includes(query)) return false;
      return true;
    });

    return [...rows].sort((left, right) => {
      if (sort) {
        const leftValue = numericSortValue(left, mode, sort.key);
        const rightValue = numericSortValue(right, mode, sort.key);
        if (leftValue == null && rightValue != null) return 1;
        if (leftValue != null && rightValue == null) return -1;
        if (leftValue != null && rightValue != null && leftValue !== rightValue) {
          return sort.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
        }
      }
      const leftOrder = officialOrder.get(left.playerId) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = officialOrder.get(right.playerId) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.playerName.localeCompare(right.playerName, 'ru');
    });
  }, [gender, mode, model.players, pool, search, sort, zone]);

  const tourCount = useMemo(() => {
    if (mode === 'total') return 0;
    return model.players.reduce((max, row) => Math.max(max, getRound(row, mode)?.tourDiffs.length ?? 0), 0);
  }, [mode, model.players]);

  const columnCount = mode === 'total' ? 13 : 9 + tourCount;
  const hasFilters = gender !== EMPTY_FILTER || pool !== EMPTY_FILTER || zone !== EMPTY_FILTER || search.trim() !== '';

  function changeMode(nextMode: ViewMode) {
    setMode(nextMode);
    setSort(null);
  }

  function toggleSort(key: string) {
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: defaultDirection(key) };
      return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  }

  function toggleExpanded(playerId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  function resetFilters() {
    setGender(EMPTY_FILTER);
    setPool(EMPTY_FILTER);
    setZone(EMPTY_FILTER);
    setSearch('');
  }

  return (
    <section
      className={cx(
        'thai-unified-results overflow-hidden rounded-[24px] border border-[var(--tur-border)] bg-[var(--tur-bg)] text-[var(--tur-text)] shadow-[0_18px_50px_rgba(15,23,42,0.10)]',
        className,
      )}
      style={themeStyle(surface)}
      aria-label="Единая таблица результатов Thai"
    >
      <div className="border-b border-[var(--tur-border)] p-3 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black tracking-tight sm:text-2xl">Результаты турнира</h2>
              <span
                className={cx(
                  'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]',
                  model.isOfficial
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-600',
                )}
              >
                {model.isOfficial ? 'Финальные' : 'Предварительные'}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--tur-muted)] sm:text-sm">
              {model.isOfficial
                ? 'Итоговые места определены по R2. Статистика включает подтверждённые матчи R1 и R2.'
                : 'Таблица обновляется по подтверждённым матчам. Места и рейтинг могут измениться до завершения R2.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-semibold text-[var(--tur-muted)] sm:text-xs">
            <span className="rounded-full border border-[var(--tur-border)] bg-[var(--tur-soft)] px-2.5 py-1.5">
              Игроков {model.summary.playerCount}
            </span>
            <span className="rounded-full border border-[var(--tur-border)] bg-[var(--tur-soft)] px-2.5 py-1.5">
              Матчей {model.summary.confirmedMatches}/{model.summary.totalMatches}
            </span>
            <span className="rounded-full border border-[var(--tur-border)] bg-[var(--tur-soft)] px-2.5 py-1.5">
              Мячей {model.summary.totalScore}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(190px,1.3fr)_repeat(3,minmax(130px,0.7fr))]">
          <label className="relative block">
            <span className="sr-only">Поиск игрока</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tur-muted)]" aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти игрока"
              className="min-h-11 w-full rounded-xl border border-[var(--tur-border)] bg-[var(--tur-card)] py-2 pl-9 pr-3 text-sm text-[var(--tur-text)] outline-none placeholder:text-[var(--tur-muted)] focus:border-[var(--tur-accent)] focus:ring-2 focus:ring-[var(--tur-accent)]/20"
            />
          </label>
          <label>
            <span className="sr-only">Фильтр по полу</span>
            <select
              value={gender}
              onChange={(event) => setGender(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-[var(--tur-border)] bg-[var(--tur-card)] px-3 text-sm text-[var(--tur-text)] outline-none focus:border-[var(--tur-accent)] focus:ring-2 focus:ring-[var(--tur-accent)]/20"
            >
              <option value={EMPTY_FILTER}>Все игроки</option>
              {genderOptions.map((value) => <option key={value} value={value}>{genderLabel(value)}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Фильтр по пулу</span>
            <select
              value={pool}
              onChange={(event) => setPool(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-[var(--tur-border)] bg-[var(--tur-card)] px-3 text-sm text-[var(--tur-text)] outline-none focus:border-[var(--tur-accent)] focus:ring-2 focus:ring-[var(--tur-accent)]/20"
            >
              <option value={EMPTY_FILTER}>Все пулы</option>
              {poolOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Фильтр по зоне</span>
            <select
              value={zone}
              onChange={(event) => setZone(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-[var(--tur-border)] bg-[var(--tur-card)] px-3 text-sm text-[var(--tur-text)] outline-none focus:border-[var(--tur-accent)] focus:ring-2 focus:ring-[var(--tur-accent)]/20"
            >
              <option value={EMPTY_FILTER}>Все зоны</option>
              {zoneOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="grid min-h-11 grid-cols-3 rounded-xl border border-[var(--tur-border)] bg-[var(--tur-soft)] p-1" role="tablist" aria-label="Раунд таблицы">
            {(Object.keys(MODE_LABELS) as ViewMode[]).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => changeMode(value)}
                className={cx(
                  'min-h-9 min-w-[72px] rounded-lg px-3 text-xs font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--tur-accent)]',
                  mode === value
                    ? 'bg-[var(--tur-accent)] text-[var(--tur-accent-contrast)] shadow-sm'
                    : 'text-[var(--tur-muted)] hover:text-[var(--tur-text)]',
                )}
              >
                {MODE_LABELS[value]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--tur-muted)]">Показано {filteredRows.length} из {model.players.length}</span>
            {sort ? (
              <button
                type="button"
                onClick={() => setSort(null)}
                className="min-h-11 rounded-xl border border-[var(--tur-border)] bg-[var(--tur-card)] px-3 text-xs font-semibold text-[var(--tur-text)] outline-none hover:bg-[var(--tur-soft)] focus-visible:ring-2 focus-visible:ring-[var(--tur-accent)]"
              >
                Официальный порядок
              </button>
            ) : null}
            {hasFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="min-h-11 rounded-xl border border-[var(--tur-border)] bg-[var(--tur-card)] px-3 text-xs font-semibold text-[var(--tur-text)] outline-none hover:bg-[var(--tur-soft)] focus-visible:ring-2 focus-visible:ring-[var(--tur-accent)]"
              >
                Сбросить фильтры
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {filteredRows.length ? (
        <>
          <div className="hidden max-h-[72vh] overflow-auto lg:block">
            <table className={cx('w-full border-separate border-spacing-0 text-xs', mode === 'total' ? 'min-w-[1180px]' : 'min-w-[1050px]')}>
              <thead className="sticky top-0 z-30 bg-[var(--tur-bg)] text-[10px] uppercase tracking-[0.08em] shadow-[0_1px_0_var(--tur-border)]">
                <tr>
                  <SortHeader label="Место" sortKey="place" sort={sort} onSort={toggleSort} className="sticky left-0 z-40 w-16 bg-[var(--tur-bg)]" />
                  <th scope="col" className="sticky left-16 z-40 min-w-[210px] bg-[var(--tur-bg)] px-3 py-3 text-left font-semibold text-[var(--tur-muted)]">Игрок</th>
                  {mode === 'total' ? (
                    <>
                      <th scope="col" className="px-2 py-3 text-center font-semibold text-[var(--tur-muted)]">Пул</th>
                      <th scope="col" className="px-2 py-3 text-center font-semibold text-[var(--tur-muted)]">Зона</th>
                      <SortHeader label="Матчи" sortKey="matches" sort={sort} onSort={toggleSort} />
                      <SortHeader label="В–П" sortKey="wins" sort={sort} onSort={toggleSort} />
                      <SortHeader label="%" sortKey="winRate" sort={sort} onSort={toggleSort} />
                      <SortHeader label="P" sortKey="points" sort={sort} onSort={toggleSort} />
                      <SortHeader label="Δ" sortKey="diff" sort={sort} onSort={toggleSort} />
                      <SortHeader label="Мячи" sortKey="scored" sort={sort} onSort={toggleSort} title="Мячи за:против. Командные мячи начисляются каждому участнику пары" />
                      <SortHeader label="Отн." sortKey="ratio" sort={sort} onSort={toggleSort} title="Отношение мячей за к мячам против" />
                      <SortHeader
                        label="Рейтинг"
                        sortKey="rating"
                        sort={sort}
                        onSort={toggleSort}
                        disabled={!model.isOfficial}
                        title={model.isOfficial ? undefined : 'Рейтинг появится после завершения R2 и финальной синхронизации'}
                      />
                    </>
                  ) : (
                    <>
                      <th scope="col" className="px-2 py-3 text-center font-semibold text-[var(--tur-muted)]">{mode === 'r1' ? 'Корт' : 'Зона'}</th>
                      {Array.from({ length: tourCount }, (_, index) => (
                        <SortHeader key={`tour-head-${index}`} label={`T${index + 1}`} sortKey={`tour-${index}`} sort={sort} onSort={toggleSort} />
                      ))}
                      <SortHeader label="В–П" sortKey="wins" sort={sort} onSort={toggleSort} />
                      <SortHeader label="P" sortKey="points" sort={sort} onSort={toggleSort} />
                      <SortHeader label="Δ" sortKey="diff" sort={sort} onSort={toggleSort} />
                      <SortHeader label="K" sortKey="kef" sort={sort} onSort={toggleSort} />
                      <SortHeader label="Мячи" sortKey="scored" sort={sort} onSort={toggleSort} title="Мячи за:против. Командные мячи начисляются каждому участнику пары" />
                    </>
                  )}
                  <th scope="col" className="w-14 bg-[var(--tur-bg)] px-2 py-3"><span className="sr-only">Подробности</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const open = expanded.has(row.playerId);
                  const detailId = `thai-unified-desktop-${safeDomId(row.playerId)}`;
                  return (
                    <Fragment key={row.playerId}>
                      <tr key={`${row.playerId}-row`} className="group bg-[var(--tur-card)] text-[var(--tur-text)] hover:bg-[var(--tur-hover)]">
                        <td className="sticky left-0 z-20 w-16 border-b border-[var(--tur-border)] bg-[var(--tur-card)] px-2 py-2 text-center group-hover:bg-[var(--tur-hover)]">
                          <PlaceBadge place={getPlace(row, mode)} />
                        </td>
                        <th scope="row" className="sticky left-16 z-20 min-w-[210px] border-b border-[var(--tur-border)] bg-[var(--tur-card)] px-3 py-2 text-left group-hover:bg-[var(--tur-hover)]">
                          <PlayerIdentity row={row} />
                        </th>
                        {mode === 'total' ? (
                          <SummaryDesktopCells row={row} isOfficial={model.isOfficial} />
                        ) : (
                          <RoundDesktopCells row={row} mode={mode} tourCount={tourCount} />
                        )}
                        <td className="border-b border-[var(--tur-border)] px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(row.playerId)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--tur-border)] bg-[var(--tur-soft)] text-base text-[var(--tur-muted)] outline-none transition hover:text-[var(--tur-text)] focus-visible:ring-2 focus-visible:ring-[var(--tur-accent)]"
                            aria-expanded={open}
                            aria-controls={detailId}
                            aria-label={`${open ? 'Скрыть' : 'Показать'} подробности: ${row.playerName}`}
                          >
                            <span className={cx('transition-transform', open && 'rotate-180')} aria-hidden="true">⌄</span>
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr key={`${row.playerId}-details`} id={detailId}>
                          <td colSpan={columnCount} className="border-b border-[var(--tur-border)] p-0">
                            <ExpandedDetails row={row} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 p-2.5 lg:hidden">
            {filteredRows.map((row) => (
              <MobileResultCard
                key={row.playerId}
                row={row}
                mode={mode}
                open={expanded.has(row.playerId)}
                onToggle={() => toggleExpanded(row.playerId)}
                isOfficial={model.isOfficial}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="px-5 py-14 text-center">
          <div className="text-lg font-black text-[var(--tur-text)]">Игроки не найдены</div>
          <p className="mt-1 text-sm text-[var(--tur-muted)]">Измените поиск или сбросьте выбранные фильтры.</p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 min-h-11 rounded-xl bg-[var(--tur-accent)] px-4 text-sm font-bold text-[var(--tur-accent-contrast)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--tur-accent)]"
          >
            Сбросить фильтры
          </button>
        </div>
      )}
    </section>
  );
}
