import Link from 'next/link';
import type { Tournament } from '@/lib/types';
import type { TournamentResultRow } from '@/lib/queries';
import { isThaiAdminFormat } from '@/lib/admin-legacy-sync';
import { ThaiSpectatorFunStats } from '@/components/thai-live/ThaiSpectatorFunStats';
import type { ThaiSpectatorBoardPayload } from '@/lib/thai-spectator';
import { buildThaiSpectatorBoardUrl } from '@/lib/tournament-links';

interface Props {
  tournament: Tournament;
  results: TournamentResultRow[];
  related: Tournament[];
  thaiBoard?: ThaiSpectatorBoardPayload | null;
}

// ── Fire keywords: heading gets neon-fire glow if matched ──────────────────
const FIRE_KEYWORDS = ['МОНСТР', 'ЛЮТ', 'HARD', 'MONSTER', 'BEAST', 'FIRE', 'FIERCE'];
function isFieryCup(name: string): boolean {
  const up = name.toUpperCase();
  return FIRE_KEYWORDS.some((k) => up.includes(k)) || up.includes('!');
}

// ── Emotional stats caption ────────────────────────────────────────────────
function statsCaption(t: Pick<Tournament, 'level' | 'format'>): string {
  const lvl = (t.level || '').toLowerCase();
  const fmt = (t.format || '').toLowerCase();
  if (lvl.includes('hard')) return 'Один из самых жарких турниров сезона 🔥';
  if (fmt.includes('thai')) return 'Thai формат — настоящий экзамен для игроков ⚡';
  return 'Спасибо всем участникам за огонь и драйв!';
}

// ── Date formatter ─────────────────────────────────────────────────────────
function formatDate(date: string, time: string): string {
  if (!date) return 'Дата уточняется';
  try {
    const base = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${date}T00:00:00`));
    return time ? `${base} · ${time}` : base;
  } catch {
    return [date, time].filter(Boolean).join(' · ');
  }
}

// ── Initials from name ─────────────────────────────────────────────────────
function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// ── Podium medal colours ───────────────────────────────────────────────────
const MEDAL_EMOJI = ['🥇', '🥈', '🥉'];
const MEDAL_BORDER = [
  'border-[#FFD700]/55',
  'border-[#C0C0C0]/45',
  'border-[#CD7F32]/45',
];
const MEDAL_GLOW = [
  'shadow-[0_0_18px_rgba(255,215,0,0.25)]',
  'shadow-[0_0_12px_rgba(192,192,192,0.18)]',
  'shadow-[0_0_10px_rgba(205,127,50,0.18)]',
];

// ── Inline SVG icons ───────────────────────────────────────────────────────
function VkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.07 2H8.93C3.33 2 2 3.33 2 8.93v6.14C2 20.67 3.33 22 8.93 22h6.14C20.67 22 22 20.67 22 15.07V8.93C22 3.33 20.67 2 15.07 2zm3.08 13.5h-1.56c-.59 0-.77-.47-1.83-1.55-.92-.9-1.32-.9-1.55-.9-.31 0-.4.09-.4.52v1.41c0 .37-.12.59-1.1.59-1.62 0-3.41-1-4.67-2.85C5.34 10.66 5 8.66 5 8.28c0-.23.09-.44.52-.44h1.56c.38 0 .53.18.68.6.74 2.14 1.98 4.01 2.49 4.01.19 0 .28-.09.28-.58V9.5c-.06-1.04-.61-1.13-.61-1.5 0-.18.15-.37.38-.37h2.45c.33 0 .44.18.44.55v2.97c0 .33.15.44.24.44.19 0 .35-.11.7-.46 1.08-1.21 1.85-3.07 1.85-3.07.1-.23.29-.44.67-.44h1.56c.47 0 .57.24.47.57-.2.91-2.1 3.6-2.1 3.6-.17.27-.22.39 0 .69.16.22.68.68 1.03 1.09.64.73 1.13 1.35 1.26 1.77.13.41-.08.62-.5.62z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8l-1.69 7.96c-.12.56-.46.7-.93.43l-2.58-1.9-1.24 1.2c-.14.14-.25.25-.51.25l.18-2.62 4.72-4.26c.2-.18-.05-.28-.32-.1L7.9 14.38 5.36 13.6c-.55-.17-.56-.55.12-.82l8.94-3.44c.46-.17.86.11.72.82l-.5-.36z" />
    </svg>
  );
}

// ── Avatar component ───────────────────────────────────────────────────────
function Avatar({ photoUrl, name, size }: { photoUrl: string; name: string; size: number }) {
  const cls = `rounded-full object-cover flex-shrink-0`;
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className={cls}
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={`${cls} bg-white/10 flex items-center justify-center font-heading text-text-primary/80`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function FinishedTournamentPage({
  tournament,
  results,
  related,
  thaiBoard = null,
}: Props) {
  const { id, name, date, time, location, format, division, level, participantCount, photoUrl } =
    tournament;

  const isThai = isThaiAdminFormat(format);
  const thaiUrl = isThai ? buildThaiSpectatorBoardUrl(id) : null;
  const pageUrl = `https://lpvolley.ru/calendar/${id}`;
  const vkUrl = `https://vk.com/share.php?url=${encodeURIComponent(pageUrl)}`;
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(`Результаты: ${name}`)}`;

  const fiery = isFieryCup(name);
  const isHardLevel = (level || '').toLowerCase().includes('hard');

  // Podium: top 3 sorted by place
  const podium = results
    .filter((r) => r.place >= 1 && r.place <= 3)
    .sort((a, b) => a.place - b.place);

  // Stats
  const totalWins = results.reduce((s, r) => s + (r.wins ?? 0), 0);
  const totalBalls = results.reduce((s, r) => s + (r.balls ?? 0), 0);
  const topRating = results.length > 0 ? Math.max(...results.map((r) => r.ratingPts)) : 0;
  const thaiStatsSourceText =
    thaiBoard?.viewSource === 'snapshot'
      ? 'Номинации и финальные показатели из архивного снимка Thai-табло.'
      : 'Номинации и финальные показатели из финального Thai-табло.';

  // Next upcoming tournament
  const nextTournament = related.find((t) => t.status === 'open' || t.status === 'full') ?? null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* Breadcrumb */}
      <nav aria-label="\u041d\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044f" className="anim-fade-up mb-5">
        <Link
          href="/calendar"
          className="inline-flex items-center gap-1 text-sm font-body text-text-secondary hover:text-brand transition-colors"
        >
          <span className="text-base leading-none">&lsaquo;</span> Календарь
        </Link>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="hero-poster relative overflow-hidden rounded-2xl px-6 py-14 md:py-20 min-h-[420px] flex flex-col justify-end anim-fade-up anim-delay-1">
        {/* Background photo */}
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-[1.03] object-cover opacity-45 md:opacity-50 blur-[1px]"
            fetchPriority="high"
            loading="lazy"
          />
        ) : null}

        {/* Sunset overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/35 to-[#FF5A00]/20 pointer-events-none" />

        {/* Content */}
        <div className="relative z-10 flex flex-col gap-4">
          {/* Name */}
          <h1
            className={[
              'font-heading uppercase tracking-tight leading-none text-5xl md:text-7xl text-text-primary',
              fiery ? 'neon-fire' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ textShadow: '0 2px 24px rgba(255,90,0,0.45)' }}
          >
            {name}
          </h1>

          {/* Pills */}
          <div className="flex flex-wrap gap-2">
            {format ? (
              <span
                className={[
                  'text-xs px-3 py-1 rounded-full border font-body font-semibold',
                  isThai
                    ? 'border-teal-400/50 bg-teal-400/10 text-teal-300'
                    : 'border-white/20 bg-white/5 text-text-primary/80',
                ].join(' ')}
              >
                {format}
              </span>
            ) : null}
            {division ? (
              <span className="text-xs px-3 py-1 rounded-full border border-white/20 bg-white/5 text-text-primary/70 font-body">
                {division}
              </span>
            ) : null}
            {level ? (
              <span
                className={[
                  'text-xs px-3 py-1 rounded-full border font-body font-semibold',
                  isHardLevel
                    ? 'border-brand/50 bg-brand/15 text-orange-300'
                    : 'border-white/20 bg-white/5 text-text-primary/70',
                ].join(' ')}
              >
                {level}
              </span>
            ) : null}
            {participantCount > 0 ? (
              <span className="text-xs px-3 py-1 rounded-full border border-white/20 bg-white/5 text-text-primary/70 font-body">
                👥 {participantCount} участников
              </span>
            ) : null}
          </div>

          {/* Date + location */}
          <p className="text-base md:text-lg font-body text-text-primary/90">
            {formatDate(date, time)}
            {location ? (
              <>
                {' '}
                <span className="text-text-secondary">·</span>{' '}
                <span className="text-text-secondary">{location}</span>
              </>
            ) : null}
          </p>

          {/* Status badge */}
          <div>
            <span className="inline-flex items-center bg-brand text-white font-heading tracking-widest px-5 py-2 rounded-full text-sm neon-fire">
              ТУРНИР ЗАВЕРШЁН
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-2">
            <a href="#results" className="btn-action flex items-center gap-2 justify-center">
              🏆 Результаты турнира
            </a>

            {photoUrl ? (
              <a
                href={photoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-action-outline flex items-center gap-2 justify-center"
                aria-label="Открыть фото турнира"
              >
                📸 Фото с турнира
              </a>
            ) : null}

            {thaiUrl ? (
              <a
                href={thaiUrl}
                className="btn-action-outline flex items-center gap-2 justify-center"
                aria-label="Открыть табло Thai"
              >
                Табло Thai
              </a>
            ) : null}

            <a
              href={vkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-action-outline flex items-center gap-2 justify-center"
              aria-label="Поделиться во ВКонтакте"
            >
              <VkIcon /> VK
            </a>

            <a
              href={tgUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-action-outline flex items-center gap-2 justify-center"
              aria-label="Поделиться в Telegram"
            >
              <TelegramIcon /> Telegram
            </a>
          </div>
        </div>
      </div>

      {/* ── Podium ───────────────────────────────────────────────────── */}
      {podium.length >= 1 ? (
        <section aria-label="Победители" className="mt-10 anim-fade-up anim-delay-2">
          <h2 className="font-heading text-3xl md:text-4xl tracking-wide text-text-primary mb-6">
            Победители
          </h2>

          {/* Desktop podium */}
          <div className="hidden md:flex items-end justify-center gap-4">
            {/* 2nd place — left */}
            {podium[1] ? (
              <PodiumSlot row={podium[1]} idx={1} heightClass="h-44" />
            ) : (
              <div className="flex-1 max-w-[180px] h-44" />
            )}
            {/* 1st place — center, tallest */}
            {podium[0] ? (
              <PodiumSlot row={podium[0]} idx={0} heightClass="h-56" elevated />
            ) : null}
            {/* 3rd place — right */}
            {podium[2] ? (
              <PodiumSlot row={podium[2]} idx={2} heightClass="h-40" />
            ) : (
              <div className="flex-1 max-w-[180px] h-40" />
            )}
          </div>

          {/* Mobile: vertical stack 1→2→3 */}
          <div className="flex flex-col items-center gap-4 md:hidden">
            {podium.sort((a, b) => a.place - b.place).map((row) => (
              <PodiumSlot key={row.playerId} row={row} idx={row.place - 1} heightClass="h-auto" mobile />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Stats strip ──────────────────────────────────────────────── */}
      {results.length > 0 ? (
        <div className="mt-8 anim-fade-up anim-delay-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon="👥" label="Участников" value={String(results.length)} />
            <StatCard icon="🔥" label="Матчей сыграно" value={String(totalWins)} />
            {totalBalls > 0 ? (
              <StatCard icon="🏐" label="Мячей в игре" value={String(totalBalls)} />
            ) : null}
            {topRating > 0 ? (
              <StatCard icon="⚡" label="Топ рейтинг" value={`${topRating} pts`} />
            ) : null}
          </div>
          <p className="text-sm font-body text-text-secondary italic mt-3 text-center">
            {statsCaption(tournament)}
          </p>
        </div>
      ) : null}

      {/* ── Results table ────────────────────────────────────────────── */}
      {thaiBoard?.funStats ? (
        <section className="mt-10 anim-fade-up anim-delay-4" aria-label="Статистика Thai табло">
          <div className="mb-4 rounded-2xl border border-[#00E5FF]/20 bg-[rgba(0,229,255,0.06)] px-5 py-4">
            <div className="text-[10px] font-body uppercase tracking-[0.24em] text-[#00E5FF]">
              Thai табло
            </div>
            <h2 className="mt-1 font-heading text-3xl uppercase tracking-wide text-text-primary">
              Статистика с табло
            </h2>
            <p className="mt-2 text-sm font-body text-text-secondary">{thaiStatsSourceText}</p>
          </div>
          <ThaiSpectatorFunStats stats={thaiBoard.funStats} />
        </section>
      ) : null}

      {results.length > 0 ? (
        <div id="results" className="mt-10 anim-fade-up anim-delay-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-heading text-3xl md:text-4xl tracking-wide text-text-primary">
              Таблица результатов
            </h2>
            <span className="text-xs font-body text-text-secondary border border-white/10 rounded-full px-3 py-1">
              {results.length} игроков
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20">
            <table role="table" className="min-w-full text-sm font-body">
              <thead>
                <tr className="sticky top-0 bg-surface/95 border-b border-white/10 text-text-secondary text-xs">
                  <th className="px-4 py-3 text-left font-medium w-12">Место</th>
                  <th className="px-4 py-3 text-left font-medium">Игрок</th>
                  <th className="px-4 py-3 text-center font-medium">Победы</th>
                  <th className="px-4 py-3 text-center font-medium">Diff</th>
                  <th className="px-4 py-3 text-center font-medium">Мячи</th>
                  <th className="px-4 py-3 text-right font-medium" title="Очки в рейтинг">
                    В рейтинг
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => {
                  const medalIdx = row.place - 1;
                  const hasMedal = medalIdx >= 0 && medalIdx <= 2;
                  const borderCls = hasMedal
                    ? ['border-l-4 border-[#FFD700]/70', 'border-l-4 border-[#C0C0C0]/60', 'border-l-4 border-[#CD7F32]/60'][medalIdx]
                    : 'border-l-4 border-transparent';
                  return (
                    <tr
                      key={`${row.playerId}-${row.place}`}
                      className={`border-b border-white/5 ${borderCls} ${hasMedal ? 'bg-white/[0.02]' : ''}`}
                    >
                      <td className="px-4 py-3 text-text-primary font-semibold">
                        {hasMedal ? (
                          <span role="img" aria-label={`${row.place} место`}>
                            {MEDAL_EMOJI[medalIdx]}
                          </span>
                        ) : (
                          row.place
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar photoUrl={row.playerPhotoUrl} name={row.playerName} size={28} />
                          <span className="text-text-primary">{row.playerName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-text-primary/80">{row.wins}</td>
                      <td className="px-4 py-3 text-center text-text-primary/80">{row.diff}</td>
                      <td className="px-4 py-3 text-center text-text-primary/80">{row.balls}</td>
                      <td className="px-4 py-3 text-right text-brand font-semibold">{row.ratingPts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── Photo block ──────────────────────────────────────────────── */}
      {photoUrl ? (
        <div className="mt-8 anim-fade-up anim-delay-4">
          <a
            href={photoUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Открыть фото турнира"
            className="block group"
          >
            <div className="relative rounded-2xl overflow-hidden h-48 md:h-64 border border-white/10">
              <img
                src={photoUrl}
                alt="Фото турнира"
                className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-75 transition-opacity duration-300"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute bottom-4 left-5 flex items-center gap-2 font-heading text-xl tracking-wide text-text-primary">
                📸 Открыть фото турнира →
              </div>
            </div>
          </a>
        </div>
      ) : null}

      {/* ── Next tournament ───────────────────────────────────────────── */}
      {nextTournament ? (
        <div className="mt-8 anim-fade-up anim-delay-4">
          <div className="border border-brand/40 bg-brand/5 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-body uppercase tracking-[0.18em] text-brand mb-1">
                Следующий турнир
              </p>
              <h3 className="font-heading text-2xl text-text-primary">{nextTournament.name}</h3>
              <p className="text-sm font-body text-text-secondary mt-1">
                {formatDate(nextTournament.date, nextTournament.time)}
                {nextTournament.location ? ` · ${nextTournament.location}` : ''}
              </p>
            </div>
            <Link
              href={`/calendar/${nextTournament.id}`}
              className="inline-flex items-center justify-center rounded-lg bg-brand px-5 py-2.5 font-body font-semibold text-white transition-colors hover:bg-brand-light whitespace-nowrap"
            >
              Подробнее →
            </Link>
          </div>
        </div>
      ) : null}
    </main>
  );
}

// ── Podium slot sub-component ──────────────────────────────────────────────
function PodiumSlot({
  row,
  idx,
  heightClass,
  elevated = false,
  mobile = false,
}: {
  row: TournamentResultRow;
  idx: number;
  heightClass: string;
  elevated?: boolean;
  mobile?: boolean;
}) {
  const safeIdx = Math.min(idx, 2);
  return (
    <div
      className={[
        'flex-1 max-w-[200px] rounded-2xl p-4 flex flex-col items-center justify-end gap-2',
        'bg-gradient-to-t from-amber-900/30 to-black/50',
        'border-2',
        MEDAL_BORDER[safeIdx],
        MEDAL_GLOW[safeIdx],
        elevated ? 'rank-1-expanded' : '',
        heightClass,
        mobile ? 'w-full max-w-[260px]' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Avatar photoUrl={row.playerPhotoUrl} name={row.playerName} size={72} />
      <span
        role="img"
        aria-label={`${row.place} место`}
        className="text-3xl leading-none mt-1"
      >
        {MEDAL_EMOJI[safeIdx]}
      </span>
      <p className="font-heading text-lg text-text-primary text-center leading-tight">
        {row.playerName}
      </p>
      {row.ratingPts > 0 ? (
        <p className="text-brand font-semibold text-sm font-body">{row.ratingPts} pts</p>
      ) : null}
    </div>
  );
}

// ── Stats card sub-component ───────────────────────────────────────────────
function StatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
      <div className="text-[11px] font-body uppercase tracking-[0.18em] text-text-secondary">
        {icon} {label}
      </div>
      <div className="text-xl font-heading text-text-primary mt-1">{value}</div>
    </div>
  );
}
