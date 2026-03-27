import Link from 'next/link';
import type { Tournament } from '@/lib/types';

interface TournamentCardProps {
  tournament: Tournament;
}

function isLikelyDirectImageUrl(url: string): boolean {
  const value = String(url || '').trim();
  if (!value) return false;
  if (value.startsWith('/')) return true;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    // These are usually album/share links (HTML), not direct image assets.
    if (u.hostname.includes('disk.yandex')) return false;
    if (u.hostname === 'yadi.sk') return false;
    if (u.hostname.includes('drive.google')) return false;
    return /\.(png|jpe?g|webp|gif|svg)$/i.test(u.pathname);
  } catch {
    return false;
  }
}

function fallbackPosterForTournament(t: Tournament): string {
  const fmt = (t.format || '').toLowerCase();
  if (fmt.includes('king')) return '/images/pravila/kotc.svg';
  if (fmt.includes('round')) return '/images/pravila/mixup.svg';
  if (fmt.includes('double')) return '/images/pravila/double.svg';
  return '/images/pravila/kotc.svg';
}

const statusLabels: Record<Tournament['status'], string> = {
  open: 'Открыта запись',
  full: 'Заполнен',
  finished: 'Завершён',
  cancelled: 'Отменён',
};

const statusStyles: Record<Tournament['status'], string> = {
  open: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  full: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  finished: 'bg-white/10 text-text-primary/70 border-white/10',
  cancelled: 'bg-red-500/20 text-red-300 border-red-500/40',
};

const levelLabels: Record<string, string> = {
  hard: 'HARD',
  medium: 'MEDIUM',
  easy: 'LITE',
  advance: 'ADVANCE',
};

const levelColors: Record<string, string> = {
  hard: 'text-red-400',
  medium: 'text-amber-400',
  easy: 'text-emerald-400',
  advance: 'text-purple-400',
};

/* Format descriptions for rich info */
const formatDescriptions: Record<string, { tagline: string; features: string[] }> = {
  'King of the Court': {
    tagline: 'Займи трон или стой в очереди!',
    features: [
      'Сторона Короля — зарабатываешь очки',
      'Сторона Претендента — свергни монарха',
      'Таймер на раунд — сирена, итоги',
    ],
  },
  'Round Robin': {
    tagline: 'Каждый сам за себя!',
    features: [
      'Нон-стоп смена партнёров и соперников',
      'Несколько туров — разные напарники',
      'Победитель в каждой категории',
    ],
  },
  'IPT Mixed': {
    tagline: 'Двое против всех!',
    features: [
      'Стабильная связка на весь турнир',
      'Микст — мужчина + женщина',
      'Максимальная сыгранность',
    ],
  },
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    return `${d.getDate()} ${months[d.getMonth()]} · ${weekdays[d.getDay()]}`;
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  return timeStr.slice(0, 5); // HH:MM
}

export default function TournamentCard({ tournament }: TournamentCardProps) {
  const badgeClass = statusStyles[tournament.status];
  const label = statusLabels[tournament.status];
  const href = `/calendar/${tournament.id}`;
  const isOpen = tournament.status === 'open';
  const isFull = tournament.status === 'full';
  const isFinished = tournament.status === 'finished';
  const fillPercent = tournament.capacity > 0
    ? Math.min(100, Math.round((tournament.participantCount / tournament.capacity) * 100))
    : 0;

  const lvl = tournament.level?.toLowerCase() ?? '';
  const levelLabel = levelLabels[lvl] ?? tournament.level;
  const levelColor = levelColors[lvl] ?? 'text-text-primary/70';

  const fmt = formatDescriptions[tournament.format] ?? null;
  const division = tournament.division || '';

  const albumUrl = String(tournament.photoUrl || '').trim();
  const posterSrc = isLikelyDirectImageUrl(albumUrl) ? albumUrl : fallbackPosterForTournament(tournament);
  const showAlbumLink = Boolean(albumUrl) && !isLikelyDirectImageUrl(albumUrl);

  return (
    <article className={`
      group relative rounded-2xl border overflow-hidden transition-all duration-300
      ${isOpen
        ? 'border-brand/40 bg-gradient-to-br from-brand/5 to-transparent hover:border-brand/70 hover:shadow-[0_0_30px_rgba(255,90,0,0.15)]'
        : isFull
          ? 'border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent hover:border-amber-500/50'
          : 'border-white/10 bg-surface-light/30 hover:border-white/20'}
    `}>
        {/* Poster (fallback if photoUrl is an album link) */}
        <div className="relative w-full aspect-[2/1] overflow-hidden">
          <img
            src={posterSrc}
            alt={tournament.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" />
          {/* Status badge on poster */}
          <span className={`absolute top-4 right-4 px-3 py-1.5 rounded-full text-xs font-body font-semibold border backdrop-blur-sm ${badgeClass}`}>
            {label}
          </span>
          {showAlbumLink && (
            <a
              href={albumUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-4 left-4 z-20 px-3 py-1.5 rounded-full text-xs font-body font-semibold border border-white/20 bg-black/30 text-text-primary/90 backdrop-blur-sm hover:border-brand/50 hover:text-brand transition-colors"
            >
              📸 Фото
            </a>
          )}
        </div>

        <div className="p-6 relative z-0">
          {/* Status badge (no poster) */}
          {!posterSrc && (
            <div className="flex items-center justify-between mb-4">
              <span className={`px-3 py-1.5 rounded-full text-xs font-body font-semibold border ${badgeClass}`}>
                {label}
              </span>
              {levelLabel && (
                <span className={`font-heading text-sm tracking-wider ${levelColor}`}>
                  {levelLabel}
                </span>
              )}
            </div>
          )}

          {/* Title */}
          <h3 className="font-heading text-3xl md:text-4xl text-text-primary leading-tight tracking-wide group-hover:text-brand transition-colors">
            {tournament.name}
          </h3>

          {/* Date / Time / Location row */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-body">
            {tournament.date && (
              <span className="inline-flex items-center gap-1.5 text-brand font-semibold">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {formatDate(tournament.date)}
              </span>
            )}
            {tournament.time && (
              <span className="inline-flex items-center gap-1.5 text-text-primary/80">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                </svg>
                {formatTime(tournament.time)}
              </span>
            )}
            {tournament.location && (
              <span className="inline-flex items-center gap-1.5 text-text-primary/80">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {tournament.location}
              </span>
            )}
          </div>

          {/* Format + Division + Level tags */}
          <div className="mt-4 flex flex-wrap gap-2">
            {tournament.format && (
              <span className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-body text-text-primary/80">
                {tournament.format}
              </span>
            )}
            {division && (
              <span className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-body text-text-primary/80">
                {division}
              </span>
            )}
            {levelLabel && (
              <span className={`px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-heading tracking-wider ${levelColor}`}>
                {levelLabel}
              </span>
            )}
          </div>

          {/* Format description block */}
          {fmt && (isOpen || isFull) && (
            <div className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/5">
              <p className="text-brand font-body font-semibold text-sm italic">
                {fmt.tagline}
              </p>
              <ul className="mt-2 space-y-1">
                {fmt.features.map((f, i) => (
                  <li key={i} className="text-xs text-text-primary/70 font-body flex items-start gap-2">
                    <span className="text-brand mt-0.5">&#10003;</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Prizes */}
          {tournament.prize && (
            <div className="mt-3 inline-flex items-center gap-2 text-sm font-body text-amber-300">
              <span>🏆</span>
              <span>{tournament.prize}</span>
            </div>
          )}

          {/* Capacity bar */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs font-body text-text-primary/60 mb-1.5">
              <span>
                Участники: <span className="text-text-primary/90 font-semibold">{tournament.participantCount}</span>/{tournament.capacity}
              </span>
              {isOpen && fillPercent >= 70 && (
                <span className="text-amber-400 font-semibold animate-pulse">
                  Осталось {tournament.capacity - tournament.participantCount} мест!
                </span>
              )}
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  fillPercent >= 90 ? 'bg-red-500' :
                  fillPercent >= 70 ? 'bg-amber-500' :
                  'bg-brand'
                }`}
                style={{ width: `${fillPercent}%` }}
              />
            </div>
          </div>

          {/* CTA for open tournaments */}
          {isOpen && (
            <div className="mt-5">
              <span className="inline-flex items-center justify-center w-full px-6 py-3 rounded-xl bg-brand text-surface font-body font-semibold text-sm group-hover:bg-brand-light transition-colors">
                Записаться на турнир
              </span>
            </div>
          )}

          {/* View results for finished */}
          {isFinished && (
            <div className="mt-5">
              <span className="inline-flex items-center justify-center w-full px-6 py-3 rounded-xl border border-white/15 text-text-primary/80 font-body text-sm group-hover:border-brand/40 group-hover:text-brand transition-colors">
                Результаты турнира →
              </span>
            </div>
          )}
        </div>

        {/* Overlay link to make the whole card clickable without nesting anchors */}
        <Link
          href={href}
          aria-label={`Открыть турнир: ${tournament.name}`}
          className="absolute inset-0 z-10"
        >
          <span className="sr-only">Открыть турнир</span>
        </Link>
      </article>
  );
}
