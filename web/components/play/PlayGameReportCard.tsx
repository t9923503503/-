import { buildPlayGameReport } from '@/lib/play-report';

export default function PlayGameReportCard({ payload, names }: { payload: unknown; names: Map<number, string> }) {
  const report = buildPlayGameReport(payload);
  if (!report) return null;
  const listNames = (ids: number[] | null) => ids?.map((id) => names.get(id) || `Игрок #${id}`).join(' + ') || '—';
  return (
    <section className="mt-5 rounded-2xl border border-violet-300/20 bg-gradient-to-br from-violet-300/10 to-cyan-300/5 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-200">Отчёт игры</p>
      <h3 className="mt-1 text-lg font-black text-text-primary">{report.headline}</h3>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-surface/55 p-3"><span className="text-[11px] text-text-secondary">Лучший результат</span><strong className="mt-1 block text-sm text-text-primary">{listNames(report.leaderIds)}</strong></div>
        <div className="rounded-xl bg-surface/55 p-3"><span className="text-[11px] text-text-secondary">Сильная пара</span><strong className="mt-1 block text-sm text-text-primary">{listNames(report.bestPair)}</strong></div>
        <div className="rounded-xl bg-surface/55 p-3"><span className="text-[11px] text-text-secondary">Самый близкий счёт</span><strong className="mt-1 block text-sm text-text-primary">{report.closestMatch?.score || '—'}{report.closestMatch ? ` · разница ${report.closestMatch.margin}` : ''}</strong></div>
      </div>
      <p className="mt-3 text-xs text-text-secondary">Всего разыграно очков: {report.totalPoints}. Отчёт строится автоматически из утверждённого счёта.</p>
    </section>
  );
}

