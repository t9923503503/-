import Link from 'next/link';
import { fetchAuditLog, type AuditEntry } from '@/lib/admin-audit';
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
  eyebrow: string;
  description: string;
  primary: string;
  secondary: string;
  accent: 'orange' | 'cyan' | 'emerald' | 'violet' | 'slate';
};

type AttentionItem = {
  href: string;
  title: string;
  count: number;
  description: string;
  detail: string;
};

type UpcomingTournamentItem = {
  id: string;
  name: string;
  location: string;
  schedule: string;
  statusLabel: string;
  formatLabel: string;
  href: string;
  actionLabel: string;
};

function getTournamentTimestamp(tournament: Pick<AdminTournament, 'date' | 'time'>): number {
  const date = String(tournament.date ?? '').trim();
  if (!date) return Number.POSITIVE_INFINITY;
  const time = String(tournament.time ?? '').trim() || '00:00';
  const iso = `${date}T${time.length === 5 ? `${time}:00` : time}`;
  const timestamp = new Date(iso).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function formatSchedule(date: string, time: string): string {
  const normalizedDate = String(date ?? '').trim();
  if (!normalizedDate) return 'Дата не указана';
  const normalizedTime = String(time ?? '').trim();
  const base = new Date(`${normalizedDate}T${normalizedTime || '00:00'}:00`);
  const dateLabel = base.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
  });
  return normalizedTime ? `${dateLabel}, ${normalizedTime}` : dateLabel;
}

function getStatusLabel(status: string): string {
  switch (String(status ?? '').trim().toLowerCase()) {
    case 'draft':
      return 'Черновик';
    case 'open':
      return 'Открыт';
    case 'full':
      return 'Набран';
    case 'finished':
      return 'Завершён';
    case 'cancelled':
      return 'Отменён';
    default:
      return String(status ?? '').trim() || 'Без статуса';
  }
}

function buildKotcNextControlUrl(tournamentId: string): string {
  return `/sudyam/kotcn/${encodeURIComponent(tournamentId)}`;
}

function buildGoControlUrl(tournamentId: string): string {
  return `/admin/tournaments/${encodeURIComponent(tournamentId)}/go-live`;
}

function getPrimaryLaunchTarget(row: Pick<AdminTournament, 'id' | 'format' | 'settings'>): { href: string; label: string } | null {
  if (!row.id) return null;

  if (isThaiAdminFormat(row.format)) {
    const thaiJudgeModule = inferThaiJudgeModuleFromSettings(row.settings, THAI_JUDGE_MODULE_LEGACY);
    if (thaiJudgeModule === THAI_JUDGE_MODULE_NEXT) {
      return {
        href: `/admin/tournaments/${encodeURIComponent(row.id)}/thai-live`,
        label: 'Thai Control',
      };
    }
  }

  if (isKotcAdminFormat(row.format)) {
    const normalized = normalizeKotcAdminSettings(row.settings);
    if (normalized.kotcJudgeModule === 'next') {
      return {
        href: buildKotcNextControlUrl(row.id),
        label: 'KOTC Control',
      };
    }
  }

  if (isGoAdminFormat(row.format)) {
    return {
      href: buildGoControlUrl(row.id),
      label: 'GO Control',
    };
  }

  const sudyamFormat = getSudyamFormatForTournament(row.format);
  if (!sudyamFormat) return null;
  const href = buildSudyamLaunchUrl({
    tournamentId: row.id,
    format: sudyamFormat,
  });
  if (!href) return null;
  return {
    href,
    label: 'Sudyam',
  };
}

function getAuditActionLabel(action: string, entityType: string): string {
  const normalized = String(action ?? '').trim().toLowerCase();
  const entityLabel = getAuditEntityLabel(entityType);

  if (normalized.includes('create') || normalized.includes('add')) return `Создание: ${entityLabel}`;
  if (normalized.includes('update') || normalized.includes('apply') || normalized.includes('merge')) return `Изменение: ${entityLabel}`;
  if (normalized.includes('delete') || normalized.includes('remove')) return `Удаление: ${entityLabel}`;
  if (normalized.includes('approve') || normalized.includes('confirm')) return `Подтверждение: ${entityLabel}`;
  if (normalized.includes('reject')) return `Отклонение: ${entityLabel}`;
  if (normalized.includes('reset')) return `Сброс: ${entityLabel}`;
  if (normalized.includes('export')) return `Экспорт: ${entityLabel}`;
  if (normalized.includes('sync')) return `Синхронизация: ${entityLabel}`;

  return `${entityLabel} · ${String(action ?? '').trim() || 'действие'}`;
}

function getAuditEntityLabel(entityType: string): string {
  switch (String(entityType ?? '').trim().toLowerCase()) {
    case 'tournament':
    case 'tournaments':
      return 'Турнир';
    case 'player':
    case 'players':
      return 'Игрок';
    case 'request':
    case 'requests':
      return 'Заявка';
    case 'result':
    case 'results':
      return 'Результаты';
    case 'roster':
      return 'Ростер';
    case 'report':
    case 'reports':
      return 'Отчёт';
    case 'override':
    case 'overrides':
      return 'Override';
    case 'filter_preset':
      return 'Пресет';
    default:
      return String(entityType ?? '').trim() || 'Сущность';
  }
}

function formatAuditEntity(entityType: string, entityId: string): string {
  const label = getAuditEntityLabel(entityType);
  const normalizedId = String(entityId ?? '').trim();
  if (!normalizedId) return label;
  const shortId = normalizedId.length > 18 ? `${normalizedId.slice(0, 8)}…${normalizedId.slice(-4)}` : normalizedId;
  return `${label} · ${shortId}`;
}

function getAccentClasses(accent: DashboardActionCard['accent']): string {
  switch (accent) {
    case 'orange':
      return 'border-orange-400/30 bg-orange-500/10 hover:border-orange-300/60 hover:bg-orange-500/15';
    case 'cyan':
      return 'border-cyan-400/30 bg-cyan-500/10 hover:border-cyan-300/60 hover:bg-cyan-500/15';
    case 'emerald':
      return 'border-emerald-400/30 bg-emerald-500/10 hover:border-emerald-300/60 hover:bg-emerald-500/15';
    case 'violet':
      return 'border-violet-400/30 bg-violet-500/10 hover:border-violet-300/60 hover:bg-violet-500/15';
    default:
      return 'border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10';
  }
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

  const now = Date.now();
  const activePlayers = players.filter((player) => player.status === 'active').length;
  const women = players.filter((player) => player.gender === 'W').length;
  const men = players.filter((player) => player.gender === 'M').length;
  const mixReady = players.filter((player) => player.mixReady).length;

  const tournamentCounts = {
    draft: tournaments.filter((tournament) => tournament.status === 'draft').length,
    open: tournaments.filter((tournament) => tournament.status === 'open').length,
    full: tournaments.filter((tournament) => tournament.status === 'full').length,
    finished: tournaments.filter((tournament) => tournament.status === 'finished').length,
  };

  const liveReadyTournaments = tournaments.filter((tournament) => getPrimaryLaunchTarget(tournament) != null);
  const activeTournaments = tournaments.filter((tournament) => {
    const status = String(tournament.status ?? '').trim().toLowerCase();
    return status === 'draft' || status === 'open' || status === 'full';
  });
  const tournamentsWithoutLiveControl = activeTournaments.filter((tournament) => getPrimaryLaunchTarget(tournament) == null);

  const archiveWithResults = new Set(
    archive
      .filter((tournament) => Array.isArray(tournament.results) && tournament.results.length > 0)
      .map((tournament) => tournament.id),
  );
  const tournamentsMissingArchiveResults = tournaments.filter((tournament) => tournament.status === 'finished' && !archiveWithResults.has(tournament.id));

  const upcoming = tournaments
    .filter((tournament) => tournament.status === 'open' || tournament.status === 'full')
    .sort((left, right) => getTournamentTimestamp(left) - getTournamentTimestamp(right))
    .slice(0, 5)
    .map((tournament): UpcomingTournamentItem => {
      const launchTarget = getPrimaryLaunchTarget(tournament);
      const sudyamFormat = getSudyamFormatForTournament(tournament.format);
      return {
        id: tournament.id,
        name: tournament.name,
        location: tournament.location || 'Локация не указана',
        schedule: formatSchedule(tournament.date, tournament.time),
        statusLabel: getStatusLabel(tournament.status),
        formatLabel: sudyamFormat ? getSudyamFormatLabel(sudyamFormat) : String(tournament.format || 'Формат не указан'),
        href: launchTarget?.href ?? '/admin/tournaments',
        actionLabel: launchTarget ? `Открыть · ${launchTarget.label}` : 'Открыть реестр',
      };
    });

  const pendingByTournament = pendingRequests.reduce<Map<string, number>>((map, request) => {
    const key = String(request.tournamentName || 'Без турнира');
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map());
  const pendingPreview = [...pendingByTournament.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} (${count})`)
    .join(' · ');

  const recentAudit = audit.filter((row) => now - new Date(row.createdAt).getTime() <= 24 * 60 * 60 * 1000).length;

  const actionCards: DashboardActionCard[] = [
    {
      href: '/admin/tournaments',
      title: 'Турниры',
      eyebrow: 'Что делать сейчас',
      description: 'Реестр турниров, запуск control-flow и контроль статусов.',
      primary: `${tournamentCounts.draft} черновиков · ${tournamentCounts.open} открытых`,
      secondary: `Live-форматы: ${liveReadyTournaments.length}. Ближайшие 3: ${upcoming.slice(0, 3).map((item) => item.name).join(' · ') || 'нет'}`,
      accent: 'orange',
    },
    {
      href: '/admin/requests',
      title: 'Заявки',
      eyebrow: 'Очередь оператора',
      description: 'Новые заявки игроков и ручная обработка подтверждений.',
      primary: `${pendingRequests.length} pending`,
      secondary: pendingPreview || 'Нет новых заявок в очереди.',
      accent: 'emerald',
    },
    {
      href: '/admin/archive',
      title: 'Архив',
      eyebrow: 'Публикация результатов',
      description: 'Финализация турниров, выгрузка в архив и контроль рейтинга.',
      primary: `${tournamentsMissingArchiveResults.length} без результатов`,
      secondary: `В архиве уже опубликовано: ${archive.length}. Завершённых турниров: ${tournamentCounts.finished}.`,
      accent: 'cyan',
    },
    {
      href: '/admin/roster',
      title: 'Ростер',
      eyebrow: 'Составы и посадка',
      description: 'Участники, лист ожидания и ручная сборка игровых слотов.',
      primary: `${activeTournaments.length} активных турниров`,
      secondary: `Без live-control: ${tournamentsWithoutLiveControl.length}. Mix-ready игроков: ${mixReady}.`,
      accent: 'violet',
    },
    {
      href: '/admin/reports',
      title: 'Отчёты',
      eyebrow: 'Контроль и сводки',
      description: 'Срезы по игрокам, турнирам и операционным отклонениям.',
      primary: `${recentAudit} действий за 24ч`,
      secondary: `Активных игроков: ${activePlayers}. Всего игроков в базе: ${players.length}.`,
      accent: 'slate',
    },
  ];

  const attentionItems: AttentionItem[] = [
    {
      href: '/admin/requests',
      title: 'Pending заявки',
      count: pendingRequests.length,
      description: 'Нужно проверить и провести в ростер.',
      detail: pendingPreview || 'Очередь пуста.',
    },
    {
      href: '/admin/archive',
      title: 'Архив без результатов',
      count: tournamentsMissingArchiveResults.length,
      description: 'Завершённые турниры ещё не опубликованы в архиве.',
      detail: tournamentsMissingArchiveResults.slice(0, 3).map((tournament) => tournament.name).join(' · ') || 'Хвостов по архиву нет.',
    },
    {
      href: '/admin/tournaments',
      title: 'Нужен live/control маршрут',
      count: tournamentsWithoutLiveControl.length,
      description: 'Draft/open турниры без быстрого перехода в live-control.',
      detail: tournamentsWithoutLiveControl.slice(0, 3).map((tournament) => tournament.name).join(' · ') || 'Все активные турниры имеют маршрут запуска.',
    },
  ];

  return (
    <div className="space-y-6" data-admin-dashboard>
      <section className="rounded-3xl border border-white/15 bg-gradient-to-br from-white/10 via-orange-500/10 to-transparent p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-200/80">Admin Hub</p>
            <h2 className="mt-2 font-heading text-4xl leading-none md:text-5xl">Операторский входной экран</h2>
            <p className="mt-3 max-w-2xl text-sm text-text-secondary md:text-base">
              Вместо пассивного набора KPI здесь собраны рабочие очереди, быстрые переходы и текущие турниры,
              которые требуют действия в ближайшее время.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]">
            <MetricPill label="Черновики" value={tournamentCounts.draft} />
            <MetricPill label="Открытые" value={tournamentCounts.open} />
            <MetricPill label="Pending заявки" value={pendingRequests.length} />
            <MetricPill label="Аудит 24ч" value={recentAudit} />
          </div>
        </div>

        {operatorView ? (
          <div className="mt-6 grid gap-3 xl:grid-cols-5" data-admin-action-hub>
            {actionCards.map((card) => (
              <ActionCard key={card.href} card={card} />
            ))}
          </div>
        ) : (
          <div
            className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-text-secondary"
            data-admin-viewer-overview
          >
            Роль `viewer` получает обзор, очереди внимания и ссылки только на страницы наблюдения. Быстрые операторские CTA скрыты,
            чтобы не превращать входной экран в набор действий, которые эта роль не исполняет.
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <section className="rounded-2xl border border-white/15 bg-white/5 p-4" data-admin-attention-queues>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-secondary">Очереди внимания</p>
              <h3 className="mt-2 font-heading text-3xl leading-none">Что просит вмешательства</h3>
            </div>
            <Link
              href="/admin/tournaments"
              className="rounded-xl border border-white/15 px-3 py-2 text-sm text-text-secondary transition-colors hover:border-brand hover:text-text-primary"
            >
              Открыть реестр
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {attentionItems.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="block rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:border-brand hover:bg-orange-500/10"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm text-text-secondary">{item.description}</p>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">{item.count}</span>
                </div>
                <p className="mt-3 text-xs text-text-secondary">{item.detail}</p>
              </Link>
            ))}
            {attentionItems.every((item) => item.count === 0) ? (
              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                Очереди пусты: pending заявок нет, архив не требует публикации, активные турниры имеют быстрые маршруты.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-white/15 bg-white/5 p-4" data-admin-upcoming-tournaments>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-secondary">Ближайшие турниры</p>
              <h3 className="mt-2 font-heading text-3xl leading-none">Следующие старты</h3>
            </div>
            <Link
              href="/admin/tournaments"
              className="rounded-xl border border-white/15 px-3 py-2 text-sm text-text-secondary transition-colors hover:border-brand hover:text-text-primary"
            >
              Все турниры
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {upcoming.map((tournament) => (
              <div key={tournament.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{tournament.name}</p>
                      <span className="rounded-full border border-white/15 px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-text-secondary">
                        {tournament.statusLabel}
                      </span>
                      <span className="rounded-full border border-cyan-400/25 px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-cyan-100">
                        {tournament.formatLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-text-secondary">{tournament.location}</p>
                    <p className="mt-1 text-xs text-text-secondary">{tournament.schedule}</p>
                  </div>

                  <Link
                    href={tournament.href}
                    className="inline-flex items-center justify-center rounded-xl border border-white/15 px-3 py-2 text-sm transition-colors hover:border-brand hover:bg-orange-500/10"
                  >
                    {tournament.actionLabel}
                  </Link>
                </div>
              </div>
            ))}

            {!upcoming.length ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-text-secondary">
                Нет ближайших открытых турниров. Когда оператор создаст или откроет следующий старт, он появится здесь с прямой ссылкой.
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr]">
        <section className="rounded-2xl border border-white/15 bg-white/5 p-4" data-admin-recent-actions>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-secondary">Последние действия</p>
              <h3 className="mt-2 font-heading text-3xl leading-none">Лента изменений</h3>
            </div>
            <Link
              href="/admin/audit"
              className="rounded-xl border border-white/15 px-3 py-2 text-sm text-text-secondary transition-colors hover:border-brand hover:text-text-primary"
            >
              Открыть аудит
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-text-secondary">
                  <th className="py-2 pr-3">Время</th>
                  <th className="py-2 pr-3">Роль</th>
                  <th className="py-2 pr-3">Действие</th>
                  <th className="py-2 pr-3">Сущность</th>
                  <th className="py-2 pr-3">Причина</th>
                </tr>
              </thead>
              <tbody>
                {audit.slice(0, 10).map((row) => (
                  <AuditRow key={row.id} row={row} />
                ))}
                {audit.length === 0 ? (
                  <tr>
                    <td className="py-4 text-text-secondary" colSpan={5}>
                      Нет данных аудита. После первых изменений операторов лента действий появится здесь.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-white/15 bg-white/5 p-4" data-admin-player-stats>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-secondary">Вторичный контекст</p>
            <h3 className="mt-2 font-heading text-3xl leading-none">Статистика игроков</h3>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <MiniStat label="Активные" value={activePlayers} color="bg-emerald-500" total={players.length} />
            <MiniStat label="Женщины / мужчины" value={`${women} / ${men}`} color="bg-cyan-500" total={Math.max(players.length, 1)} />
            <MiniStat label="Mix-ready" value={mixReady} color="bg-orange-500" total={players.length} />
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-text-secondary">
            Игроки остаются вторичным блоком на входном экране: метрики видны сразу, но главные действия смещены к турнирам,
            заявкам, архиву и контрольным очередям.
          </div>
        </section>
      </div>
    </div>
  );
}

function ActionCard({ card }: { card: DashboardActionCard }) {
  return (
    <Link
      href={card.href}
      className={`rounded-2xl border p-4 transition-all ${getAccentClasses(card.accent)}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">{card.eyebrow}</p>
      <h3 className="mt-2 font-heading text-2xl leading-none">{card.title}</h3>
      <p className="mt-2 min-h-[56px] text-sm text-text-secondary">{card.description}</p>
      <p className="mt-4 text-sm font-semibold text-text-primary">{card.primary}</p>
      <p className="mt-2 text-xs text-text-secondary">{card.secondary}</p>
    </Link>
  );
}

function MetricPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-text-secondary">{label}</p>
      <p className="mt-2 font-heading text-3xl leading-none">{value}</p>
    </div>
  );
}

function AuditRow({ row }: { row: AuditEntry }) {
  return (
    <tr className="border-b border-white/5">
      <td className="py-3 pr-3">{new Date(row.createdAt).toLocaleString('ru-RU')}</td>
      <td className="py-3 pr-3">{row.actorRole}</td>
      <td className="py-3 pr-3">{getAuditActionLabel(row.action, row.entityType)}</td>
      <td className="py-3 pr-3">{formatAuditEntity(row.entityType, row.entityId)}</td>
      <td className="py-3 pr-3">{row.reason || '—'}</td>
    </tr>
  );
}

function MiniStat({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: string | number;
  total: number;
  color: string;
}) {
  const numericValue = typeof value === 'number' ? value : Number.NaN;
  const percent = Number.isFinite(numericValue) && total > 0 ? Math.round((numericValue / total) * 100) : null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-white/10">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${percent ?? 100}%` }} />
      </div>
      <p className="mt-2 text-xs text-text-secondary">{percent == null ? 'Наблюдательная метрика' : `${percent}%`}</p>
    </div>
  );
}
