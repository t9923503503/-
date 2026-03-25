'use client';

import { useEffect, useMemo, useState } from 'react';

type Row = {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  format: string;
  division: string;
  level: string;
  capacity: number;
  status: string;
  participantCount: number;
  settings?: TournamentSettings;
};

type TournamentSettings = {
  courts: number;
  playersPerCourt: number;
  timerCourts: number;
  timerFinals: number;
  pairsMode: 'rotation' | 'fixed';
  draftSeed: string;
};

const defaultSettings: TournamentSettings = {
  courts: 4,
  playersPerCourt: 4,
  timerCourts: 10,
  timerFinals: 10,
  pairsMode: 'rotation',
  draftSeed: '',
};

const emptyForm: Row = {
  id: '',
  name: '',
  date: '',
  time: '',
  location: '',
  format: 'Round Robin',
  division: '',
  level: 'medium',
  capacity: 24,
  status: 'open',
  participantCount: 0,
  settings: { ...defaultSettings },
};

const formats = [
  { key: 'Round Robin', label: '🏐 Round Robin', shortLabel: 'RR' },
  { key: 'King of the Court', label: '👑 KOTC', shortLabel: 'KOTC' },
  { key: 'IPT Mixed', label: '🌴 IPT Микст', shortLabel: 'IPT' },
];

const divisions = [
  { key: 'Мужской', label: '♂ Муж' },
  { key: 'Женский', label: '♀ Жен' },
  { key: 'Микст', label: '⚡ Микст' },
];

const levels = [
  { key: 'hard', label: 'HARD', color: 'border-red-500/60 text-red-300' },
  { key: 'medium', label: 'MEDIUM', color: 'border-amber-500/60 text-amber-300' },
  { key: 'easy', label: 'LITE', color: 'border-emerald-500/60 text-emerald-300' },
];

const statuses = [
  { key: 'open', label: 'Открыт', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  { key: 'full', label: 'Заполнен', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  { key: 'finished', label: 'Завершён', color: 'bg-white/10 text-text-primary/60 border-white/10' },
  { key: 'cancelled', label: 'Отменён', color: 'bg-red-500/20 text-red-300 border-red-500/40' },
];

/* ─── Segment Button Component ─── */
function Seg<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; color?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map((o) => (
        <button
          key={String(o.key)}
          type="button"
          onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            value === o.key
              ? o.color ?? 'bg-brand/20 text-brand border-brand/50'
              : 'bg-white/5 text-text-primary/60 border-white/10 hover:border-white/30'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Number Stepper Component ─── */
function Stepper({
  value,
  onChange,
  min = 1,
  max = 25,
  suffix = '',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-lg border border-white/20 hover:border-brand text-text-primary/80 flex items-center justify-center"
      >
        −
      </button>
      <span className="w-16 text-center font-semibold text-brand">
        {value}{suffix}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-lg border border-white/20 hover:border-brand text-text-primary/80 flex items-center justify-center"
      >
        +
      </button>
    </div>
  );
}

export default function AdminTournamentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<Row>(emptyForm);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const isEdit = useMemo(() => Boolean(form.id), [form.id]);
  const settings = form.settings ?? defaultSettings;

  function updateSettings(patch: Partial<TournamentSettings>) {
    setForm((s) => ({ ...s, settings: { ...settings, ...patch } }));
  }

  // Auto-calculate capacity
  const autoCapacity = settings.courts * settings.playersPerCourt;

  async function load() {
    const res = await fetch(`/api/admin/tournaments?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const method = isEdit ? 'PUT' : 'POST';
    const payload = {
      ...form,
      capacity: form.capacity || autoCapacity,
      settings,
    };
    const res = await fetch('/api/admin/tournaments', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage(err?.error || 'Ошибка сохранения');
      return;
    }
    setForm(emptyForm);
    setMessage('Сохранено');
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Удалить турнир?')) return;
    const res = await fetch('/api/admin/tournaments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, reason: 'manual delete from admin' }),
    });
    if (!res.ok) {
      setMessage('Удаление запрещено или не удалось');
      return;
    }
    await load();
  }

  return (
    <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
      {/* ─── Table ─── */}
      <div className="rounded-xl border border-white/15 bg-white/5 p-4">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по турнирам"
            className="flex-1 px-3 py-2 rounded-lg bg-surface border border-white/20"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="px-3 py-2 rounded-lg border border-white/20 hover:border-brand"
          >
            Найти
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary border-b border-white/10">
                <th className="py-2 pr-3">Название</th>
                <th className="py-2 pr-3">Дата</th>
                <th className="py-2 pr-3">Статус</th>
                <th className="py-2 pr-3">Участники</th>
                <th className="py-2 pr-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/5">
                  <td className="py-2 pr-3">{row.name}</td>
                  <td className="py-2 pr-3">{row.date}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${
                      statuses.find(s => s.key === row.status)?.color ?? 'border-white/10'
                    }`}>
                      {statuses.find(s => s.key === row.status)?.label ?? row.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{row.participantCount}</td>
                  <td className="py-2 pr-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm(row)}
                      className="px-2 py-1 rounded border border-white/20 hover:border-brand text-xs"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(row.id)}
                      className="px-2 py-1 rounded border border-red-500/60 text-red-300 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td className="py-3 text-text-secondary" colSpan={5}>Нет данных</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Form ─── */}
      <form onSubmit={save} className="flex flex-col gap-4">
        {/* Basic info card */}
        <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
          <h2 className="font-heading text-3xl leading-none">
            {isEdit ? 'Редактировать' : 'Новый турнир'}
          </h2>

          <input
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            placeholder="Название"
            className="px-3 py-2 rounded-lg bg-surface border border-white/20"
            required
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-surface border border-white/20"
            />
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm((s) => ({ ...s, time: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-surface border border-white/20"
            />
          </div>

          <input
            value={form.location}
            onChange={(e) => setForm((s) => ({ ...s, location: e.target.value }))}
            placeholder="Локация (напр. МАЛИБУ)"
            className="px-3 py-2 rounded-lg bg-surface border border-white/20"
          />
        </div>

        {/* Format card */}
        <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            ⚙️ Формат турнира
          </h3>

          <div className="flex gap-1 flex-wrap">
            {formats.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setForm((s) => ({ ...s, format: f.key }))}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  form.format === f.key
                    ? 'bg-brand/20 text-brand border-brand/50'
                    : 'bg-white/5 text-text-primary/60 border-white/10 hover:border-white/30'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs text-text-secondary">Дивизион</label>
            <Seg
              options={divisions.map((d) => ({ key: d.key, label: d.label }))}
              value={form.division}
              onChange={(v) => setForm((s) => ({ ...s, division: v }))}
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary">Уровень</label>
            <Seg
              options={levels.map((l) => ({ key: l.key, label: l.label, color: l.color }))}
              value={form.level}
              onChange={(v) => setForm((s) => ({ ...s, level: v }))}
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary">Статус</label>
            <Seg
              options={statuses.map((st) => ({ key: st.key, label: st.label, color: st.color }))}
              value={form.status}
              onChange={(v) => setForm((s) => ({ ...s, status: v }))}
            />
          </div>
        </div>

        {/* Settings card */}
        <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            🏐 Настройки корта
          </h3>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary/80">Кортов:</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => updateSettings({ courts: n })}
                  className={`w-10 h-10 rounded-lg border text-sm font-semibold transition-colors ${
                    settings.courts === n
                      ? 'bg-brand/20 text-brand border-brand/50'
                      : 'bg-white/5 text-text-primary/60 border-white/10 hover:border-white/30'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary/80">Игроков на корт:</span>
            <div className="flex gap-1">
              {[4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => updateSettings({ playersPerCourt: n })}
                  className={`w-10 h-10 rounded-lg border text-sm font-semibold transition-colors ${
                    settings.playersPerCourt === n
                      ? 'bg-brand/20 text-brand border-brand/50'
                      : 'bg-white/5 text-text-primary/60 border-white/10 hover:border-white/30'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-center">
            {settings.courts} корт(а) × {settings.playersPerCourt} ={' '}
            <strong className="text-brand">{autoCapacity} игроков</strong>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary/80">Capacity (итого):</span>
            <input
              type="number"
              value={form.capacity || autoCapacity}
              onChange={(e) => setForm((s) => ({ ...s, capacity: Number(e.target.value || 0) }))}
              className="w-20 px-2 py-1 rounded-lg bg-surface border border-white/20 text-center text-sm"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary/80">Пары:</span>
            <button
              type="button"
              onClick={() => updateSettings({
                pairsMode: settings.pairsMode === 'rotation' ? 'fixed' : 'rotation',
              })}
              className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                settings.pairsMode === 'rotation'
                  ? 'bg-brand/20 text-brand border-brand/50'
                  : 'bg-purple-500/20 text-purple-300 border-purple-500/50'
              }`}
            >
              {settings.pairsMode === 'rotation' ? '🔄 Ротация' : '🔗 Фиксированные'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary/80">Draft seed:</span>
            <input
              type="number"
              value={settings.draftSeed}
              onChange={(e) => updateSettings({ draftSeed: e.target.value })}
              placeholder="авто"
              className="w-24 px-2 py-1 rounded-lg bg-surface border border-white/20 text-center text-sm"
            />
          </div>
        </div>

        {/* Timer card */}
        <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            ⏱ Таймеры
          </h3>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary/80">Корты (К1–К{settings.courts}):</span>
            <Stepper
              value={settings.timerCourts}
              onChange={(v) => updateSettings({ timerCourts: v })}
              min={2}
              max={25}
              suffix=" мин"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary/80">Финалы:</span>
            <Stepper
              value={settings.timerFinals}
              onChange={(v) => updateSettings({ timerFinals: v })}
              min={2}
              max={25}
              suffix=" мин"
            />
          </div>

          <div className="text-xs text-text-secondary text-center">
            Диапазон: 2–25 минут
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl bg-brand text-surface font-semibold disabled:opacity-60 text-sm"
          >
            {loading ? 'Сохраняем...' : isEdit ? '✅ Сохранить изменения' : '✅ Создать турнир'}
          </button>
          <button
            type="button"
            onClick={() => setForm(emptyForm)}
            className="px-4 py-3 rounded-xl border border-white/20 hover:border-brand text-sm"
          >
            Сброс
          </button>
        </div>
        {message ? (
          <p className={`text-sm text-center ${message === 'Сохранено' ? 'text-emerald-400' : 'text-red-400'}`}>
            {message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
