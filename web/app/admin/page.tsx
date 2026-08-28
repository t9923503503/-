import Link from 'next/link';
import { fetchAuditLog } from '@/lib/admin-audit';
import { getAdminSessionFromCookies, type AdminRole } from '@/lib/admin-auth';
import {
  getArchiveTournaments,
  listPendingRequests,
  listPlayers,
  listTournaments,
  type AdminTournament,
} from '@/lib/admin-queries';
import {
  isGoAdminFormat,
  isKotcAdminFormat,
  isThaiAdminFormat,
  normalizeKotcAdminSettings,
} from '@/lib/admin-legacy-sync';
import { buildSudyamLaunchUrl, getSudyamFormatForTournament, getSudyamFormatLabel } from '@/lib/sudyam-launch';
import {
  inferThaiJudgeModuleFromSettings,
  THAI_JUDGE_MODULE_LEGACY,
  THAI_JUDGE_MODULE_NEXT,
} from '@/lib/thai-judge-config';

export const dynamic = 'force-dynamic';

type DashboardActionCard = {
  href: string;
  title: string;
  description: string;
  primary: string;
  secondary: string;
};

type AttentionItem = {
  href: string;
  title: string;
  count: number;
  detail: string;
};

type UpcomingTournamentItem = {
  id: string;
  name: string;
  location: string;
  date: string;
  status: string;
  statusLabel: string;
  formatLabel: string;
  href: string;
  actionLabel: string;
};

function formatDate(value: string) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatAuditDate(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getTournamentTimestamp(tournament: Pick<AdminTournament, 'date' | 'time'>): number {
  const time = String(tournament.time ?? '').trim() || '00:00';
  const timestamp = new Date(`${String(tournament.date ?? '').trim()}T${time}:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function getStatusLabel(status: string): string {
  if (status === 'draft') return 'Черновик';
  if (status === 'full') return 'Набран';
  if (status === 'finished') return 'Завершён';
  if (status === 'cancelled') return 'Отменён';
  return 'Открыт';
}

function formatTournamentStatus(status: string): string {
  return getStatusLabel(status);
}

function getPrimaryLaunchTarget(
  row: Pick<AdminTournament, 'id' | 'format' | 'settings' | 'goEngineVersion'>,
): { href: string; label: string } | null {
  if (!row.id) return null;
  if (isThaiAdminFormat(row.format)) {
    const judgeModule = inferThaiJudgeModuleFromSettings(row.settings, THAI_JUDGE_MODULE_LEGACY);
    if (judgeModule === THAI_JUDGE_MODULE_NEXT) {
      return { href: `/admin/tournaments/${encodeURIComponent(row.id)}/thai-live`, label: 'Thai Control' };
    }
  }
  if (isKotcAdminFormat(row.format)) {
    const settings = normalizeKotcAdminSettings(row.settings);
    if (settings.kotcJudgeModule === 'next') {
      return { href: `/sudyam/kotcn/${encodeURIComponent(row.id)}`, label: 'KOTC Control' };
    }
  }
  if (isGoAdminFormat(row.format)) {
    if (row.goEngineVersion === 2) {
      return {
        href: `/admin/tournaments/${encodeURIComponent(row.id)}/engine-v2`,
        label: 'Tournament Engine V2',
      };
    }
    return { href: `/admin/tournaments/${encodeURIComponent(row.id)}/go-live`, label: 'GO Control' };
  }
  const format = getSudyamFormatForTournament(row.format);
  if (!format) return null;
  const href = buildSudyamLaunchUrl({ tournamentId: row.id, format });
  return href ? { href, label: 'Sudyam' } : null;
}

function getAuditEntityLabel(entityType: string): string {
  const labels: Record<string, string> = {
    tournament: 'Турнир', tournaments: 'Турнир', player: 'Игрок', players: 'Игрок',
    request: 'Заявка', requests: 'Заявка', result: 'Результаты', results: 'Результаты',
    roster: 'Ростер', report: 'Отчёт', reports: 'Отчёт', override: 'Переопределение', overrides: 'Переопределение',
  };
  const normalized = String(entityType ?? '').trim().toLowerCase();
  return labels[normalized] ?? (String(entityType ?? '').trim() || 'Сущность');
}

function getAuditActionLabel(action: string, entityType: string): string {
  const normalized = String(action ?? '').trim().toLowerCase();
  const entity = getAuditEntityLabel(entityType);
  if (normalized.includes('create') || normalized.includes('add')) return `Создание: ${entity}`;
  if (normalized.includes('update') || normalized.includes('apply') || normalized.includes('merge')) return `Изменение: ${entity}`;
  if (normalized.includes('delete') || normalized.includes('remove')) return `Удаление: ${entity}`;
  if (normalized.includes('approve') || normalized.includes('confirm')) return `Подтверждение: ${entity}`;
  if (normalized.includes('reject')) return `Отклонение: ${entity}`;
  if (normalized.includes('reset')) return `Сброс: ${entity}`;
  return `${entity} · ${String(action ?? '').trim() || 'действие'}`;
}

function formatAuditEntity(entityType: string, entityId: string): string {
  const label = getAuditEntityLabel(entityType);
  const id = String(entityId ?? '').trim();
  if (!id) return label;
  return `${label} · ${id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id}`;
}

function isOperatorRole(role: AdminRole): boolean {
  return role === 'admin' || role === 'operator';
}

export default async function AdminDashboardPage() {
  const actor = await getAdminSessionFromCookies();
  const role = actor?.role ?? 'viewer';
  const operatorView = isOperatorRole(role);

  const [tournaments, players, audit, pendingRequests, archive] = await Promise.all([
    listTournaments(''),
    listPlayers(''),
    fetchAuditLog(30),
    listPendingRequests(),
    getArchiveTournaments(),
  ]);

  const activePlayers = players.filter((x) => x.status === 'active').length;
  const women = players.filter((x) => x.gender === 'W').length;
  const men = players.filter((x) => x.gender === 'M').length;
  const mixReady = players.filter((x) => x.mixReady).length;
  const tournamentCounts = {
    draft: tournaments.filter((x) => x.status === 'draft').length,
    open: tournaments.filter((x) => x.status === 'open').length,
    full: tournaments.filter((x) => x.status === 'full').length,
    finished: tournaments.filter((x) => x.status === 'finished').length,
  };
  const activeTournaments = tournaments.filter((x) => ['draft', 'open', 'full'].includes(x.status));
  const liveReadyTournaments = activeTournaments.filter((x) => getPrimaryLaunchTarget(x));
  const tournamentsWithoutLiveControl = activeTournaments.filter((x) => !getPrimaryLaunchTarget(x));
  const archiveWithResults = new Set(
    archive.filter((x) => Array.isArray(x.results) && x.results.length > 0).map((x) => x.id),
  );
  const tournamentsMissingArchiveResults = tournaments.filter(
    (x) => x.status === 'finished' && !archiveWithResults.has(x.id),
  );
  const upcoming: UpcomingTournamentItem[] = tournaments
    .filter((x) => x.status === 'open' || x.status === 'full')
    .sort((a, b) => getTournamentTimestamp(a) - getTournamentTimestamp(b))
    .slice(0, 5)
    .map((tournament) => {
      const launchTarget = getPrimaryLaunchTarget(tournament);
      const format = getSudyamFormatForTournament(tournament.format);
      return {
        id: tournament.id,
        name: tournament.name,
        location: tournament.location,
        date: tournament.date,
        status: tournament.status,
        statusLabel: formatTournamentStatus(tournament.status),
        formatLabel: format ? getSudyamFormatLabel(format) : tournament.format || 'Формат не указан',
        href: launchTarget?.href ?? '/admin/tournaments',
        actionLabel: launchTarget ? `Открыть · ${launchTarget.label}` : 'Открыть реестр',
      };
    });
  const recentAudit = audit.filter((x) => Date.now() - new Date(x.createdAt).getTime() <= 24 * 60 * 60 * 1000).length;

  const actionCards: DashboardActionCard[] = [
    {
      href: '/admin/tournaments',
      title: 'Турниры',
      description: 'Реестр, статусы и переходы в live-control.',
      primary: `${tournamentCounts.draft} черновиков · ${tournamentCounts.open} открытых`,
      secondary: `Live-форматы: ${liveReadyTournaments.length}. Ближайшие 3: ${upcoming.slice(0, 3).map((x) => x.name).join(' · ') || 'нет'}`,
    },
    {
      href: '/admin/requests',
      title: 'Заявки',
      description: 'Очередь заявок и ручная обработка подтверждений.',
      primary: `${pendingRequests.length} ожидают`,
      secondary: 'Проверьте составы до блокировки жеребьёвки.',
    },
    {
      href: '/admin/archive',
      title: 'Архив',
      description: 'Финализация результатов и контроль рейтинга.',
      primary: `${tournamentsMissingArchiveResults.length} без результатов`,
      secondary: `Опубликовано турниров: ${archive.length}.`,
    },
    {
      href: '/admin/roster',
      title: 'Ростер',
      description: 'Участники, лист ожидания и игровые слоты.',
      primary: `${activeTournaments.length} активных турниров`,
      secondary: `Без live-control: ${tournamentsWithoutLiveControl.length}.`,
    },
    {
      href: '/admin/reports',
      title: 'Отчёты',
      description: 'Контрольные срезы и операционные отклонения.',
      primary: `${recentAudit} действий за 24 часа`,
      secondary: `Активных игроков: ${activePlayers}.`,
    },
  ];

  const attentionItems: AttentionItem[] = [
    {
      href: '/admin/requests',
      title: 'Pending заявки',
      count: pendingRequests.length,
      detail: 'Проверьте заявки и проведите подтверждённых игроков в ростер.',
    },
    {
      href: '/admin/archive',
      title: 'Архив без результатов',
      count: tournamentsMissingArchiveResults.length,
      detail: tournamentsMissingArchiveResults.slice(0, 3).map((x) => x.name).join(' · ') || 'Хвостов по архиву нет.',
    },
    {
      href: '/admin/tournaments',
      title: 'Нет live/control маршрута',
      count: tournamentsWithoutLiveControl.length,
      detail: tournamentsWithoutLiveControl.slice(0, 3).map((x) => x.name).join(' · ') || 'Все активные турниры готовы.',
    },
  ];

  return (
    <div className="space-y-4 md:space-y-5" data-admin-dashboard>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">Краткая сводка по клубу</p>
        <Link
          href="/admin/tournaments/new"
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-3.5 py-2 text-sm font-black text-surface transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <span aria-hidden="true" className="text-lg leading-none">+</span>
          Новый турнир
        </Link>
      </div>

      {operatorView ? (
        <section className="rounded-2xl border border-white/15 bg-gradient-to-br from-white/10 to-orange-500/10 p-3.5 md:p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-brand">Что делать сейчас</p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5" data-admin-action-hub>
            {actionCards.map((card) => (
              <Link key={card.href} href={card.href} className="rounded-xl border border-white/10 bg-black/10 p-3 transition hover:border-brand/40 hover:bg-orange-500/10">
                <h2 className="font-black">{card.title}</h2>
                <p className="mt-1 text-xs text-text-secondary">{card.description}</p>
                <p className="mt-3 text-sm font-bold">{card.primary}</p>
                <p className="mt-1 text-[11px] text-text-secondary">{card.secondary}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-text-secondary" data-admin-viewer-overview>
          Роль `viewer` получает обзор и очереди внимания. Операторские действия скрыты.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 md:gap-4 xl:grid-cols-4">
        <DashboardCard label="Активные игроки" value={activePlayers} hint={`${players.length} всего`} icon="players" />
        <DashboardCard label="Женщины / мужчины" value={`${women} / ${men}`} hint={`${mixReady} готовы к миксту`} icon="gender" />
        <DashboardCard label="Ближайшие турниры" value={upcoming.length} hint={`${tournaments.length} всего`} icon="calendar" />
        <DashboardCard label="События за 24 часа" value={recentAudit} hint={`${audit.length} записей в журнале`} icon="audit" />
      </div>

      <section className="rounded-2xl border border-white/15 bg-white/5 p-3.5 md:p-4" data-admin-attention-queues>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-black leading-tight md:font-heading md:text-3xl md:font-normal md:leading-none">Очереди внимания</h2>
          <Link href="/admin/tournaments" className="shrink-0 text-xs font-bold text-brand hover:underline md:text-sm">Открыть реестр</Link>
        </div>
        <div className="mt-3 grid gap-2.5 md:grid-cols-3">
          {attentionItems.map((item) => (
            <Link key={item.title} href={item.href} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-brand/40">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold">{item.title}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-sm font-black">{item.count}</span>
              </div>
              <p className="mt-2 text-xs text-text-secondary">{item.detail}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-2xl border border-white/15 bg-white/5 p-3.5 md:p-4" aria-labelledby="upcoming-tournaments-heading" data-admin-upcoming-tournaments>
          <div className="flex items-center justify-between gap-3">
            <h2 id="upcoming-tournaments-heading" className="text-xl font-black leading-tight md:font-heading md:text-3xl md:font-normal md:leading-none">Ближайшие турниры</h2>
            <Link href="/admin/tournaments" className="shrink-0 text-xs font-bold text-brand hover:underline md:text-sm">Все турниры</Link>
          </div>
          <div className="mt-3 space-y-2 md:mt-4">
            {upcoming.map((tournament) => (
              <Link
                key={tournament.id}
                href={tournament.href}
                className="group flex min-h-[3.75rem] items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 transition hover:border-brand/40 hover:bg-orange-500/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-text-primary md:text-base">{tournament.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-text-secondary md:text-xs">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tournament.status === 'full' ? 'bg-amber-400' : 'bg-emerald-400'}`} aria-hidden="true" />
                    <span className="truncate">{tournament.location || 'Локация не указана'} · {tournament.statusLabel} · {tournament.formatLabel}</span>
                  </span>
                </span>
                <span className="min-w-[4.5rem] shrink-0 rounded-lg border border-brand/15 bg-brand/10 px-2.5 py-2 text-center text-xs font-bold text-brand md:text-sm">
                    {formatDate(tournament.date)}
                </span>
              </Link>
            ))}
            {!upcoming.length ? <p className="rounded-xl border border-dashed border-white/15 px-3 py-5 text-center text-sm text-text-secondary">Нет ближайших открытых турниров</p> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-white/15 bg-white/5 p-3.5 md:p-4" aria-labelledby="player-stats-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="player-stats-heading" className="text-xl font-black leading-tight md:font-heading md:text-3xl md:font-normal md:leading-none">Статистика игроков</h2>
            <Link href="/admin/players" className="shrink-0 text-xs font-bold text-brand hover:underline md:text-sm">Все игроки</Link>
          </div>
          <div className="mt-4 space-y-3">
            <MiniStat label="Женщины" value={women} color="bg-pink-500" total={players.length} />
            <MiniStat label="Мужчины" value={men} color="bg-cyan-500" total={players.length} />
            <MiniStat label="Микст" value={mixReady} color="bg-orange-500" total={players.length} />
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-white/15 bg-white/5 p-3.5 md:p-4" aria-labelledby="recent-actions-heading" data-admin-recent-actions>
        <div className="flex items-center justify-between gap-3">
          <h2 id="recent-actions-heading" className="text-xl font-black leading-tight md:font-heading md:text-3xl md:font-normal md:leading-none">Последние действия</h2>
          <Link href="/admin/audit" className="shrink-0 text-xs font-bold text-brand hover:underline md:text-sm">Весь журнал</Link>
        </div>

        <div className="mt-3 space-y-2 md:hidden">
          {audit.slice(0, 5).map((row) => (
            <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-bold text-text-primary">{getAuditActionLabel(row.action, row.entityType)}</p>
                <time className="shrink-0 text-[10px] text-text-secondary" dateTime={row.createdAt}>{formatAuditDate(row.createdAt)}</time>
              </div>
              <p className="mt-1 truncate text-[11px] text-text-secondary">
                {row.actorRole} · {formatAuditEntity(row.entityType, row.entityId)}{row.reason ? ` · ${row.reason}` : ''}
              </p>
            </div>
          ))}
          {audit.length === 0 ? <p className="py-4 text-center text-sm text-text-secondary">Нет данных</p> : null}
        </div>

        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-text-secondary">
                <th className="py-2 pr-3">Время</th>
                <th className="py-2 pr-3">Роль</th>
                <th className="py-2 pr-3">Действие</th>
                <th className="py-2 pr-3">Объект</th>
                <th className="py-2 pr-3">Причина</th>
              </tr>
            </thead>
            <tbody>
              {audit.slice(0, 10).map((row) => (
                <tr key={row.id} className="border-b border-white/5">
                  <td className="py-2 pr-3">{new Date(row.createdAt).toLocaleString('ru-RU')}</td>
                  <td className="py-2 pr-3">{row.actorRole}</td>
                  <td className="py-2 pr-3">{getAuditActionLabel(row.action, row.entityType)}</td>
                  <td className="py-2 pr-3">{formatAuditEntity(row.entityType, row.entityId)}</td>
                  <td className="py-2 pr-3">{row.reason || '-'}</td>
                </tr>
              ))}
              {audit.length === 0 ? (
                <tr>
                  <td className="py-3 text-text-secondary" colSpan={5}>Нет данных</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type DashboardIconName = 'players' | 'gender' | 'calendar' | 'audit';

function DashboardIcon({ name }: { name: DashboardIconName }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === 'players' ? (
        <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.35-3.7 2.2-5.5 5.5-5.5s5.15 1.8 5.5 5.5M16 5.5a3 3 0 0 1 0 5.8M16.5 14c2.4.45 3.75 2.1 4 5" /></>
      ) : null}
      {name === 'gender' ? (
        <><circle cx="8" cy="9" r="3.25" /><circle cx="16" cy="9" r="3.25" /><path d="M2.5 20c.25-3.8 2.1-5.7 5.5-5.7s5.25 1.9 5.5 5.7M10.5 20c.25-3.8 2.1-5.7 5.5-5.7s5.25 1.9 5.5 5.7" /></>
      ) : null}
      {name === 'calendar' ? (
        <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 9.5h17M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" /></>
      ) : null}
      {name === 'audit' ? (
        <><path d="M7 3.5h10M8 2.5v3M16 2.5v3M6 4.5h12a2 2 0 0 1 2 2v14H4v-14a2 2 0 0 1 2-2Z" /><path d="m8 11 1.5 1.5L12 10M14 11h3M8 16h9" /></>
      ) : null}
    </svg>
  );
}

function DashboardCard({ label, value, hint, icon }: { label: string; value: string | number; hint: string; icon: DashboardIconName }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/15 bg-gradient-to-br from-white/10 to-orange-500/10 p-3 md:p-4" aria-label={`${label}: ${value}. ${hint}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-h-8 text-[11px] font-semibold leading-4 text-text-secondary md:min-h-0 md:text-sm">{label}</p>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-brand/15 bg-brand/10 text-brand">
          <DashboardIcon name={icon} />
        </span>
      </div>
      <p className="mt-2 truncate font-heading text-[2.25rem] leading-none md:text-5xl">{value}</p>
      <p className="mt-1 truncate text-[10px] text-text-secondary md:mt-2 md:text-xs">{hint}</p>
    </div>
  );
}

function MiniStat({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="font-bold">{value} <span className="ml-1 text-[11px] font-normal text-text-secondary">{percent}%</span></span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-white/10">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
