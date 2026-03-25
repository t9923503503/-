import Link from 'next/link';
import type { Tournament } from '@/lib/types';

/** A group of sub-tournaments that form one event (same date + format) */
export interface TournamentGroup {
  key: string;
  baseName: string;        // e.g. "Round Robin" or "Король площадки"
  date: string;
  time: string;
  location: string;
  format: string;
  status: Tournament['status'];
  photoUrl: string;
  prize: string;
  totalCapacity: number;
  totalParticipants: number;
  /** Categories within this event, e.g. HARD M, HARD W, MEDIUM M ... */
  categories: {
    id: string;
    level: string;
    division: string;
    participantCount: number;
    capacity: number;
    name: string;
  }[];
}

const levelOrder: Record<string, number> = { hard: 0, advance: 0, medium: 1, easy: 2 };
const levelLabels: Record<string, string> = { hard: 'HARD', advance: 'ADVANCE', medium: 'MEDIUM', easy: 'LITE' };
const levelColors: Record<string, string> = {
  hard: 'bg-red-500/20 text-red-300 border-red-500/40',
  advance: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  easy: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
};

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

/** Group an array of tournaments into event groups */
export function groupTournaments(tournaments: Tournament[]): TournamentGroup[] {
  const map = new Map<string, Tournament[]>();

  for (const t of tournaments) {
    // Group key: date + format. No date → individual
    const key = t.date && t.format ? `${t.date}||${t.format}` : `solo||${t.id}`;
    const arr = map.get(key) ?? [];
    arr.push(t);
    map.set(key, arr);
  }

  const groups: TournamentGroup[] = [];

  for (const [key, items] of map) {
    // Sort categories: by level order, then division
    items.sort((a, b) => {
      const la = levelOrder[a.level?.toLowerCase()] ?? 9;
      const lb = levelOrder[b.level?.toLowerCase()] ?? 9;
      if (la !== lb) return la - lb;
      return (a.division ?? '').localeCompare(b.division ?? '');
    });

    const first = items[0];
    // Extract base name: "Round Robin · HARD" → "Round Robin"
    let baseName = first.format || first.name;
    if (items.length === 1) baseName = first.name;

    // Find photo from any sub-tournament
    const photo = items.find(t => t.photoUrl)?.photoUrl ?? '';
    const prize = items.find(t => t.prize)?.prize ?? '';

    // Determine overall status: if any open → open, if any full → full, else finished
    let status: Tournament['status'] = 'finished';
    if (items.some(t => t.status === 'open')) status = 'open';
    else if (items.some(t => t.status === 'full')) status = 'full';

    groups.push({
      key,
      baseName,
      date: first.date,
      time: first.time,
      location: first.location,
      format: first.format,
      status,
      photoUrl: photo,
      prize,
      totalCapacity: items.reduce((s, t) => s + t.capacity, 0),
      totalParticipants: items.reduce((s, t) => s + t.participantCount, 0),
      categories: items.map(t => ({
        id: t.id,
        level: t.level?.toLowerCase() ?? '',
        division: t.division ?? '',
        participantCount: t.participantCount,
        capacity: t.capacity,
        name: t.name,
      })),
    });
  }

  return groups;
}

export default function EventCard({ group }: { group: TournamentGroup }) {
  const isOpen = group.status === 'open';
  const isFull = group.status === 'full';
  const isFinished = group.status === 'finished';
  const fmt = formatDescriptions[group.format] ?? null;

  const fillPercent = group.totalCapacity > 0
    ? Math.min(100, Math.round((group.totalParticipants / group.totalCapacity) * 100))
    : 0;

  // Unique levels in this event
  const uniqueLevels = [...new Set(group.categories.map(c => c.level))];
  // Unique divisions
  const uniqueDivisions = [...new Set(group.categories.map(c => c.division).filter(Boolean))];

  // For single-category group, link directly
  const singleLink = group.categories.length === 1 ? `/calendar/${group.categories[0].id}` : null;

  const cardContent = (
    <article className={`
      relative rounded-2xl border overflow-hidden transition-all duration-300
      ${isOpen
        ? 'border-brand/40 bg-gradient-to-br from-brand/5 to-transparent hover:border-brand/70 hover:shadow-[0_0_30px_rgba(255,90,0,0.15)]'
        : isFull
          ? 'border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent hover:border-amber-500/50'
          : 'border-white/10 bg-surface-light/30 hover:border-white/20'}
    `}>
      {/* Poster */}
      {group.photoUrl && (
        <div className="relative w-full aspect-[2.2/1] overflow-hidden">
          <img
            src={group.photoUrl}
            alt={group.baseName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/50 to-transparent" />
          <span className={`absolute top-4 right-4 px-3 py-1.5 rounded-full text-xs font-body font-semibold border backdrop-blur-sm ${statusStyles[group.status]}`}>
            {statusLabels[group.status]}
          </span>
        </div>
      )}

      <div className="p-6">
        {/* Status + level badges (no poster) */}
        {!group.photoUrl && (
          <div className="flex items-center justify-between mb-4">
            <span className={`px-3 py-1.5 rounded-full text-xs font-body font-semibold border ${statusStyles[group.status]}`}>
              {statusLabels[group.status]}
            </span>
            <div className="flex gap-2">
              {uniqueLevels.map(lvl => (
                <span key={lvl} className={`px-2.5 py-1 rounded-lg text-xs font-heading tracking-wider border ${levelColors[lvl] ?? 'bg-white/5 text-text-primary/60 border-white/10'}`}>
                  {levelLabels[lvl] ?? lvl}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Title */}
        <h3 className="font-heading text-3xl md:text-4xl text-text-primary leading-tight tracking-wide group-hover:text-brand transition-colors">
          {group.baseName}
        </h3>

        {/* Date / Time / Location */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-body">
          {group.date && (
            <span className="inline-flex items-center gap-1.5 text-brand font-semibold">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatDate(group.date)}
            </span>
          )}
          {group.time && (
            <span className="inline-flex items-center gap-1.5 text-text-primary/80">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
              </svg>
              {group.time.slice(0, 5)}
            </span>
          )}
          {group.location && (
            <span className="inline-flex items-center gap-1.5 text-text-primary/80">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {group.location}
            </span>
          )}
        </div>

        {/* Divisions */}
        {uniqueDivisions.length > 0 && (
          <div className="mt-3 flex gap-2">
            {uniqueDivisions.map(d => (
              <span key={d} className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-body text-text-primary/80">
                {d}
              </span>
            ))}
            {group.format && (
              <span className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-body text-text-primary/80">
                {group.format}
              </span>
            )}
          </div>
        )}

        {/* Format description */}
        {fmt && (isOpen || isFull) && (
          <div className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-brand font-body font-semibold text-sm italic">{fmt.tagline}</p>
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

        {/* Categories grid */}
        {group.categories.length > 1 && (
          <div className="mt-4">
            <p className="text-xs font-body text-text-primary/50 uppercase tracking-widest mb-2">
              Категории
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {group.categories.map(cat => {
                const lvlLabel = levelLabels[cat.level] ?? cat.level;
                const lvlColor = levelColors[cat.level] ?? 'bg-white/5 text-text-primary/60 border-white/10';
                return (
                  <Link
                    key={cat.id}
                    href={`/calendar/${cat.id}`}
                    className={`flex flex-col items-center p-3 rounded-xl border transition-colors hover:bg-white/5 ${lvlColor}`}
                  >
                    <span className="font-heading text-sm tracking-wider">{lvlLabel}</span>
                    {cat.division && (
                      <span className="text-[10px] font-body opacity-70 mt-0.5">
                        {cat.division === 'Мужской' ? '♂ Муж' : cat.division === 'Женский' ? '♀ Жен' : cat.division}
                      </span>
                    )}
                    <span className="text-[10px] font-body opacity-50 mt-1">
                      {cat.participantCount}/{cat.capacity}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Prize */}
        {group.prize && (
          <div className="mt-3 inline-flex items-center gap-2 text-sm font-body text-amber-300">
            <span>🏆</span><span>{group.prize}</span>
          </div>
        )}

        {/* Total capacity bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs font-body text-text-primary/60 mb-1.5">
            <span>
              Всего участников: <span className="text-text-primary/90 font-semibold">{group.totalParticipants}</span>/{group.totalCapacity}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                fillPercent >= 90 ? 'bg-red-500' : fillPercent >= 70 ? 'bg-amber-500' : 'bg-brand'
              }`}
              style={{ width: `${fillPercent}%` }}
            />
          </div>
        </div>

        {/* CTA */}
        {isOpen && (
          <div className="mt-5">
            <span className="inline-flex items-center justify-center w-full px-6 py-3 rounded-xl bg-brand text-surface font-body font-semibold text-sm group-hover:bg-brand-light transition-colors">
              Записаться на турнир
            </span>
          </div>
        )}
        {isFinished && group.categories.length <= 1 && (
          <div className="mt-5">
            <span className="inline-flex items-center justify-center w-full px-6 py-3 rounded-xl border border-white/15 text-text-primary/80 font-body text-sm group-hover:border-brand/40 group-hover:text-brand transition-colors">
              Результаты турнира →
            </span>
          </div>
        )}
      </div>
    </article>
  );

  if (singleLink) {
    return <Link href={singleLink} className="block group">{cardContent}</Link>;
  }

  // For multi-category, the card itself is not a link (categories inside are)
  return <div className="group">{cardContent}</div>;
}
