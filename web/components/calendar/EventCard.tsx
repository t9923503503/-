import Link from 'next/link';
import type { Tournament } from '@/lib/types';
import {
  buildTournamentEventKey,
  sortTournamentGroupsForCalendar,
} from '@/lib/calendar';
import {
  fallbackPosterForTournament,
  isLikelyHostedPlayerOrVkPhoto,
  localPosterForTournamentId,
} from '@/lib/tournament-poster';

export interface TournamentGroup {
  key: string;
  baseName: string;
  date: string;
  time: string;
  location: string;
  format: string;
  status: Tournament['status'];
  photoUrl: string;
  prize: string;
  totalCapacity: number;
  totalParticipants: number;
  totalWaitlist: number;
  partnerRequestCount: number;
  categories: {
    id: string;
    level: string;
    division: string;
    participantCount: number;
    capacity: number;
    waitlistCount: number;
    partnerRequestCount: number;
    name: string;
  }[];
}

const levelOrder: Record<string, number> = {
  hard: 0,
  advance: 0,
  medium: 1,
  easy: 2,
};

const levelLabels: Record<string, string> = {
  hard: 'HARD',
  advance: 'ADVANCE',
  medium: 'MEDIUM',
  easy: 'LITE',
};

const levelColors: Record<string, string> = {
  hard: 'bg-red-500/20 text-red-300 border-red-500/40',
  advance: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  easy: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
};

const statusLabels: Record<Tournament['status'], string> = {
  open: 'Открыта запись',
  full: 'Основной состав заполнен',
  finished: 'Турнир завершен',
  cancelled: 'Турнир отменен',
};

const statusStyles: Record<Tournament['status'], string> = {
  open: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  full: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  finished: 'bg-white/10 text-text-primary/70 border-white/10',
  cancelled: 'bg-red-500/20 text-red-300 border-red-500/40',
};

const formatDescriptions: Record<string, { tagline: string; features: string[] }> = {
  'King of the Court': {
    tagline: 'Займи трон или стой в очереди на атаку.',
    features: [
      'Сторона короля приносит очки',
      'Сторона претендента выбивает лидеров',
      'Динамичные короткие раунды с постоянной ротацией',
    ],
  },
  'Round Robin': {
    tagline: 'Каждый сам за себя, но партнеры постоянно меняются.',
    features: [
      'Много коротких игр без долгих пауз',
      'Несколько туров с разными напарниками',
      'Отдельный победитель в каждой категории',
    ],
  },
  'IPT Mixed': {
    tagline: 'Пара на весь турнир и плотная борьба до конца.',
    features: [
      'Фиксированная связка на весь турнир',
      'Микстовый формат: мужчина + женщина',
      'Максимум сыгранности и тактики',
    ],
  },
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '';

  try {
    const date = new Date(`${dateStr}T00:00:00`);
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      weekday: 'short',
    }).format(date);
  } catch {
    return dateStr;
  }
}

export function groupTournaments(tournaments: Tournament[]): TournamentGroup[] {
  const grouped = new Map<string, Tournament[]>();

  for (const tournament of tournaments) {
    const key = buildTournamentEventKey(tournament);
    const list = grouped.get(key) ?? [];
    list.push(tournament);
    grouped.set(key, list);
  }

  const groups: TournamentGroup[] = [];

  for (const [key, items] of grouped) {
    items.sort((a, b) => {
      const aLevel = levelOrder[a.level?.toLowerCase()] ?? 9;
      const bLevel = levelOrder[b.level?.toLowerCase()] ?? 9;
      if (aLevel !== bLevel) return aLevel - bLevel;
      return (a.division ?? '').localeCompare(b.division ?? '', 'ru');
    });

    const first = items[0];
    const photo = items.find((item) => item.photoUrl)?.photoUrl ?? '';
    const prize = items.find((item) => item.prize)?.prize ?? '';

    let status: Tournament['status'] = 'finished';
    if (items.some((item) => item.status === 'open')) status = 'open';
    else if (items.some((item) => item.status === 'full')) status = 'full';

    groups.push({
      key,
      baseName: items.length === 1 ? first.name : first.format || first.name,
      date: first.date,
      time: first.time,
      location: first.location,
      format: first.format,
      status,
      photoUrl: photo,
      prize,
      totalCapacity: items.reduce((sum, item) => sum + item.capacity, 0),
      totalParticipants: items.reduce((sum, item) => sum + item.participantCount, 0),
      totalWaitlist: items.reduce((sum, item) => sum + Number(item.waitlistCount ?? 0), 0),
      partnerRequestCount: items.reduce(
        (sum, item) => sum + Number(item.partnerRequestCount ?? 0),
        0
      ),
      categories: items.map((item) => ({
        id: item.id,
        level: item.level?.toLowerCase() ?? '',
        division: item.division ?? '',
        participantCount: item.participantCount,
        capacity: item.capacity,
        waitlistCount: Number(item.waitlistCount ?? 0),
        partnerRequestCount: Number(item.partnerRequestCount ?? 0),
        name: item.name,
      })),
    });
  }

  return sortTournamentGroupsForCalendar(groups);
}

export default function EventCard({ group }: { group: TournamentGroup }) {
  const isOpen = group.status === 'open';
  const isFull = group.status === 'full';
  const isFinished = group.status === 'finished';
  const formatInfo = formatDescriptions[group.format] ?? null;

  const albumUrl = String(group.photoUrl || '').trim();
  const localPosterSrc =
    group.categories.map((category) => localPosterForTournamentId(category.id)).find(Boolean) ?? '';
  const posterSrc = localPosterSrc || (isLikelyHostedPlayerOrVkPhoto(albumUrl)
    ? albumUrl
    : fallbackPosterForTournament({ format: group.format || group.baseName }));
  const hasEditorialPoster = Boolean(localPosterSrc);
  const showAlbumLink = Boolean(albumUrl) && !isLikelyHostedPlayerOrVkPhoto(albumUrl);
  const fillPercent =
    group.totalCapacity > 0
      ? Math.min(100, Math.round((group.totalParticipants / group.totalCapacity) * 100))
      : 0;
  const spotsLeft =
    group.totalCapacity > 0
      ? Math.max(0, group.totalCapacity - group.totalParticipants)
      : null;
  const uniqueDivisions = [
    ...new Set(group.categories.map((category) => category.division).filter(Boolean)),
  ];
  const singleLink =
    group.categories.length === 1 ? `/calendar/${group.categories[0].id}` : null;

  return (
    <div className="group">
      <article
        className={[
          'relative overflow-hidden rounded-2xl border transition-all duration-300',
          isOpen
            ? 'border-brand/40 bg-gradient-to-br from-brand/5 to-transparent hover:border-brand/70 hover:shadow-[0_0_30px_rgba(255,90,0,0.15)]'
            : isFull
              ? 'border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent hover:border-amber-500/50'
              : hasEditorialPoster
                ? 'border-brand/25 bg-gradient-to-br from-brand/10 via-surface-light/40 to-cyan-500/5 hover:border-brand/45 hover:shadow-[0_0_34px_rgba(255,90,0,0.14)]'
                : 'border-white/10 bg-surface-light/30 hover:border-white/20',
        ].join(' ')}
      >
        <div className="relative aspect-[2.2/1] w-full overflow-hidden">
          <img
            src={posterSrc}
            alt={group.baseName}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/55 to-transparent" />
          {hasEditorialPoster ? (
            <div className="absolute left-4 top-4 rounded-full border border-brand/35 bg-black/45 px-3 py-1.5 text-xs font-body font-semibold text-brand-light backdrop-blur-sm">
              {'\u0424\u043e\u0442\u043e\u043e\u0442\u0447\u0451\u0442'}
            </div>
          ) : null}
          <span
            className={[
              'absolute right-4 top-4 rounded-full border px-3 py-1.5 text-xs font-body font-semibold backdrop-blur-sm',
              statusStyles[group.status],
            ].join(' ')}
          >
            {statusLabels[group.status]}
          </span>
          {showAlbumLink ? (
            <a
              href={albumUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-4 left-4 z-20 rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-xs font-body font-semibold text-text-primary/90 backdrop-blur-sm transition-colors hover:border-brand/50 hover:text-brand"
            >
              Фото
            </a>
          ) : null}
        </div>

        <div className="relative z-0 p-6">
          <h3 className="font-heading text-3xl leading-tight tracking-wide text-text-primary transition-colors group-hover:text-brand md:text-4xl">
            {group.baseName}
          </h3>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-body">
            {group.date ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-brand">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {formatDate(group.date)}
              </span>
            ) : null}
            {group.time ? (
              <span className="inline-flex items-center gap-1.5 text-text-primary/80">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                {group.time.slice(0, 5)}
              </span>
            ) : null}
            {group.location ? (
              <span className="inline-flex items-center gap-1.5 text-text-primary/80">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {group.location}
              </span>
            ) : null}
          </div>

          {uniqueDivisions.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {uniqueDivisions.map((division) => (
                <span
                  key={division}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-body text-text-primary/80"
                >
                  {division}
                </span>
              ))}
              {group.format ? (
                <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-body text-text-primary/80">
                  {group.format}
                </span>
              ) : null}
            </div>
          ) : null}

          {spotsLeft != null || group.totalWaitlist > 0 || group.partnerRequestCount > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {spotsLeft != null && (isOpen || isFull) ? (
                <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-body font-semibold text-brand-light">
                  {isOpen ? `Осталось мест: ${spotsLeft}` : 'Доступен лист ожидания'}
                </span>
              ) : null}
              {group.totalWaitlist > 0 ? (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-body font-semibold text-amber-300">
                  Лист ожидания: {group.totalWaitlist}
                </span>
              ) : null}
              {group.partnerRequestCount > 0 ? (
                <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-body font-semibold text-sky-200">
                  Ищут пару: {group.partnerRequestCount}
                </span>
              ) : null}
            </div>
          ) : null}

          {formatInfo && (isOpen || isFull) ? (
            <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <p className="text-sm font-body font-semibold italic text-brand">
                {formatInfo.tagline}
              </p>
              <ul className="mt-2 space-y-1">
                {formatInfo.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-xs font-body text-text-primary/70"
                  >
                    <span className="mt-0.5 text-brand">&#10003;</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {group.categories.length > 1 ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-body uppercase tracking-widest text-text-primary/50">
                Категории
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {group.categories.map((category) => {
                  const levelLabel = levelLabels[category.level] ?? category.level;
                  const levelColor =
                    levelColors[category.level] ?? 'bg-white/5 text-text-primary/60 border-white/10';

                  return (
                    <Link
                      key={category.id}
                      href={`/calendar/${category.id}`}
                      className={`flex flex-col items-center rounded-xl border p-3 transition-colors hover:bg-white/5 ${levelColor}`}
                    >
                      <span className="font-heading text-sm tracking-wider">
                        {levelLabel}
                      </span>
                      {category.division ? (
                        <span className="mt-0.5 text-[10px] font-body opacity-70">
                          {category.division === 'Мужской'
                            ? '♂ Муж'
                            : category.division === 'Женский'
                              ? '♀ Жен'
                              : category.division}
                        </span>
                      ) : null}
                      <span className="mt-1 text-[10px] font-body opacity-50">
                        {category.participantCount}/{category.capacity}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}

          {group.prize ? (
            <div className="mt-3 inline-flex items-center gap-2 text-sm font-body text-amber-300">
              <span>🏆</span>
              <span>{group.prize}</span>
            </div>
          ) : null}

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs font-body text-text-primary/60">
              <span>
                Всего участников:{' '}
                <span className="font-semibold text-text-primary/90">
                  {group.totalParticipants}
                </span>
                /{group.totalCapacity}
              </span>
              {spotsLeft != null && (isOpen || isFull) ? (
                <span>Свободно: {spotsLeft}</span>
              ) : null}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={[
                  'h-full rounded-full transition-all duration-500',
                  fillPercent >= 90
                    ? 'bg-red-500'
                    : fillPercent >= 70
                      ? 'bg-amber-500'
                      : 'bg-brand',
                ].join(' ')}
                style={{ width: `${fillPercent}%` }}
              />
            </div>
          </div>

          {isOpen || isFull ? (
            <div className="mt-5">
              <span className="inline-flex w-full items-center justify-center rounded-xl bg-brand px-6 py-3 text-sm font-body font-semibold text-surface transition-colors group-hover:bg-brand-light">
                {isOpen
                  ? 'Открыть турнир и записаться'
                  : 'Открыть турнир и встать в waitlist'}
              </span>
            </div>
          ) : null}

          {isFinished && group.categories.length <= 1 ? (
            <div className="mt-5">
              <span className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-body text-text-primary/80 transition-colors group-hover:border-brand/40 group-hover:text-brand">
                Открыть турнир и результаты
              </span>
            </div>
          ) : null}
        </div>

        {singleLink ? (
          <Link
            href={singleLink}
            aria-label={`Открыть турнир: ${group.baseName}`}
            className="absolute inset-0 z-10"
          >
            <span className="sr-only">Открыть турнир</span>
          </Link>
        ) : null}

      </article>
    </div>
  );
}
