import { listPlayers, listTournaments } from '@/lib/admin-queries';
import { fetchAuditLog } from '@/lib/admin-audit';

export const dynamic = 'force-dynamic';

function formatDate(value: string) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

export default async function AdminDashboardPage() {
  const [tournaments, players, audit] = await Promise.all([
    listTournaments(''),
    listPlayers(''),
    fetchAuditLog(20),
  ]);

  const activePlayers = players.filter((x) => x.status === 'active').length;
  const women = players.filter((x) => x.gender === 'W').length;
  const men = players.filter((x) => x.gender === 'M').length;
  const mixReady = players.filter((x) => x.mixReady).length;
  const upcoming = tournaments
    .filter((x) => x.status === 'open' || x.status === 'full')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 5);
  const recentAudit = audit.filter((x) => Date.now() - new Date(x.createdAt).getTime() <= 24 * 60 * 60 * 1000).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard label="Активных игроков" value={activePlayers} hint={`Всего игроков: ${players.length}`} icon="🏐" />
        <DashboardCard label="Женщины / Мужчины" value={`${women} / ${men}`} hint={`Mix-ready: ${mixReady}`} icon="👥" />
        <DashboardCard label="Ближайшие турниры" value={upcoming.length} hint={`Всего турниров: ${tournaments.length}`} icon="📅" />
        <DashboardCard label="Аудит за 24ч" value={recentAudit} hint={`Последних записей: ${audit.length}`} icon="🧾" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
          <h2 className="font-heading text-3xl leading-none">Ближайшие турниры</h2>
          <div className="mt-4 space-y-2">
            {upcoming.map((tournament) => (
              <div key={tournament.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{tournament.name}</p>
                    <p className="text-xs text-text-secondary">{tournament.location || 'Локация не указана'} · {tournament.status}</p>
                  </div>
                  <div className="rounded-xl bg-orange-500/15 px-3 py-2 text-center text-sm text-orange-100">
                    {formatDate(tournament.date)}
                  </div>
                </div>
              </div>
            ))}
            {!upcoming.length ? <p className="text-sm text-text-secondary">Нет ближайших открытых турниров</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
          <h2 className="font-heading text-3xl leading-none">Статистика игроков</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MiniStat label="Женщины" value={women} color="bg-pink-500" total={players.length} />
            <MiniStat label="Мужчины" value={men} color="bg-cyan-500" total={players.length} />
            <MiniStat label="Mix" value={mixReady} color="bg-orange-500" total={players.length} />
          </div>
          <div className="mt-5 rounded-xl border border-white/10 bg-surface/60 p-4">
            <p className="text-sm font-semibold">Регистрация игроков за последние 30 дней</p>
            <p className="mt-2 text-sm text-text-secondary">
              Нет данных о датах регистрации: в текущей схеме `players.created_at` не используется в админском списке.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
        <h2 className="font-heading text-3xl leading-none">Последние действия</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-text-secondary">
                <th className="py-2 pr-3">Время</th>
                <th className="py-2 pr-3">Роль</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Entity</th>
                <th className="py-2 pr-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {audit.slice(0, 10).map((row) => (
                <tr key={row.id} className="border-b border-white/5">
                  <td className="py-2 pr-3">{new Date(row.createdAt).toLocaleString('ru-RU')}</td>
                  <td className="py-2 pr-3">{row.actorRole}</td>
                  <td className="py-2 pr-3">{row.action}</td>
                  <td className="py-2 pr-3">{row.entityType}:{row.entityId}</td>
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
      </div>
    </div>
  );
}

function DashboardCard({ label, value, hint, icon }: { label: string; value: string | number; hint: string; icon: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-gradient-to-br from-white/10 to-orange-500/10 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">{label}</p>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="mt-2 font-heading text-5xl leading-none">{value}</p>
      <p className="mt-2 text-xs text-text-secondary">{hint}</p>
    </div>
  );
}

function MiniStat({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-white/10">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-text-secondary">{percent}%</p>
    </div>
  );
}
