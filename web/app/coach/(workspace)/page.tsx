import Link from 'next/link';
import CoachAvatar from '@/components/coach/CoachAvatar';
import CoachSetupNotice from '@/components/coach/CoachSetupNotice';
import { getCoachDashboard } from '@/lib/coach/service';
import { listCoachChallengeReminders } from '@/lib/coach/challenge-service';

export default async function CoachDashboardPage() {
  let dashboard;
  let challengeReminders;
  try {
    [dashboard, challengeReminders] = await Promise.all([getCoachDashboard(), listCoachChallengeReminders()]);
  } catch (error) {
    return <CoachSetupNotice detail={error instanceof Error ? error.message : undefined} />;
  }

  const stats = [
    { label: 'Ученики', value: dashboard.athleteCount, tone: 'text-cyan-300' },
    { label: 'Без оценки', value: dashboard.unevaluatedCount, tone: 'text-amber-300' },
    { label: 'Проблемы в работе', value: dashboard.activeIssueCount, tone: 'text-orange-300' },
    { label: 'Критичные', value: dashboard.criticalIssueCount, tone: 'text-red-300' },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">Сегодня в фокусе</p>
          <h1 className="mt-2 font-heading text-4xl leading-none tracking-wide text-white sm:text-5xl">Тренерский обзор</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Кого оценить, где застрял прогресс и какие проблемы повторяются у группы.</p>
        </div>
        <Link href="/coach/athletes" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-orange-500 px-5 text-sm font-black text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-400">Открыть учеников</Link>
      </section>

      <section className="rounded-3xl border border-orange-400/15 bg-orange-500/[.035] p-4 sm:p-6">
        <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.16em] text-orange-300">🎯 Контроль</p><h2 className="mt-1 font-heading text-3xl tracking-wide">Пора повторить Challenge</h2></div><Link href="/coach/challenges" className="min-h-11 py-3 text-xs font-bold text-orange-300">Все тесты →</Link></div>
        {challengeReminders.length ? <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{challengeReminders.slice(0, 6).map((item) => <Link key={`${item.challengeId}-${item.playerId}`} href={`/coach/challenges/${item.challengeId}`} className="flex min-h-20 items-center gap-3 rounded-2xl border border-orange-400/15 bg-black/15 p-3"><CoachAvatar name={item.athleteName} photoUrl={item.athletePhotoUrl} size="sm" /><span className="min-w-0 flex-1"><b className="block truncate text-sm text-white">{item.athleteName}</b><span className="mt-1 block text-xs text-orange-300">{item.challengeTitle}</span><small className="block text-slate-600">{item.issueTitle} · +{item.daysOverdue} дн.</small></span></Link>)}</div> : <p className="mt-5 text-sm text-slate-500">Просроченных контрольных тестов пока нет.</p>}
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Ключевые показатели">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
            <p className={`font-heading text-4xl leading-none sm:text-5xl ${stat.tone}`}>{stat.value}</p>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{stat.label}</p>
          </article>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">Требуют внимания</p>
              <h2 className="mt-1 font-heading text-3xl tracking-wide">Следующий шаг тренера</h2>
            </div>
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-500">{dashboard.attention.length}</span>
          </div>
          {dashboard.attention.length ? (
            <div className="mt-5 space-y-2">
              {dashboard.attention.map((item) => (
                <Link key={item.playerId} href={`/coach/athletes/${item.playerId}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-transparent bg-black/15 p-3 transition hover:border-cyan-400/25 hover:bg-cyan-400/[0.04]">
                  <CoachAvatar name={item.name} photoUrl={item.photoUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-white">{item.name}</span>
                    <span className={`mt-0.5 block text-xs ${item.severity === 'critical' ? 'text-red-300' : 'text-amber-300'}`}>{item.reason}</span>
                  </span>
                  <span aria-hidden="true" className="text-slate-600">→</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">Пока нет учеников, которым требуется внимание.</div>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-300">Повторяющиеся проблемы</p>
          <h2 className="mt-1 font-heading text-3xl tracking-wide">По группе</h2>
          {dashboard.frequentIssues.length ? (
            <ol className="mt-5 space-y-3">
              {dashboard.frequentIssues.map((issue, index) => (
                <li key={issue.title} className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/5 text-xs font-black text-slate-500">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-200">{issue.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">{issue.athleteCount} учен. · приоритет до {issue.maxPriority}/5</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : <p className="mt-5 text-sm leading-6 text-slate-500">Проблемы появятся здесь после первых наблюдений тренера.</p>}
        </section>
      </div>
    </div>
  );
}
