'use client';

import { useEffect, useState } from 'react';
import type { PlayOrganizer, PlayResources } from '@/lib/play-service';

type UserOption = { id: number; name: string; email: string };
type Payload = { resources: PlayResources; users: UserOption[] };
const fieldClass = 'w-full rounded-xl border border-white/15 bg-surface px-3 py-2.5 text-sm';
const emptyForm = { id: '', ownerUserId: '', displayName: '', bio: '', contactUrl: '', status: 'active' };

export default function AdminPlayOrganizers() {
  const [data, setData] = useState<Payload>({ resources: { organizers: [], venues: [], coaches: [] }, users: [] });
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  async function load() {
    const response = await fetch('/api/admin/play-organizers', { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || 'Не удалось загрузить организаторов'); return; }
    setData(body as Payload);
  }
  useEffect(() => { void load(); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError('');
    const response = await fetch('/api/admin/play-organizers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, ownerUserId: form.ownerUserId ? Number(form.ownerUserId) : null }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || 'Не удалось сохранить'); return; }
    setForm(emptyForm); await load();
  }
  function edit(item: PlayOrganizer) {
    setForm({ id: item.id, ownerUserId: item.ownerUserId ? String(item.ownerUserId) : '', displayName: item.displayName, bio: item.bio, contactUrl: item.contactUrl, status: item.status });
  }
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="font-heading text-3xl text-text-primary">Организаторы</h2>
      <p className="mt-1 text-sm text-text-secondary">Свяжите обычный аккаунт с правом создавать события. Организатор без владельца управляется только администратором.</p>
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      <form onSubmit={save} className="mt-5 grid gap-3 md:grid-cols-2">
        <input required className={fieldClass} value={form.displayName} onChange={(e) => setForm((x) => ({ ...x, displayName: e.target.value }))} placeholder="Название организатора" />
        <select className={fieldClass} value={form.ownerUserId} onChange={(e) => setForm((x) => ({ ...x, ownerUserId: e.target.value }))}><option value="">Без владельца</option>{data.users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select>
        <input className={fieldClass} value={form.contactUrl} onChange={(e) => setForm((x) => ({ ...x, contactUrl: e.target.value }))} placeholder="https://t.me/username" />
        <select className={fieldClass} value={form.status} onChange={(e) => setForm((x) => ({ ...x, status: e.target.value }))}><option value="active">Активен</option><option value="suspended">Приостановлен</option></select>
        <textarea className={`${fieldClass} md:col-span-2`} value={form.bio} onChange={(e) => setForm((x) => ({ ...x, bio: e.target.value }))} placeholder="Описание" />
        <div className="flex gap-2 md:col-span-2"><button className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">{form.id ? 'Сохранить' : 'Добавить'}</button>{form.id ? <button type="button" onClick={() => setForm(emptyForm)} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm">Отмена</button> : null}</div>
      </form>
      <div className="mt-5 grid gap-2 md:grid-cols-2">{data.resources.organizers.map((item) => <button type="button" key={item.id} onClick={() => edit(item)} className="rounded-xl border border-white/10 bg-surface/60 p-3 text-left"><span className="block text-sm font-semibold text-text-primary">{item.displayName}</span><span className="mt-1 block text-xs text-text-secondary">{item.status} · {item.ownerUserId ? `user #${item.ownerUserId}` : 'без владельца'}</span></button>)}</div>
    </section>
  );
}

