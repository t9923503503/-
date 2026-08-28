'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AdminTournament } from '@/lib/admin-queries';
import {
  filterTournamentRows,
  formatTournamentDate,
  getTournamentFormatLabel,
  getTournamentJudgeHref,
  getTournamentLaunchHref,
  getTournamentListTab,
  getTournamentStatusLabel,
  type TournamentListFilters,
  type TournamentListTab,
} from '@/lib/admin-tournaments-ui';

const TABS: Array<{ key: TournamentListTab; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'upcoming', label: 'Предстоящие' },
  { key: 'active', label: 'Активные' },
  { key: 'draft', label: 'Черновики' },
  { key: 'finished', label: 'Завершённые' },
  { key: 'cancelled', label: 'Отменённые' },
];

const EMPTY_FILTERS: TournamentListFilters = {
  query: '',
  format: '',
  division: '',
  dateFrom: '',
  dateTo: '',
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'border-slate-400/40 bg-slate-400/10 text-slate-200',
  open: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  full: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  finished: 'border-sky-400/40 bg-sky-400/10 text-sky-200',
  cancelled: 'border-red-400/40 bg-red-400/10 text-red-200',
};

function getRosterHref(row: AdminTournament) {
  return `/admin/tournaments/${encodeURIComponent(row.id)}/roster`;
}

function ParticipantSummary({ row, compact = false }: { row: AdminTournament; compact?: boolean }) {
  const waitlistCount = Number(row.waitlistCount ?? 0);
  return (
    <Link
      href={getRosterHref(row)}
      aria-label={`Открыть состав турнира «${row.name}»`}
      className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg text-left font-mono font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span>{row.participantCount} / {row.capacity}</span>
      {waitlistCount ? (
        <span className={`${compact ? 'block w-full' : ''} font-sans text-[11px] font-medium text-text-secondary`}>
          +{waitlistCount} резерв
        </span>
      ) : null}
    </Link>
  );
}

function ActionMenu({ row, onDelete }: { row: AdminTournament; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const judgeHref = getTournamentJudgeHref(row);
  const launchHref = getTournamentLaunchHref(row);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent | MouseEvent) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        setOpen(false);
        containerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
      } else if (event instanceof MouseEvent && !containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', close);
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('mousedown', close);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label={`Дополнительные действия: ${row.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="h-9 w-9 rounded-lg border border-white/15 text-lg hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        ⋯
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-white/15 bg-surface p-1 shadow-2xl">
          <Link role="menuitem" href={`/admin/tournaments/${row.id}/edit`} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10">
            Редактировать
          </Link>
          <Link role="menuitem" href={`/admin/tournaments/new?duplicate=${encodeURIComponent(row.id)}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10">
            Дублировать
          </Link>
          {judgeHref && judgeHref !== launchHref ? (
            <Link role="menuitem" href={judgeHref} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10">
              Модуль судей
            </Link>
          ) : null}
          <button
            role="menuitem"
            type="button"
            onClick={() => { setOpen(false); onDelete(); }}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
          >
            Удалить
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RowActions({ row, onDelete }: { row: AdminTournament; onDelete: () => void }) {
  const href = row.status === 'draft' ? `/admin/tournaments/${row.id}/edit` : getTournamentLaunchHref(row);
  return (
    <div className="flex items-center justify-end gap-2">
      {href ? (
        <Link href={href} className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-surface hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          {row.status === 'draft' ? 'Открыть' : 'Управлять'}
        </Link>
      ) : (
        <Link href={`/admin/tournaments/${row.id}/edit`} className="rounded-lg border border-brand/50 px-3 py-2 text-xs font-semibold text-brand">
          Открыть
        </Link>
      )}
      <Link
        href={getRosterHref(row)}
        className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-text-primary hover:border-brand"
      >
        Состав
      </Link>
      <ActionMenu row={row} onDelete={onDelete} />
    </div>
  );
}

export function TournamentListClient({ initialRows }: { initialRows: AdminTournament[] }) {
  const [rows, setRows] = useState(initialRows);
  const [tab, setTab] = useState<TournamentListTab>('upcoming');
  const [filters, setFilters] = useState<TournamentListFilters>(EMPTY_FILTERS);
  const [deleteRow, setDeleteRow] = useState<AdminTournament | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  const formats = useMemo(() => Array.from(new Set(rows.map(getTournamentFormatLabel))).sort(), [rows]);
  const divisions = useMemo(() => Array.from(new Set(rows.map((row) => row.division).filter(Boolean))).sort(), [rows]);
  const counts = useMemo(() => Object.fromEntries(TABS.map(({ key }) => [key, key === 'all' ? rows.length : rows.filter((row) => getTournamentListTab(row) === key).length])), [rows]);
  const visibleRows = useMemo(() => filterTournamentRows(rows, tab, filters), [filters, rows, tab]);
  const hasFilters = Object.values(filters).some(Boolean);

  useEffect(() => {
    if (deleteRow) cancelRef.current?.focus();
  }, [deleteRow]);

  async function removeTournament() {
    if (!deleteRow || deleting) return;
    setDeleting(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(deleteRow.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: `Удаление турнира «${deleteRow.name}» из списка администратора` }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error || 'Не удалось удалить турнир'));
      setRows((current) => current.filter((row) => row.id !== deleteRow.id));
      setMessage(`Турнир «${deleteRow.name}» удалён.`);
      setDeleteRow(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось удалить турнир');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Администрирование</p>
          <h1 className="font-heading text-4xl leading-none text-text-primary">Турниры</h1>
          <p className="mt-2 text-sm text-text-secondary">Создание, публикация и управление турнирами LPVolley.</p>
        </div>
        <Link href="/admin/tournaments/new" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 py-3 font-bold text-surface hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          Создать турнир
        </Link>
      </div>

      <details className="group rounded-2xl border border-white/15 bg-white/5 p-4" open={hasFilters || undefined}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-semibold md:hidden">
          <span>Поиск и фильтры</span>
          <span className="text-sm text-brand group-open:hidden">Показать</span>
          <span className="hidden text-sm text-brand group-open:inline">Скрыть</span>
        </summary>
        <div className="mt-3 space-y-4 md:mt-0">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="xl:col-span-2 text-xs text-text-secondary">Поиск
            <input value={filters.query} onChange={(e) => setFilters((current) => ({ ...current, query: e.target.value }))} placeholder="Название или место" className="mt-1 w-full rounded-lg border border-white/20 bg-surface px-3 py-2 text-text-primary" />
          </label>
          <label className="text-xs text-text-secondary">Формат
            <select value={filters.format} onChange={(e) => setFilters((current) => ({ ...current, format: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/20 bg-surface px-3 py-2 text-text-primary">
              <option value="">Все форматы</option>{formats.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs text-text-secondary">Дивизион
            <select value={filters.division} onChange={(e) => setFilters((current) => ({ ...current, division: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/20 bg-surface px-3 py-2 text-text-primary">
              <option value="">Все дивизионы</option>{divisions.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-text-secondary">С
              <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((current) => ({ ...current, dateFrom: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/20 bg-surface px-2 py-2 text-text-primary" />
            </label>
            <label className="text-xs text-text-secondary">По
              <input type="date" value={filters.dateTo} onChange={(e) => setFilters((current) => ({ ...current, dateTo: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/20 bg-surface px-2 py-2 text-text-primary" />
            </label>
          </div>
        </div>
        {hasFilters ? <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs font-semibold text-brand hover:underline">Сбросить фильтры</button> : null}
        </div>
      </details>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Статус турниров">
        {TABS.map(({ key, label }) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-sm ${tab === key ? 'border-brand bg-brand/15 text-brand' : 'border-white/15 text-text-secondary hover:border-white/30'}`}>{label} <span className="ml-1 opacity-70">{counts[key]}</span></button>)}
      </div>

      <p className="sr-only" aria-live="polite">{message}</p>
      {message ? <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm">{message}</div> : null}

      {visibleRows.length ? (
        <>
          <div className="hidden overflow-visible rounded-2xl border border-white/15 bg-white/5 md:block">
            <table className="w-full table-fixed text-sm">
              <thead><tr className="border-b border-white/10 text-left text-text-secondary"><th className="w-[25%] px-4 py-3">Название</th><th className="w-[12%] px-3 py-3">Дата</th><th className="w-[17%] px-3 py-3">Формат</th><th className="w-[12%] px-3 py-3">Статус</th><th className="w-[13%] px-3 py-3">Участники</th><th className="w-[21%] px-4 py-3 text-right">Действия</th></tr></thead>
              <tbody>{visibleRows.map((row) => <tr key={row.id} className="border-b border-white/5 last:border-0"><td className="px-4 py-4"><div className="truncate font-semibold" title={row.name}>{row.name}</div><div className="truncate text-xs text-text-secondary">{row.location}</div></td><td className="px-3 py-4">{formatTournamentDate(row.date)}</td><td className="px-3 py-4"><span className="line-clamp-2">{getTournamentFormatLabel(row)}</span></td><td className="px-3 py-4"><span className={`inline-flex rounded-full border px-2 py-1 text-xs ${STATUS_STYLES[row.status] ?? 'border-white/20'}`}>{getTournamentStatusLabel(row.status)}</span></td><td className="px-3 py-4"><ParticipantSummary row={row} compact /></td><td className="px-4 py-4"><RowActions row={row} onDelete={() => setDeleteRow(row)} /></td></tr>)}</tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden">{visibleRows.map((row) => <article key={row.id} className="min-w-0 rounded-2xl border border-white/15 bg-white/5 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold leading-snug">{row.name}</h2><p className="mt-1 text-xs text-text-secondary">{formatTournamentDate(row.date)} · {row.location || 'Место не указано'}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-xs ${STATUS_STYLES[row.status] ?? 'border-white/20'}`}>{getTournamentStatusLabel(row.status)}</span></div><dl className="my-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-text-secondary">Формат</dt><dd>{getTournamentFormatLabel(row)}</dd></div><div><dt className="text-xs text-text-secondary">Участники</dt><dd><ParticipantSummary row={row} compact /></dd></div></dl><RowActions row={row} onDelete={() => setDeleteRow(row)} /></article>)}</div>
        </>
      ) : <div className="rounded-2xl border border-dashed border-white/20 bg-white/[0.03] px-6 py-14 text-center"><h2 className="font-heading text-2xl">Турниров не найдено</h2><p className="mt-2 text-sm text-text-secondary">Измените фильтры или создайте новый турнир.</p></div>}

      {deleteRow ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-title" onKeyDown={(e) => { if (e.key === 'Escape' && !deleting) setDeleteRow(null); }}><div className="w-full max-w-md rounded-2xl border border-white/15 bg-surface p-5 shadow-2xl"><h2 id="delete-title" className="font-heading text-2xl">Удалить турнир?</h2><p className="mt-3 text-sm text-text-secondary">Турнир «<strong className="text-text-primary">{deleteRow.name}</strong>» будет удалён без возможности восстановления.</p><div className="mt-6 flex justify-end gap-3"><button ref={cancelRef} type="button" disabled={deleting} onClick={() => setDeleteRow(null)} className="rounded-lg border border-white/20 px-4 py-2">Отмена</button><button type="button" disabled={deleting} onClick={() => void removeTournament()} className="rounded-lg bg-red-500 px-4 py-2 font-semibold text-white disabled:opacity-50">{deleting ? 'Удаление…' : 'Удалить'}</button></div></div></div> : null}
    </section>
  );
}
