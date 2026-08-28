'use client';

import { useEffect, useState } from 'react';

type Tournament = { id: string; name: string };
type PlayerRequest = {
  id: string;
  name: string;
  gender: 'M' | 'W';
  phone: string;
  tournamentId: string;
  tournamentName: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
};
type TelegramClaim = {
  id: string;
  name: string;
  gender: 'M' | 'W';
  phone: string;
  requestedPlayerName: string | null;
  createdAt: string;
};
type AccountPlayerLink = {
  userId: number;
  accountName: string;
  email: string | null;
  vkLinked: boolean;
  telegramLinked: boolean;
  playerId: string;
  playerName: string;
  gender: 'M' | 'W';
};

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<PlayerRequest[]>([]);
  const [telegramClaims, setTelegramClaims] = useState<TelegramClaim[]>([]);
  const [accountLinks, setAccountLinks] = useState<AccountPlayerLink[]>([]);
  const [canUnlinkAccount, setCanUnlinkAccount] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [filterTid, setFilterTid] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadRequests(tid?: string) {
    const qs = tid ? `?tournamentId=${encodeURIComponent(tid)}` : '';
    const res = await fetch(`/api/admin/requests${qs}`, { cache: 'no-store' });
    setRequests(await res.json().catch(() => []));
  }

  async function loadTelegramClaims() {
    const res = await fetch('/api/admin/player-claims', { cache: 'no-store' });
    setTelegramClaims(await res.json().catch(() => []));
  }

  async function loadAccountLinks(query = '') {
    const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
    const res = await fetch(`/api/admin/player-links${qs}`, { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(data?.error || 'Не удалось загрузить привязки карточек');
      return;
    }
    setAccountLinks(Array.isArray(data?.links) ? data.links : []);
    setCanUnlinkAccount(data?.canUnlink === true);
  }

  useEffect(() => {
    void (async () => {
      const tRes = await fetch('/api/admin/tournaments', { cache: 'no-store' });
      setTournaments(await tRes.json().catch(() => []));
      await loadRequests();
      await loadTelegramClaims();
      await loadAccountLinks();
    })();
  }, []);

  function onFilterChange(tid: string) {
    setFilterTid(tid);
    void loadRequests(tid || undefined);
  }

  async function handleAction(action: 'approve' | 'reject', requestId: string) {
    setLoading(true);
    setMessage('');
    const res = await fetch('/api/admin/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, requestId }),
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage(err?.error || 'Ошибка');
      return;
    }
    setMessage(action === 'approve' ? 'Заявка одобрена' : 'Заявка отклонена');
    await loadRequests(filterTid || undefined);
  }

  async function handleTelegramClaim(action: 'approve' | 'reject', claimId: string) {
    setLoading(true);
    setMessage('');
    const res = await fetch('/api/admin/player-claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, claimId }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    setMessage(data?.reply || (res.ok ? 'Заявка обработана' : 'Ошибка обработки заявки'));
    if (res.ok) await loadTelegramClaims();
  }

  async function handleAccountUnlink(link: AccountPlayerLink) {
    const reason = window.prompt(
      `Почему нужно отвязать карточку «${link.playerName}» от аккаунта №${link.userId}?`
    )?.trim();
    if (!reason) return;
    if (!window.confirm(`Точно отвязать «${link.playerName}» от аккаунта №${link.userId}?`)) return;

    setLoading(true);
    setMessage('');
    const res = await fetch('/api/admin/player-links', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: link.userId, reason }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    setMessage(data?.message || data?.error || (res.ok ? 'Карточка отвязана' : 'Ошибка отвязки'));
    if (res.ok) await loadAccountLinks(linkSearch);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-4">
        <h2 className="font-heading text-3xl leading-none mb-1">Регистрация из Telegram</h2>
        <p className="mb-3 text-sm text-text-secondary">Подтверди существующую карточку или создай новую. Телефон виден только администраторам.</p>
        <div className="grid gap-3">
          {telegramClaims.map((claim) => (
            <article key={claim.id} className="rounded-xl border border-white/10 bg-black/15 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-white">{claim.name} · {claim.gender === 'W' ? 'Ж' : 'М'}</div>
                  <div className="text-sm text-text-secondary">{claim.phone}</div>
                  <div className="mt-1 text-sm">
                    {claim.requestedPlayerName ? `Выбрана карточка: ${claim.requestedPlayerName}` : 'Нужно создать новую карточку'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={loading} onClick={() => void handleTelegramClaim('approve', claim.id)} className="rounded-lg border border-green-500/60 px-3 py-2 text-sm text-green-300">Подтвердить</button>
                  <button type="button" disabled={loading} onClick={() => void handleTelegramClaim('reject', claim.id)} className="rounded-lg border border-red-500/60 px-3 py-2 text-sm text-red-300">Отклонить</button>
                </div>
              </div>
            </article>
          ))}
          {telegramClaims.length === 0 ? <div className="text-sm text-text-secondary">Новых Telegram-заявок нет.</div> : null}
        </div>
      </div>

      <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4">
        <h2 className="font-heading text-3xl leading-none mb-1">Привязки карточек</h2>
        <p className="mb-3 text-sm text-text-secondary">
          Найдите ошибочную привязку по карточке, имени аккаунта или email. Снять её может только администратор; причина попадёт в Audit.
        </p>
        <form
          className="mb-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void loadAccountLinks(linkSearch);
          }}
        >
          <input
            value={linkSearch}
            onChange={(event) => setLinkSearch(event.target.value)}
            placeholder="Например: Лебедев"
            className="min-h-11 flex-1 rounded-lg border border-white/20 bg-surface px-3"
          />
          <button type="submit" className="rounded-lg border border-amber-400/50 px-4 py-2 text-amber-200">
            Найти
          </button>
        </form>
        <div className="grid gap-2">
          {accountLinks.map((link) => (
            <article key={link.userId} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/15 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-white">{link.playerName} · {link.gender === 'W' ? 'Ж' : 'М'}</div>
                <div className="text-sm text-text-secondary">
                  Аккаунт №{link.userId}: {link.accountName || 'без имени'}{link.email ? ` · ${link.email}` : ''}
                </div>
                <div className="mt-1 text-xs text-text-secondary">
                  {[link.vkLinked ? 'VK ID' : '', link.telegramLinked ? 'Telegram' : ''].filter(Boolean).join(' + ') || 'Email и пароль'}
                </div>
              </div>
              {canUnlinkAccount ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleAccountUnlink(link)}
                  className="rounded-lg border border-red-500/60 px-3 py-2 text-sm text-red-300 disabled:opacity-50"
                >
                  Отвязать карточку
                </button>
              ) : null}
            </article>
          ))}
          {accountLinks.length === 0 ? <div className="text-sm text-text-secondary">Привязки не найдены.</div> : null}
        </div>
      </div>

      <div className="flex gap-2 items-end">
        <select
          value={filterTid}
          onChange={(e) => onFilterChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg bg-surface border border-white/20"
        >
          <option value="">Все турниры</option>
          {tournaments.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-white/15 bg-white/5 p-4">
        <h2 className="font-heading text-3xl leading-none mb-3">Ожидающие заявки</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary border-b border-white/10">
                <th className="py-2 pr-3">Имя</th>
                <th className="py-2 pr-3">Пол</th>
                <th className="py-2 pr-3">Телефон</th>
                <th className="py-2 pr-3">Турнир</th>
                <th className="py-2 pr-3">Дата</th>
                <th className="py-2 pr-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-white/5">
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3">{r.gender === 'W' ? '♀️' : '♂️'}</td>
                  <td className="py-2 pr-3 text-text-secondary">{r.phone || '—'}</td>
                  <td className="py-2 pr-3">{r.tournamentName}</td>
                  <td className="py-2 pr-3 text-text-secondary">
                    {new Date(r.createdAt).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="py-2 pr-3 flex gap-1">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void handleAction('approve', r.id)}
                      className="px-2 py-1 rounded border border-green-500/60 text-green-300 text-xs"
                    >
                      Принять
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void handleAction('reject', r.id)}
                      className="px-2 py-1 rounded border border-red-500/60 text-red-300 text-xs"
                    >
                      Отклонить
                    </button>
                  </td>
                </tr>
              ))}
              {requests.length === 0 ? (
                <tr><td className="py-3 text-text-secondary" colSpan={6}>Нет ожидающих заявок</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {message ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-text-secondary">{message}</div>
      ) : null}
    </div>
  );
}
