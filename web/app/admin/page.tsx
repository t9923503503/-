import { listPlayers, listTournaments } from '@/lib/admin-queries';
import { fetchAuditLog } from '@/lib/admin-audit';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const [tournaments, players, audit] = await Promise.all([
    listTournaments(''),
    listPlayers(''),
    fetchAuditLog(20),
  ]);

  const activeTournaments = tournaments.filter((x) => x.status === 'open' || x.status === 'full').length;
  const finishedTournaments = tournaments.filter((x) => x.status === 'finished').length;
  const activePlayers = players.filter((x) => x.status === 'active').length;

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="rounded-xl border border-white/15 bg-white/5 p-4">
        <p className="text-text-secondary text-sm">Турниры</p>
        <p className="font-heading text-4xl leading-none mt-2">{tournaments.length}</p>
        <p className="text-xs text-text-secondary mt-2">Активные: {activeTournaments}, завершенные: {finishedTournaments}</p>
      </div>
      <div className="rounded-xl border border-white/15 bg-white/5 p-4">
        <p className="text-text-secondary text-sm">Игроки</p>
        <p className="font-heading text-4xl leading-none mt-2">{players.length}</p>
        <p className="text-xs text-text-secondary mt-2">Active: {activePlayers}</p>
      </div>
      <div className="rounded-xl border border-white/15 bg-white/5 p-4">
        <p className="text-text-secondary text-sm">Аудит (24ч)</p>
        <p className="font-heading text-4xl leading-none mt-2">
          {audit.filter((x) => Date.now() - new Date(x.createdAt).getTime() <= 24 * 60 * 60 * 1000).length}
        </p>
      </div>

      <div className="md:col-span-3 rounded-xl border border-white/15 bg-white/5 p-4">
        <h2 className="font-heading text-3xl leading-none">Последние действия</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary border-b border-white/10">
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
