import Link from 'next/link';
import type { Tournament } from '@/lib/types';

function StatusBadge({ status }: { status: Tournament['status'] }) {
  const map = {
    open: { label: 'Открыт', cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
    full: { label: 'Заполнен', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    finished: { label: 'Завершён', cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
    cancelled: { label: 'Отменён', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
  };
  const s = map[status] ?? map.open;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
  );
}

function LevelBadge({ level }: { level: string }) {
  const cls = level === 'hard' ? 'text-red-400' : level === 'easy' ? 'text-green-400' : 'text-yellow-400';
  return <span className={`text-[10px] uppercase font-semibold ${cls}`}>{level}</span>;
}

function TournamentCard({ t }: { t: Tournament }) {
  const pct = t.capacity > 0 ? Math.min((t.participantCount / t.capacity) * 100, 100) : 0;
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500';
  const dateStr = t.date ? new Date(t.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '';

  return (
    <Link href={`/calendar/${t.id}`} className="glass-panel p-4 block hover:border-brand/30 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <LevelBadge level={t.level} />
          <span className="text-[10px] text-text-secondary">{t.division}</span>
        </div>
        <StatusBadge status={t.status} />
      </div>

      <div className="text-[10px] text-text-secondary mb-0.5">{t.format}</div>
      <div className="font-heading text-text-primary text-sm mb-2">{t.name}</div>

      <div className="flex flex-col gap-1 text-[11px] text-text-secondary mb-3">
        {dateStr && <span>{dateStr}{t.time ? `, ${t.time}` : ''}</span>}
        {t.location && <span className="truncate">{t.location}</span>}
      </div>

      <div className="mb-1 flex justify-between text-[10px]">
        <span className="text-text-secondary">Регистрация</span>
        <span className="text-text-primary font-semibold">{t.participantCount}/{t.capacity}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}

export default function UpcomingTournaments({ tournaments }: { tournaments: Tournament[] }) {
  if (tournaments.length === 0) return null;

  return (
    <section className="py-10">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-heading text-2xl text-text-primary uppercase">Ближайшие турниры</h2>
            <p className="text-text-secondary text-sm mt-1">{tournaments.length} событий</p>
          </div>
          <Link href="/calendar" className="font-body text-sm text-brand hover:text-brand/80 transition-colors">
            Все турниры →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map(t => (
            <TournamentCard key={t.id} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}
