'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PlayPlayerStats, PlayPlayerStatsGameItem } from '@/lib/play-player-stats';
import type { PlayGameInsightSummary, PlayGameStatsScope } from '@/lib/play-game-insights';

const SCOPE_OPTIONS: Array<{ id: PlayGameStatsScope; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'rated', label: 'Рейтинговые' },
  { id: 'friendly', label: 'Обычные' },
];

function legacySummary(data: PlayPlayerStats): PlayGameInsightSummary {
  return {
    matches: data.matches,
    wins: data.wins,
    losses: data.losses,
    pointsFor: data.pointsFor,
    pointsAgainst: data.pointsAgainst,
    bestPartner: data.bestPartner,
    toughestOpponent: data.toughestOpponent,
    recentForm: data.recentForm,
    winStreak: data.winStreak,
  };
}

function formatGameDate(value: string): string {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Yekaterinburg',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function pluralizeRu(value: number, forms: [string, string, string]): string {
  const normalized = Math.abs(value) % 100;
  const lastDigit = normalized % 10;
  if (normalized > 10 && normalized < 20) return forms[2];
  if (lastDigit === 1) return forms[0];
  if (lastDigit >= 2 && lastDigit <= 4) return forms[1];
  return forms[2];
}

function ratingHistoryAsGames(data: PlayPlayerStats): PlayPlayerStatsGameItem[] {
  return data.history.map((item) => ({
    ...item,
    ratingMode: 'rated',
    matches: item.wins + item.losses,
    pointsFor: 0,
    pointsAgainst: 0,
    delta: item.delta,
    ratingAfter: item.ratingAfter,
  }));
}

export default function GameRatingCard() {
  const [data, setData] = useState<PlayPlayerStats | null>(null);
  const [scope, setScope] = useState<PlayGameStatsScope>('all');
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/me/game-rating', { cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('stats_request_failed');
        return response.json() as Promise<PlayPlayerStats>;
      })
      .then((payload) => {
        setData(payload);
        setLoadFailed(false);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== 'AbortError') setLoadFailed(true);
      });
    return () => controller.abort();
  }, []);

  if (loadFailed) {
    return (
      <div className="rounded-2xl border border-rose-300/20 bg-rose-300/5 p-5 text-sm text-text-secondary" role="status">
        Не удалось загрузить игровую статистику. Обновите страницу чуть позже.
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-2xl border border-white/10 p-5 text-sm text-text-secondary" role="status">
        Загрузка игровой статистики…
      </div>
    );
  }

  const summary = data.scopes?.[scope] ?? legacySummary(data);
  const decisions = summary.wins + summary.losses;
  const winRate = decisions ? Math.round((summary.wins / decisions) * 100) : 0;
  const pointsDiff = summary.pointsFor - summary.pointsAgainst;
  const trend = data.history.slice(0, 5).reverse();
  const min = Math.min(...trend.map((item) => item.ratingAfter), data.rating);
  const max = Math.max(...trend.map((item) => item.ratingAfter), data.rating);
  const games = data.games ?? ratingHistoryAsGames(data);
  const visibleGames = games.filter((game) => scope === 'all' || game.ratingMode === scope).slice(0, 4);

  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/10 to-brand/5 p-5" aria-labelledby="game-rating-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p id="game-rating-heading" className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-200">
            Игровой рейтинг
          </p>
          <div className="mt-1 flex items-end gap-2">
            <p className="text-4xl font-black text-text-primary">{data.rating}</p>
            <span className="mb-1 rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-800 dark:text-cyan-200">
              только рейтинговые
            </span>
          </div>
          <p className="mt-1 text-xs text-text-secondary">Отдельно от турнирного рейтинга LPVOLLEY</p>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center sm:min-w-64">
          <div>
            <strong className="block text-xl text-text-primary">{summary.matches}</strong>
            <span className="text-[11px] text-text-secondary">{pluralizeRu(summary.matches, ['матч', 'матча', 'матчей'])}</span>
          </div>
          <div>
            <strong className="block text-xl text-emerald-700 dark:text-emerald-200">{summary.wins}</strong>
            <span className="text-[11px] text-text-secondary">{pluralizeRu(summary.wins, ['победа', 'победы', 'побед'])}</span>
          </div>
          <div>
            <strong className="block text-xl text-text-primary">{winRate}%</strong>
            <span className="text-[11px] text-text-secondary">эффективность</span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-surface/40 p-1" role="group" aria-label="Фильтр игровой статистики">
        {SCOPE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={scope === option.id}
            onClick={() => setScope(option.id)}
            className={`min-h-11 rounded-lg px-2 text-xs font-bold transition ${
              scope === option.id
                ? 'bg-cyan-300/20 text-cyan-900 shadow-sm dark:text-cyan-100'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-text-secondary">
        <span>Очки: <strong className="text-text-primary">{summary.pointsFor}:{summary.pointsAgainst}</strong></span>
        <span>Разница: <strong className={pointsDiff >= 0 ? 'text-emerald-700 dark:text-emerald-200' : 'text-rose-700 dark:text-rose-200'}>{pointsDiff > 0 ? '+' : ''}{pointsDiff}</strong></span>
        {scope === 'friendly' ? <span>Обычные игры не изменяют рейтинг</span> : null}
      </div>

      {scope === 'rated' && trend.length > 1 ? (
        <div className="mt-5">
          <p className="text-xs font-bold text-text-secondary">Динамика игрового рейтинга</p>
          <div className="mt-2 flex h-16 items-end gap-1" aria-label="Динамика игрового рейтинга">
            {trend.map((item) => (
              <div
                key={item.resultId}
                title={`${item.ratingAfter}`}
                className="flex-1 rounded-t bg-cyan-300/70"
                style={{ height: `${20 + ((item.ratingAfter - min) / Math.max(1, max - min)) * 80}%` }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {summary.recentForm.length ? (
        <div className="mt-5">
          <p className="text-xs font-bold text-text-secondary">
            Текущая форма{summary.winStreak ? ` · серия ${summary.winStreak}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {summary.recentForm.map((outcome, index) => (
              <span
                key={`${outcome}-${index}`}
                className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${
                  outcome === 'W' ? 'bg-emerald-400/20 text-emerald-700 dark:text-emerald-200' : 'bg-rose-400/20 text-rose-700 dark:text-rose-200'
                }`}
              >
                {outcome === 'W' ? 'В' : 'П'}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-white/15 px-4 py-4 text-xs text-text-secondary">
          В этом разделе пока нет подтверждённых матчей.
        </p>
      )}

      {summary.bestPartner || summary.toughestOpponent ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {summary.bestPartner ? (
            <div className="rounded-xl bg-surface/50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">🤝 Лучший напарник</p>
              <p className="mt-1 font-semibold text-text-primary">{summary.bestPartner.name}</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-200">
                {summary.bestPartner.wins} {pluralizeRu(summary.bestPartner.wins, ['победа', 'победы', 'побед'])} · {summary.bestPartner.winRate}%
              </p>
            </div>
          ) : null}
          {summary.toughestOpponent ? (
            <div className="rounded-xl bg-surface/50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">⚔️ Неудобный соперник</p>
              <p className="mt-1 font-semibold text-text-primary">{summary.toughestOpponent.name}</p>
              <p className="text-xs text-rose-700 dark:text-rose-200">
                {summary.toughestOpponent.losses} {pluralizeRu(summary.toughestOpponent.losses, ['поражение', 'поражения', 'поражений'])} в личных матчах
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {scope === 'rated' && data.achievements.length ? (
        <div className="mt-5">
          <p className="text-xs font-bold text-text-secondary">Достижения рейтинговых игр</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.achievements.map((item) => (
              <span
                key={item.id}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                  item.level === 'gold'
                    ? 'border-amber-300/40 bg-amber-300/10 text-amber-100'
                    : item.level === 'silver'
                      ? 'border-slate-300/30 bg-slate-300/10 text-slate-100'
                      : 'border-orange-300/30 bg-orange-300/10 text-orange-100'
                }`}
              >
                {item.icon} {item.title}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <p className="text-xs font-bold text-text-secondary">Последние игры</p>
        {visibleGames.length ? (
          <div className="mt-2 grid gap-2">
            {visibleGames.map((game) => (
              <Link
                key={game.resultId}
                href={`/partner/${game.postId}`}
                className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-surface/50 px-3 py-2 text-xs transition hover:bg-surface/70"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-text-primary">{game.title}</span>
                  <span className="mt-0.5 block text-[11px] text-text-secondary">
                    {formatGameDate(game.createdAt)} · {game.ratingMode === 'rated' ? 'На рейтинг' : 'Обычная'}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <strong className={game.wins >= game.losses ? 'text-emerald-700 dark:text-emerald-200' : 'text-rose-700 dark:text-rose-200'}>{game.wins}:{game.losses}</strong>
                  <span className="ml-2 text-text-secondary">
                    {game.delta == null ? 'без рейтинга' : `${game.delta >= 0 ? '+' : ''}${game.delta}`}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-text-secondary">Игр для выбранного фильтра пока нет.</p>
        )}
      </div>
    </section>
  );
}
