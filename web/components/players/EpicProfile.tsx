'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Player, TournamentResult, RatingHistoryEntry } from '@/lib/types';
import PlayerPhoto from '@/components/ui/PlayerPhoto';
import type { PlayerExtendedStats } from '@/lib/queries';

interface EpicProfileProps {
  player: Player;
  stats: PlayerExtendedStats;
  matches: TournamentResult[];
  ratingHistory: RatingHistoryEntry[];
  backLink?: { href: string; label: string };
  sharePath?: string;
}

const FORMAT_META: Record<
  string,
  { label: string; shortLabel: string; icon: string; tone: string; badgeTone: string }
> = {
  KOTC: {
    label: 'KOTC',
    shortLabel: 'KOTC',
    icon: '👑',
    tone: 'border-[#8a6f11] bg-[#241d05] text-[#ffd400]',
    badgeTone: 'border-[#8a6f11]/50 bg-[#241d05] text-[#ffd400]',
  },
  THAI: {
    label: 'THAI',
    shortLabel: 'THAI',
    icon: '🏴',
    tone: 'border-[#0f4c63] bg-[#0d1f29] text-[#26c6ff]',
    badgeTone: 'border-[#0f4c63]/60 bg-[#0d1f29] text-[#26c6ff]',
  },
  IPT: {
    label: 'ДАБЛ',
    shortLabel: 'ДАБЛ',
    icon: '⚡',
    tone: 'border-[#3a3a3a] bg-[#171717] text-white',
    badgeTone: 'border-white/15 bg-[#171717] text-white',
  },
};

function normalizeFormatCode(value: string) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'THAI') return 'THAI';
  if (normalized === 'KOTC') return 'KOTC';
  if (normalized === 'IPT' || normalized === 'ДАБЛ' || normalized === 'DOUBLE') return 'IPT';
  return normalized;
}

function formatDate(value: string) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
    });
  } catch {
    return value;
  }
}

function levelTone(level: string) {
  const normalized = String(level || '').trim().toLowerCase();
  if (normalized === 'hard') {
    return {
      label: 'HARD',
      color: 'text-[#ff4d43]',
      card: 'border-[#ff4d43]/35 bg-[#2a1111]',
    };
  }
  if (normalized === 'advanced' || normalized === 'advance') {
    return {
      label: 'ADV',
      color: 'text-[#26c6ff]',
      card: 'border-[#26c6ff]/35 bg-[#0d1f29]',
    };
  }
  if (normalized === 'medium') {
    return {
      label: 'MED',
      color: 'text-[#ffb100]',
      card: 'border-[#ffb100]/35 bg-[#261b05]',
    };
  }
  return {
    label: 'LIGHT',
    color: 'text-[#39d96c]',
    card: 'border-[#39d96c]/35 bg-[#102114]',
  };
}

function resolvePlayerLevel(player: Player, stats: PlayerExtendedStats) {
  const primaryRating = player.gender === 'M' ? player.ratingM : player.ratingW;
  if (primaryRating >= 170 || stats.gold >= 3) return 'hard';
  if (primaryRating >= 120 || stats.topThreeRate >= 60) return 'advanced';
  if (primaryRating >= 75 || stats.totalTournaments >= 3) return 'medium';
  return 'light';
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function ResultBadge(place: number) {
  if (place === 1) return { label: 'WIN', tone: 'bg-[#39d96c] text-white' };
  if (place <= 3) return { label: 'TOP', tone: 'bg-[#ffb100] text-black' };
  return { label: 'LOSS', tone: 'bg-[#ff4d43] text-white' };
}

function HeroStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/35 px-4 py-4 backdrop-blur-sm">
      <div className={`font-heading text-[42px] leading-none sm:text-5xl ${accent}`}>{value}</div>
      <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
        {label}
      </div>
    </div>
  );
}

function MetricCard({
  token,
  label,
  value,
  accent = false,
}: {
  token: string;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`group rounded-[22px] border px-3.5 py-3.5 transition duration-200 ${
        accent
          ? 'border-[#39d96c]/30 bg-[#102114] shadow-[0_0_0_1px_rgba(57,217,108,0.06)]'
          : 'border-white/8 bg-[#171717] hover:border-white/14'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-[11px] font-black uppercase tracking-[0.08em] ${
            accent ? 'bg-[#39d96c] text-black' : 'bg-white/6 text-white/72'
          }`}
        >
          {token}
        </div>
        <div className="min-w-0">
          <div
            className={`font-heading text-3xl leading-none transition-transform duration-200 group-hover:scale-[1.02] ${
              accent ? 'text-[#39d96c]' : 'text-white'
            }`}
          >
            {value}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}

function FormatCard({
  label,
  subtitle,
  active,
}: {
  label: string;
  subtitle: string;
  active: boolean;
}) {
  const meta = FORMAT_META[label] ?? FORMAT_META.IPT;

  return (
    <div
      className={`flex items-center gap-3 rounded-[22px] border px-3.5 py-3 transition ${
        active ? meta.tone : 'border-white/6 bg-[#171717] text-white'
      }`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl ${
          active ? 'bg-black/15' : 'bg-white/5'
        }`}
      >
        {meta.icon}
      </div>
      <div className="min-w-0">
        <div className="text-base font-black uppercase leading-none">{meta.label}</div>
        <div className="mt-1 text-sm text-white/52">{subtitle}</div>
      </div>
    </div>
  );
}

function ProfileShareButton({
  sharePath,
  playerName,
}: {
  sharePath: string;
  playerName: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if (typeof window === 'undefined') return;

    const url = new URL(sharePath, window.location.origin).toString();

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${playerName} | LPVOLLEY.RU`,
          text: `Профиль игрока ${playerName}`,
          url,
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      // Ignore share cancellation and keep the page state stable.
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex items-center justify-center rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/72 transition hover:border-white/20 hover:text-white"
    >
      {copied ? 'Ссылка скопирована' : 'Поделиться профилем'}
    </button>
  );
}

export default function EpicProfile({
  player,
  stats,
  matches,
  ratingHistory,
  backLink,
  sharePath,
}: EpicProfileProps) {
  const primaryRating = player.gender === 'M' ? player.ratingM : player.ratingW;
  const primaryRank = player.gender === 'M' ? stats.rankM : stats.rankW;
  const computedLevel = resolvePlayerLevel(player, stats);
  const levelMeta = levelTone(computedLevel);
  const levelTarget =
    computedLevel === 'hard'
      ? 220
      : computedLevel === 'advanced'
        ? 170
        : computedLevel === 'medium'
          ? 120
          : 70;
  const progress = Math.max(8, Math.min(100, Math.round((primaryRating / levelTarget) * 100)));

  const [filterFormat, setFilterFormat] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');

  const availableFormats = useMemo(() => {
    const formats = new Set<string>();
    matches.forEach((match) => {
      if (match.format) formats.add(normalizeFormatCode(String(match.format)));
    });
    return [...formats];
  }, [matches]);

  const availableLevels = useMemo(() => {
    const levels = new Set<string>();
    matches.forEach((match) => {
      if (match.level) levels.add(String(match.level).toLowerCase());
    });
    return ['hard', 'advanced', 'medium', 'light'].filter((level) => levels.has(level));
  }, [matches]);

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      const matchFormat = normalizeFormatCode(String(match.format || ''));
      const matchLevel = String(match.level || '').toLowerCase();
      const passesFormat = filterFormat === 'all' || matchFormat === filterFormat;
      const passesLevel = filterLevel === 'all' || matchLevel === filterLevel;
      return passesFormat && passesLevel;
    });
  }, [filterFormat, filterLevel, matches]);

  const formatCards = [
    { key: 'KOTC', total: stats.formatStats.kotc.total, rating: stats.formatStats.kotc.rating },
    { key: 'THAI', total: stats.formatStats.thai.total, rating: stats.formatStats.thai.rating },
    { key: 'IPT', total: stats.formatStats.double.total, rating: stats.formatStats.double.rating },
  ];
  const formatsWithData = formatCards.filter((formatCard) => formatCard.total > 0);
  const activeFormat = [...(formatsWithData.length ? formatsWithData : formatCards)].sort(
    (a, b) => b.rating - a.rating
  )[0];
  const activeFormatMeta = FORMAT_META[activeFormat.key] ?? FORMAT_META.IPT;
  const historyBadge =
    filteredMatches.length > 8 ? 'Последние 8' : ratingHistory.length ? `${ratingHistory.length} изм.` : null;

  const statusBadges = [
    primaryRank && primaryRank <= 10 ? 'В топ-10' : null,
    stats.currentStreak.count >= 3 ? `Серия x${stats.currentStreak.count}` : null,
    matches.length > 0 ? 'Активен' : null,
  ].filter(Boolean).slice(0, 2) as string[];

  const metrics = [
    { token: 'WR', label: 'Win Rate', value: `${stats.winRate}%`, accent: true },
    { token: 'T3', label: 'Топ-3', value: `${stats.topThreeRate}%` },
    { token: 'CUP', label: 'Турниры', value: String(stats.totalTournaments) },
    { token: 'WIN', label: 'Победы', value: String(stats.gold) },
    { token: 'AVG', label: 'Ср. рейт', value: String(stats.avgRatingPts) },
  ];

  return (
    <div className="mx-auto max-w-[980px] px-1 pb-5 pt-3 sm:px-2">
      {backLink ? (
        <Link
          href={backLink.href}
          className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-white/55 transition hover:text-white"
        >
          {backLink.label}
        </Link>
      ) : null}

      <section className="overflow-hidden rounded-[32px] border border-white/6 bg-[#070707] shadow-[0_24px_70px_rgba(0,0,0,0.38)] sm:rounded-[36px]">
        <div className="relative overflow-hidden border-b border-white/6">
          {player.photoUrl ? (
            <div className="absolute inset-0">
              <PlayerPhoto
                photoUrl={player.photoUrl}
                alt={player.name}
                width={1600}
                height={960}
                className="h-full w-full object-cover opacity-[0.18]"
              />
            </div>
          ) : null}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(38,198,255,0.20),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,106,0,0.22),transparent_38%),linear-gradient(180deg,#111723_0%,#070707_78%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.28)_38%,rgba(0,0,0,0.62)_100%)]" />

          <div className="relative z-10 px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/68">
                Профиль игрока
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {sharePath ? <ProfileShareButton sharePath={sharePath} playerName={player.name} /> : null}
                <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-white/60">
                  {player.gender === 'M' ? 'Мужской' : 'Женский'}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] sm:h-32 sm:w-32">
                  {player.photoUrl ? (
                    <PlayerPhoto
                      photoUrl={player.photoUrl}
                      alt={player.name}
                      width={140}
                      height={140}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,#ff8d3a,transparent_65%),linear-gradient(180deg,#1c2434_0%,#0b0b0e_100%)] text-4xl font-black text-white">
                      {initials(player.name)}
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  {statusBadges.length ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {statusBadges.map((badge) => (
                        <span
                          key={badge}
                          className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/72"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <h1 className="mt-3 truncate text-[clamp(42px,8vw,72px)] font-black uppercase leading-[0.92] tracking-[-0.05em] text-white">
                    {player.name}
                  </h1>
                  <div className="mt-1 text-sm text-white/52 sm:text-base">
                    {player.city || 'LP Volley'} {player.bio ? `· ${player.bio}` : ''}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1.5 text-sm font-bold ${levelMeta.card} ${levelMeta.color}`}
                    >
                      {levelMeta.label}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1.5 text-sm font-bold ${activeFormatMeta.badgeTone}`}
                    >
                      {activeFormatMeta.icon} {activeFormatMeta.label}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <HeroStat label="Рейтинг" value={String(primaryRating)} accent="text-[#ff6a00]" />
                <HeroStat
                  label="Место"
                  value={primaryRank ? `#${primaryRank}` : '—'}
                  accent="text-[#ffd400]"
                />
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/14 to-transparent" />
        </div>

        <div className="grid gap-4 px-5 py-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <section className="rounded-[24px] border border-white/6 bg-[#111111] px-4 py-4">
              <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">
                Ключевые метрики
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {metrics.map((metric) => (
                  <MetricCard
                    key={metric.label}
                    token={metric.token}
                    label={metric.label}
                    value={metric.value}
                    accent={metric.accent}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-[24px] border border-white/6 bg-[#111111] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">
                  История матчей
                </div>
                {historyBadge ? (
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">
                    {historyBadge}
                  </div>
                ) : null}
              </div>

              {availableFormats.length > 1 || availableLevels.length > 1 ? (
                <div className="-mx-1 mt-3 overflow-x-auto pb-1">
                  <div className="flex min-w-max gap-2 px-1">
                    {availableFormats.length > 1 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setFilterFormat('all')}
                          className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] ${
                            filterFormat === 'all'
                              ? 'border-[#ffd400] bg-[#241d05] text-[#ffd400]'
                              : 'border-white/8 bg-[#171717] text-white/48'
                          }`}
                        >
                          Все форматы
                        </button>
                        {availableFormats.map((format) => {
                          const meta = FORMAT_META[normalizeFormatCode(format)] ?? FORMAT_META.IPT;
                          return (
                            <button
                              key={format}
                              type="button"
                              onClick={() => setFilterFormat(format)}
                              className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] ${
                                filterFormat === format
                                  ? meta.badgeTone
                                  : 'border-white/8 bg-[#171717] text-white/48'
                              }`}
                            >
                              {meta.shortLabel}
                            </button>
                          );
                        })}
                      </>
                    ) : null}

                    {availableLevels.length > 1 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setFilterLevel('all')}
                          className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] ${
                            filterLevel === 'all'
                              ? 'border-[#ff6a00] bg-[#241207] text-[#ff6a00]'
                              : 'border-white/8 bg-[#171717] text-white/48'
                          }`}
                        >
                          Все уровни
                        </button>
                        {availableLevels.map((level) => {
                          const meta = levelTone(level);
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() => setFilterLevel(level)}
                              className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] ${
                                filterLevel === level
                                  ? `${meta.card} ${meta.color}`
                                  : 'border-white/8 bg-[#171717] text-white/48'
                              }`}
                            >
                              {meta.label}
                            </button>
                          );
                        })}
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                {filteredMatches.length ? (
                  filteredMatches.slice(0, 8).map((match, index) => {
                    const badge = ResultBadge(Number(match.place));
                    const formatMeta =
                      FORMAT_META[normalizeFormatCode(String(match.format || ''))] ?? FORMAT_META.IPT;
                    const tone =
                      Number(match.place) === 1
                        ? 'border-[#1a5d2c] bg-[#0d2313]'
                        : Number(match.place) <= 3
                          ? 'border-[#6f520f] bg-[#231b07]'
                          : 'border-[#5f1b1b] bg-[#231010]';
                    const content = (
                      <article
                        className={`rounded-[22px] border px-3.5 py-3 transition hover:border-white/18 ${tone}`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <div className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-white/38 sm:w-[60px]">
                            {formatDate(String(match.tournamentDate || '')) || '—'}
                          </div>
                          <div className="flex items-center gap-2">
                            <div
                              className={`inline-flex rounded-2xl px-3 py-1.5 text-[11px] font-black uppercase ${badge.tone}`}
                            >
                              {badge.label}
                            </div>
                            <div
                              className={`inline-flex rounded-2xl border px-2.5 py-1 text-[11px] font-bold uppercase ${formatMeta.badgeTone}`}
                            >
                              {formatMeta.shortLabel}
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-base font-bold text-white">
                              {match.tournamentName}
                            </div>
                            <div className="mt-0.5 text-xs text-white/40 sm:text-sm">
                              {match.gamePts || 0}/{match.balls || 0} ·{' '}
                              {String(match.ratingType || '').trim() || 'mix'}
                            </div>
                          </div>
                        </div>
                      </article>
                    );

                    return match.tournamentId ? (
                      <Link key={`${match.tournamentId}-${index}`} href={`/calendar/${match.tournamentId}`}>
                        {content}
                      </Link>
                    ) : (
                      <div key={`history-${index}`}>{content}</div>
                    );
                  })
                ) : (
                  <div className="rounded-[22px] border border-dashed border-white/10 bg-[#171717] px-4 py-8 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-2xl">
                      🏐
                    </div>
                    <div className="mt-3 text-base font-semibold text-white">Пока нет сыгранных матчей</div>
                    <div className="mt-1 text-sm text-white/40">Участвуйте в турнирах!</div>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-[24px] border border-white/6 bg-[#111111] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">
                  Уровень игры
                </div>
                <div className={`text-xl font-black uppercase ${levelMeta.color}`}>
                  {levelMeta.label} PRO
                </div>
              </div>
              <div className="mt-3 h-3 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#ffd400_0%,#ff6a00_72%,#ff4d43_100%)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-2 text-sm text-white/35">
                {primaryRating} / {levelTarget} XP до следующего уровня
              </div>
            </section>

            <section className="rounded-[24px] border border-white/6 bg-[#111111] px-4 py-4">
              <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">
                Форматы
              </div>
              <div className="mt-3 space-y-2.5">
                {formatCards.map((formatCard) => (
                  <FormatCard
                    key={formatCard.key}
                    label={formatCard.key}
                    subtitle={`${formatCard.total} побед · ${formatCard.rating} рейт.`}
                    active={activeFormat.key === formatCard.key && formatCard.total > 0}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
