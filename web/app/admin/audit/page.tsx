'use client';

import { useEffect, useState } from 'react';

type AuditRow = {
  id: number;
  createdAt: string;
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
};

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [limit, setLimit] = useState(100);

  async function load() {
    const res = await fetch(`/api/admin/audit?limit=${limit}`, { cache: 'no-store' });
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-4">
      <div className="flex gap-2 mb-4">
        <input
          type="number"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value || 100))}
          className="w-32 px-3 py-2 rounded-lg bg-surface border border-white/20"
        />
        <button type="button" onClick={() => void load()} className="px-3 py-2 rounded-lg border border-white/20 hover:border-brand">
          Обновить
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-secondary border-b border-white/10">
              <th className="py-2 pr-3">Время</th>
              <th className="py-2 pr-3">Actor</th>
              <th className="py-2 pr-3">Роль</th>
              <th className="py-2 pr-3">Action</th>
              <th className="py-2 pr-3">Entity</th>
              <th className="py-2 pr-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5">
                <td className="py-2 pr-3">{new Date(row.createdAt).toLocaleString('ru-RU')}</td>
                <td className="py-2 pr-3">{row.actorId || '-'}</td>
                <td className="py-2 pr-3">{row.actorRole}</td>
                <td className="py-2 pr-3">{row.action}</td>
                <td className="py-2 pr-3">{row.entityType}:{row.entityId}</td>
                <td className="py-2 pr-3">{row.reason || '-'}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td className="py-3 text-text-secondary" colSpan={6}>Нет данных</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
