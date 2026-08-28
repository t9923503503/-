import Link from 'next/link';
import type { Tournament } from '@/lib/types';
import { buildTournamentEventKey, sortTournamentGroupsForCalendar } from '@/lib/calendar';
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
  coverPhotoUrl: string;
  prize: string;
  totalCapacity: number;
  totalParticipants: number;
  totalWaitlist: number;
  partnerRequestCount: number;
  categories: Array<{
    id: string;
    level: string;
    division: string;
    participantCount: number;
    capacity: number;
    waitlistCount: number;
    partnerRequestCount: number;
    name: string;
  }>;
}

const statusLabels: Record<Tournament['status'], string> = {
  open: 'Запись открыта',
  full: 'Лист ожидания',
  in_progress: 'Идёт турнир',
  awaiting_results: 'Результаты готовятся',
  finished: 'Завершён',
  cancelled: 'Отменён',
};

const statusStyles: Record<Tournament['status'], string> = {
  open: 'border-emerald-400/35 bg-emerald-400/15 text-emerald-300',
  full: 'border-amber-400/35 bg-amber-400/15 text-amber-200',
  in_progress: 'border-sky-400/35 bg-sky-400/15 text-sky-200',
  awaiting_results: 'border-amber-400/35 bg-amber-400/10 text-amber-200',
  finished: 'border-white/10 bg-black/30 text-white/60',
  cancelled: 'border-red-400/35 bg-red-400/15 text-red-200',
};

const levelLabels: Record<string, string> = {
  hard: 'Сильный',
  advance: 'Продвинутый',
  medium: 'Средний',
  easy: 'Лёгкий',
};

function cleanFormat(value: string): string {
  if (/thai/i.test(value)) return 'Тайский формат';
  return value;
}

function cleanLocation(value: string): string {
  return value
    .replace(/МАЛИБУ/giu, 'Малибу')
    .replace(/сити\s*молл/giu, 'Сити Молл')
    .trim();
}

function formatDate(dateStr: string) {
  if (!dateStr) return { day: '—', month: 'Дата уточняется', full: '' };
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { day: dateStr, month: '', full: dateStr };
  return {
    day: new Intl.DateTimeFormat('ru-RU', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(date).replace('.', ''),
    full: new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(date),
  };
}

function displayName(group: TournamentGroup): string {
  const cleaned = group.baseName
    .replace(/\s*[·|]\s*\d{4}-\d{2}-\d{2}\s*$/u, '')
    .replace(/^THAI\s*[·|:-]?\s*/iu, '')
    .trim();
  if (cleaned && !/^\d+$/u.test(cleaned)) return cleaned;
  return `${cleanFormat(group.format)}${group.categories[0]?.division ? ` · ${group.categories[0].division}` : ''}`;
}

export function groupTournaments(tournaments: Tournament[]): TournamentGroup[] {
  const grouped = new Map<string, Tournament[]>();
  for (const tournament of tournaments) {
    const key = buildTournamentEventKey(tournament);
    grouped.set(key, [...(grouped.get(key) ?? []), tournament]);
  }

  const groups = Array.from(grouped, ([key, items]) => {
    const first = items[0];
    let status: Tournament['status'] = 'finished';
    if (items.some((item) => item.status === 'open')) status = 'open';
    else if (items.some((item) => item.status === 'full')) status = 'full';
    else if (items.some((item) => item.status === 'in_progress')) status = 'in_progress';
    else if (items.some((item) => item.status === 'awaiting_results')) status = 'awaiting_results';
    else if (items.some((item) => item.status === 'cancelled')) status = 'cancelled';

    return {
      key,
      baseName: items.length === 1 ? first.name : first.format || first.name,
      date: first.date,
      time: first.time,
      location: first.location,
      format: first.format,
      status,
      photoUrl: items.find((item) => item.photoUrl)?.photoUrl ?? '',
      coverPhotoUrl: items.find((item) => item.coverPhotoUrl)?.coverPhotoUrl ?? '',
      prize: items.find((item) => item.prize)?.prize ?? '',
      totalCapacity: items.reduce((sum, item) => sum + item.capacity, 0),
      totalParticipants: items.reduce((sum, item) => sum + item.participantCount, 0),
      totalWaitlist: items.reduce((sum, item) => sum + Number(item.waitlistCount ?? 0), 0),
      partnerRequestCount: items.reduce((sum, item) => sum + Number(item.partnerRequestCount ?? 0), 0),
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
    } satisfies TournamentGroup;
  });

  return sortTournamentGroupsForCalendar(groups);
}

export default function EventCard({ group, compact = false }: { group: TournamentGroup; compact?: boolean }) {
  const date = formatDate(group.date);
  const singleHref = group.categories.length === 1 ? `/calendar/${group.categories[0].id}` : null;
  const localPoster = group.categories.map((item) => localPosterForTournamentId(item.id)).find(Boolean) ?? '';
  const poster = group.coverPhotoUrl || localPoster || (isLikelyHostedPlayerOrVkPhoto(group.photoUrl)
    ? group.photoUrl
    : fallbackPosterForTournament({ format: group.format || group.baseName }));
  const spots = Math.max(0, group.totalCapacity - group.totalParticipants);
  const fill = group.totalCapacity ? Math.min(100, Math.round(group.totalParticipants / group.totalCapacity * 100)) : 0;
  const divisions = [...new Set(group.categories.map((item) => item.division).filter(Boolean))];
  const levels = [...new Set(group.categories.map((item) => levelLabels[item.level] || item.level).filter(Boolean))];

  if (compact) {
    return (
      <article className="group relative grid grid-cols-[64px_1fr_auto] items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition hover:border-white/20 hover:bg-white/[0.06] max-sm:grid-cols-[56px_1fr]">
        <div className="rounded-xl bg-white/[0.06] py-2 text-center">
          <div className="font-heading text-2xl leading-none text-white/85">{date.day}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40">{date.month}</div>
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-heading text-xl tracking-wide text-white/90">{displayName(group)}</h3>
          <p className="mt-1 truncate text-xs text-white/45">
            {[cleanFormat(group.format), divisions.join(' · '), cleanLocation(group.location)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-3 max-sm:col-span-2 max-sm:pl-[72px]">
          {group.photoUrl || group.coverPhotoUrl ? <span className="text-xs text-white/45">Фото</span> : null}
          <span className="text-sm font-semibold text-white/60 transition group-hover:text-brand">
            {group.status === 'awaiting_results'
              ? 'Результаты готовятся'
              : group.status === 'in_progress'
                ? 'Турнир идёт'
                : 'Результаты →'}
          </span>
        </div>
        {singleHref ? <Link href={singleHref} className="absolute inset-0" aria-label={`Открыть ${displayName(group)}`} /> : null}
      </article>
    );
  }

  return (
    <article className="calendar-event-card group relative overflow-hidden rounded-[28px] border border-white/10 bg-[#121212] shadow-[0_24px_80px_rgba(0,0,0,.2)] transition hover:-translate-y-0.5 hover:border-brand/35">
      <div className="grid min-h-[300px] md:grid-cols-[250px_1fr]">
        <div className="relative min-h-[210px] overflow-hidden">
          <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/5 md:bg-gradient-to-r" />
          <div className="absolute left-5 top-5 rounded-2xl border border-white/15 bg-black/50 px-4 py-3 text-center backdrop-blur-md">
            <div className="font-heading text-5xl leading-none text-white">{date.day}</div>
            <div className="mt-1 text-xs font-bold uppercase tracking-[.2em] text-brand">{date.month}</div>
          </div>
        </div>

        <div className="flex flex-col p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[group.status]}`}>
                {statusLabels[group.status]}
              </span>
              <h3 className="mt-4 font-heading text-3xl leading-none tracking-wide text-white md:text-4xl">{displayName(group)}</h3>
              <p className="mt-3 text-sm font-medium capitalize text-white/65">
                {date.full}{group.time ? ` · ${group.time.slice(0, 5)}` : ''}
              </p>
              {group.location ? <p className="mt-1 text-sm text-white/45">{cleanLocation(group.location)}</p> : null}
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-[.16em] text-white/35">Участники</div>
              <div className="mt-1 font-heading text-3xl text-white">{group.totalParticipants}<span className="text-white/30">/{group.totalCapacity}</span></div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {[cleanFormat(group.format), ...divisions, ...levels].filter(Boolean).map((tag) => (
              <span key={tag} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-white/60">{tag}</span>
            ))}
          </div>

          <div className="mt-auto pt-6">
            <div className="mb-2 flex justify-between text-xs">
              <span className={group.status === 'open' ? 'text-emerald-300' : 'text-amber-200'}>
                {group.status === 'open'
                  ? `Свободно ${spots} мест`
                  : group.status === 'awaiting_results'
                    ? 'Итоги проверяются организатором'
                    : group.status === 'in_progress'
                      ? 'Матчи проходят сейчас'
                    : 'Основной состав заполнен'}
              </span>
              {group.totalWaitlist > 0 ? <span className="text-white/45">В ожидании: {group.totalWaitlist}</span> : null}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-brand" style={{ width: `${fill}%` }} /></div>
            <div className="mt-5 flex items-center justify-between gap-4">
              <span className="text-sm text-white/45">
                {group.status === 'full'
                  ? 'Запишем, если освободится место'
                  : group.status === 'awaiting_results'
                    ? 'Скоро появится итоговая таблица'
                    : group.status === 'in_progress'
                      ? 'Регистрация закрыта до окончания матчей'
                      : 'Заявка займёт меньше минуты'}
              </span>
              {group.status === 'awaiting_results' || group.status === 'in_progress' ? (
                <span className="shrink-0 rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-white/70">
                  {group.status === 'in_progress' ? 'Матчи идут' : 'Ожидаем итоги'}
                </span>
              ) : (
                <span className="shrink-0 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-black transition group-hover:bg-brand-light">
                  {group.status === 'full' ? 'Встать в лист ожидания' : 'Записаться'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      {singleHref ? <Link href={singleHref} className="absolute inset-0" aria-label={`Открыть ${displayName(group)}`} /> : null}
    </article>
  );
}
