import type { Metadata } from 'next';
import { getArchiveTournaments } from '@/lib/admin-queries';
import type { ArchiveTournament } from '@/lib/admin-queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Архив турниров | Лютые Пляжники',
  description: 'Результаты прошедших турниров по пляжному волейболу в Луганске.',
  openGraph: {
    title: 'Архив турниров | Лютые Пляжники',
    description: 'Результаты прошедших турниров по пляжному волейболу.',
    type: 'website',
    locale: 'ru_RU',
  },
};

const MEDALS = ['🥇', '🥈', '🥉'];

function formatDate(dateStr: string) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function TournamentCard({ t }: { t: ArchiveTournament }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      {/* Header */}
      <div className="p-5 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl leading-tight">{t.name}</h2>
            <p className="text-sm text-text-secondary mt-1">📅 {formatDate(t.date)}</p>
          </div>
          {t.photoUrl && (
            <a
              href={t.photoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 text-xs font-semibold hover:bg-yellow-500/20 transition-colors"
            >
              📸 Фото
            </a>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-xs px-2.5 py-1 rounded-full border border-white/15 text-text-secondary">
            {t.format || 'King of the Court'}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full border border-white/15 text-text-secondary">
            {t.division || '—'}
          </span>
          {t.results.length > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full border border-brand/30 text-brand">
              👥 {t.results.length} участников
            </span>
          )}
        </div>
      </div>

      {/* Results table */}
      {t.results.length > 0 && (
        <div className="border-t border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-secondary text-xs">
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Игрок</th>
                <th className="px-4 py-2 text-center font-medium">Пол</th>
                <th className="px-4 py-2 text-right font-medium">Очки</th>
              </tr>
            </thead>
            <tbody>
              {t.results.map((r, i) => (
                <tr
                  key={i}
                  className={`border-t border-white/5 ${i === 0 ? 'bg-yellow-500/5' : ''}`}
                >
                  <td className="px-4 py-2.5 text-left font-mono text-text-secondary">
                    {MEDALS[i] ?? r.placement}
                  </td>
                  <td className="px-4 py-2.5 font-medium">{r.playerName}</td>
                  <td className="px-4 py-2.5 text-center text-text-secondary text-xs">
                    {r.gender === 'W' ? 'Ж' : 'М'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-brand">
                    {r.points > 0 ? r.points : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {t.results.length === 0 && (
        <div className="border-t border-white/10 px-5 py-4 text-sm text-text-secondary">
          Результаты не внесены
        </div>
      )}
    </div>
  );
}

export default async function ArchivePage() {
  const tournaments = await getArchiveTournaments().catch(() => [] as ArchiveTournament[]);

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="font-heading text-4xl md:text-5xl text-text-primary mb-2 uppercase tracking-wide">
        Архив турниров
      </h1>
      <p className="text-text-secondary mb-8">
        Результаты завершённых турниров · {tournaments.length > 0 ? `${tournaments.length} турниров` : 'пока пусто'}
      </p>

      {tournaments.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
          <div className="text-5xl mb-4">🏆</div>
          <p className="text-text-secondary">Завершённые турниры появятся здесь</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {tournaments.map((t) => (
            <TournamentCard key={t.id} t={t} />
          ))}
        </div>
      )}
    </main>
  );
}
