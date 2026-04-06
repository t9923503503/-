'use client';

import { useEffect, useMemo, useState } from 'react';

type PlayerStatus = 'active' | 'temporary' | 'inactive' | 'injured' | 'vacation';
type PlayerSkillLevel = 'light' | 'medium' | 'advanced' | 'pro';
type PlayerPosition = 'attacker' | 'defender' | 'universal' | 'setter' | 'blocker';

type Row = {
  id: string;
  name: string;
  gender: 'M' | 'W';
  status: PlayerStatus;
  ratingM: number;
  ratingW: number;
  ratingMix: number;
  wins: number;
  totalPts: number;
  tournamentsPlayed: number;
  photoUrl: string;
  birthDate: string;
  heightCm: number | null;
  weightKg: number | null;
  skillLevel: PlayerSkillLevel | null;
  preferredPosition: PlayerPosition | null;
  mixReady: boolean;
  phone: string;
  telegram: string;
  adminComment: string;
};

type Filters = {
  genders: Array<'M' | 'W'>;
  levels: PlayerSkillLevel[];
  statuses: PlayerStatus[];
  mixReady: '' | 'yes' | 'no';
  heightFrom: string;
  heightTo: string;
  ageFrom: string;
  ageTo: string;
  tournamentsMin: string;
  ratingMin: string;
};

type Preset = { id: string; name: string; filters: Filters };

const statusOptions: Array<{ key: PlayerStatus; label: string; tone: string }> = [
  { key: 'active', label: 'Active', tone: 'border-emerald-400/40 text-emerald-200 bg-emerald-500/10' },
  { key: 'inactive', label: 'Inactive', tone: 'border-slate-400/30 text-slate-200 bg-slate-500/10' },
  { key: 'injured', label: 'Травма', tone: 'border-red-400/40 text-red-200 bg-red-500/10' },
  { key: 'vacation', label: 'В отпуске', tone: 'border-sky-400/40 text-sky-200 bg-sky-500/10' },
  { key: 'temporary', label: 'Temporary', tone: 'border-white/20 text-white/70 bg-white/5' },
];

const levelOptions: Array<{ key: PlayerSkillLevel; label: string; tone: string }> = [
  { key: 'light', label: 'Light', tone: 'border-cyan-400/40 text-cyan-100 bg-cyan-500/10' },
  { key: 'medium', label: 'Medium', tone: 'border-yellow-400/40 text-yellow-100 bg-yellow-500/10' },
  { key: 'advanced', label: 'Advanced', tone: 'border-orange-400/50 text-orange-100 bg-orange-500/10' },
  { key: 'pro', label: 'Pro', tone: 'border-fuchsia-400/50 text-fuchsia-100 bg-fuchsia-500/10' },
];

const positionOptions: Array<{ key: PlayerPosition; label: string }> = [
  { key: 'attacker', label: 'Attacker / нападающий' },
  { key: 'defender', label: 'Defender / защитник' },
  { key: 'universal', label: 'Universal' },
  { key: 'setter', label: 'Setter' },
  { key: 'blocker', label: 'Blocker' },
];

const emptyFilters: Filters = {
  genders: [],
  levels: [],
  statuses: [],
  mixReady: '',
  heightFrom: '',
  heightTo: '',
  ageFrom: '',
  ageTo: '',
  tournamentsMin: '',
  ratingMin: '',
};

const emptyForm: Row = {
  id: '',
  name: '',
  gender: 'M',
  status: 'active',
  ratingM: 0,
  ratingW: 0,
  ratingMix: 0,
  wins: 0,
  totalPts: 0,
  tournamentsPlayed: 0,
  photoUrl: '',
  birthDate: '',
  heightCm: null,
  weightKg: null,
  skillLevel: 'light',
  preferredPosition: 'universal',
  mixReady: false,
  phone: '',
  telegram: '',
  adminComment: '',
};

function ageFromBirthDate(value: string): number | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const m = now.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < date.getDate())) age -= 1;
  return age;
}

function bestRating(row: Row): number {
  return Math.max(row.ratingM, row.ratingW, row.ratingMix);
}

function toggleValue<T extends string>(items: T[], value: T): T[] {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

function toNullableNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeRows(data: unknown): Row[] {
  return Array.isArray(data)
    ? data.map((item) => ({ ...emptyForm, ...(item && typeof item === 'object' ? item : {}) })) as Row[]
    : [];
}

function validateForm(form: Row): string | null {
  if (!form.name.trim()) return 'Введите имя игрока';
  if (form.heightCm != null && (form.heightCm < 150 || form.heightCm > 220)) return 'Рост должен быть 150-220 см';
  if (form.weightKg != null && (form.weightKg < 40 || form.weightKg > 140)) return 'Вес должен быть 40-140 кг';
  if (form.birthDate && ageFromBirthDate(form.birthDate) == null) return 'Некорректная дата рождения';
  return null;
}

export default function AdminPlayersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<'25' | '50' | '100' | 'all'>('25');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Row>(emptyForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [bulkStatus, setBulkStatus] = useState<PlayerStatus>('active');
  const [bulkLevel, setBulkLevel] = useState<PlayerSkillLevel>('medium');

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const isEdit = Boolean(form.id);
  const formError = validateForm(form);

  async function load() {
    const res = await fetch(`/api/admin/players?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
    setRows(normalizeRows(await res.json()));
    setSelected(new Set());
  }

  async function loadPresets() {
    const res = await fetch('/api/admin/filter-presets?scope=admin.players', { cache: 'no-store' });
    const data = await res.json().catch(() => []);
    setPresets(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void load();
    void loadPresets();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filters, query, pageSize]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (filters.genders.length && !filters.genders.includes(row.gender)) return false;
      if (filters.levels.length && (!row.skillLevel || !filters.levels.includes(row.skillLevel))) return false;
      if (filters.statuses.length && !filters.statuses.includes(row.status)) return false;
      if (filters.mixReady === 'yes' && !row.mixReady) return false;
      if (filters.mixReady === 'no' && row.mixReady) return false;

      const height = row.heightCm ?? 0;
      const heightFrom = Number(filters.heightFrom || 0);
      const heightTo = Number(filters.heightTo || 0);
      if (heightFrom && (!height || height < heightFrom)) return false;
      if (heightTo && (!height || height > heightTo)) return false;

      const age = ageFromBirthDate(row.birthDate);
      const ageFrom = Number(filters.ageFrom || 0);
      const ageTo = Number(filters.ageTo || 0);
      if (ageFrom && (age == null || age < ageFrom)) return false;
      if (ageTo && (age == null || age > ageTo)) return false;

      if (Number(filters.tournamentsMin || 0) && row.tournamentsPlayed < Number(filters.tournamentsMin)) return false;
      if (Number(filters.ratingMin || 0) && bestRating(row) < Number(filters.ratingMin)) return false;
      return true;
    });
  }, [filters, rows]);

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filteredRows.length / Number(pageSize)));
  const visibleRows = pageSize === 'all'
    ? filteredRows
    : filteredRows.slice((page - 1) * Number(pageSize), page * Number(pageSize));

  function openNew() {
    setForm(emptyForm);
    setPhotoFile(null);
    setPhotoPreview('');
    setModalOpen(true);
  }

  function openEdit(row: Row) {
    setForm({ ...emptyForm, ...row });
    setPhotoFile(null);
    setPhotoPreview(row.photoUrl || '');
    setModalOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const err = validateForm(form);
    if (err) {
      setMessage(err);
      return;
    }
    setLoading(true);
    setMessage('');
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch('/api/admin/players', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      setMessage(error?.error || 'Ошибка сохранения');
      return;
    }
    const saved = { ...emptyForm, ...(await res.json()) } as Row;
    if (photoFile) {
      const fd = new FormData();
      fd.append('photo', photoFile);
      await fetch(`/api/admin/players/${saved.id}/photo`, { method: 'POST', body: fd });
    }
    setMessage('Игрок сохранён');
    setModalOpen(false);
    setForm(emptyForm);
    await load();
  }

  async function savePreset() {
    const name = prompt('Название пресета фильтра');
    if (!name) return;
    const res = await fetch('/api/admin/filter-presets?scope=admin.players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, scope: 'admin.players', filters }),
    });
    if (!res.ok) {
      setMessage('Не удалось сохранить пресет');
      return;
    }
    await loadPresets();
  }

  async function deletePreset(id: string) {
    await fetch(`/api/admin/filter-presets?id=${encodeURIComponent(id)}&scope=admin.players`, { method: 'DELETE' });
    await loadPresets();
  }

  async function bulk(action: 'status' | 'level' | 'delete') {
    if (!selectedIds.length) return;
    const reason = action === 'delete' ? prompt('Причина удаления выбранных игроков') : 'bulk update from admin players';
    if (action === 'delete' && !reason) return;
    const confirmed = action !== 'delete' || confirm(`Удалить выбранных игроков: ${selectedIds.length}?`);
    if (!confirmed) return;
    const res = await fetch('/api/admin/players/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: selectedIds,
        action,
        status: bulkStatus,
        skillLevel: bulkLevel,
        reason,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage(err?.error || 'Bulk action failed');
      return;
    }
    setMessage('Массовое действие выполнено');
    await load();
  }

  function exportSelected() {
    if (!selectedIds.length) return;
    window.location.href = `/api/admin/players/export?ids=${encodeURIComponent(selectedIds.join(','))}`;
  }

  function toggleAllVisible(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const row of visibleRows) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4" data-admin-players-workspace>
      <div className="rounded-2xl border border-orange-400/20 bg-gradient-to-br from-white/10 via-white/[0.04] to-cyan-500/10 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-text-secondary">Игроки клуба</p>
            <h2 className="font-heading text-4xl leading-none">Найдено {filteredRows.length} игроков</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск игроков"
              className="min-w-56 rounded-xl border border-white/20 bg-surface px-3 py-2 text-sm"
            />
            <button type="button" onClick={() => void load()} className="rounded-xl border border-white/20 px-4 py-2 hover:border-brand">
              Найти
            </button>
            <button type="button" onClick={openNew} className="rounded-xl bg-brand px-4 py-2 font-semibold text-surface shadow-lg shadow-orange-500/20">
              + 🏐 Добавить игрока
            </button>
            <button type="button" onClick={() => setFiltersOpen((x) => !x)} className="rounded-xl border border-cyan-300/30 px-4 py-2 lg:hidden">
              Фильтры
            </button>
          </div>
        </div>

        <div className={`${filtersOpen ? 'block' : 'hidden'} mt-4 space-y-4 lg:block`} data-filter-panel>
          <div className="flex flex-wrap gap-2">
            <Chip active={filters.genders.includes('W')} onClick={() => setFilters((s) => ({ ...s, genders: toggleValue(s.genders, 'W') }))}>✓ ♀ Женщины</Chip>
            <Chip active={filters.genders.includes('M')} onClick={() => setFilters((s) => ({ ...s, genders: toggleValue(s.genders, 'M') }))}>✓ ♂ Мужчины</Chip>
            <Chip active={filters.mixReady === 'yes'} onClick={() => setFilters((s) => ({ ...s, mixReady: s.mixReady === 'yes' ? '' : 'yes' }))}>🤝 Mix Да</Chip>
            <Chip active={filters.mixReady === 'no'} onClick={() => setFilters((s) => ({ ...s, mixReady: s.mixReady === 'no' ? '' : 'no' }))}>Mix Нет</Chip>
            {levelOptions.map((level) => (
              <Chip key={level.key} active={filters.levels.includes(level.key)} tone={level.tone} onClick={() => setFilters((s) => ({ ...s, levels: toggleValue(s.levels, level.key) }))}>
                ✓ {level.label}
              </Chip>
            ))}
            {statusOptions.map((status) => (
              <Chip key={status.key} active={filters.statuses.includes(status.key)} tone={status.tone} onClick={() => setFilters((s) => ({ ...s, statuses: toggleValue(s.statuses, status.key) }))}>
                ✓ {status.label}
              </Chip>
            ))}
          </div>

          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <RangeInput label="Рост от" value={filters.heightFrom} onChange={(v) => setFilters((s) => ({ ...s, heightFrom: v }))} />
            <RangeInput label="Рост до" value={filters.heightTo} onChange={(v) => setFilters((s) => ({ ...s, heightTo: v }))} />
            <RangeInput label="Возраст от" value={filters.ageFrom} onChange={(v) => setFilters((s) => ({ ...s, ageFrom: v }))} />
            <RangeInput label="Возраст до" value={filters.ageTo} onChange={(v) => setFilters((s) => ({ ...s, ageTo: v }))} />
            <RangeInput label="Мин. турниров" value={filters.tournamentsMin} onChange={(v) => setFilters((s) => ({ ...s, tournamentsMin: v }))} />
            <RangeInput label="Мин. рейтинг" value={filters.ratingMin} onChange={(v) => setFilters((s) => ({ ...s, ratingMin: v }))} />
          </div>

          <div className="flex flex-wrap items-center gap-2" data-filter-presets>
            <button type="button" onClick={savePreset} className="rounded-xl border border-brand/50 px-3 py-2 text-sm text-orange-100 hover:bg-brand/20">
              Сохранить текущий фильтр как пресет
            </button>
            <button type="button" onClick={() => setFilters(emptyFilters)} className="rounded-xl border border-white/20 px-3 py-2 text-sm hover:border-brand">
              Сбросить все
            </button>
            {presets.map((preset) => (
              <span key={preset.id} className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-2 py-1 text-xs">
                <button type="button" onClick={() => setFilters({ ...emptyFilters, ...preset.filters })}>{preset.name}</button>
                <button type="button" onClick={() => void deletePreset(preset.id)} className="text-red-200">×</button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {selectedIds.length ? (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-orange-300/30 bg-gradient-to-r from-orange-500/20 via-yellow-200/10 to-cyan-500/20 p-3 shadow-2xl" data-bulk-toolbar>
          <span className="font-semibold">🏐 Выбрано: {selectedIds.length}</span>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as PlayerStatus)} className="rounded-lg border border-white/20 bg-surface px-2 py-1">
            {statusOptions.map((status) => <option key={status.key} value={status.key}>{status.label}</option>)}
          </select>
          <button type="button" onClick={() => void bulk('status')} className="rounded-lg border border-white/20 px-3 py-1 hover:border-brand">Сменить статус</button>
          <select value={bulkLevel} onChange={(e) => setBulkLevel(e.target.value as PlayerSkillLevel)} className="rounded-lg border border-white/20 bg-surface px-2 py-1">
            {levelOptions.map((level) => <option key={level.key} value={level.key}>{level.label}</option>)}
          </select>
          <button type="button" onClick={() => void bulk('level')} className="rounded-lg border border-white/20 px-3 py-1 hover:border-brand">Изменить уровень</button>
          <button type="button" onClick={exportSelected} className="rounded-lg border border-cyan-300/40 px-3 py-1 text-cyan-100">Экспорт выбранных CSV</button>
          <button type="button" onClick={() => void bulk('delete')} className="rounded-lg border border-red-400/60 px-3 py-1 text-red-200">Удалить выбранное</button>
        </div>
      ) : null}

      <div className="hidden overflow-x-auto rounded-2xl border border-white/15 bg-white/5 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-secondary">
              <th className="p-3"><input type="checkbox" onChange={(e) => toggleAllVisible(e.target.checked)} /></th>
              <th className="p-3">Игрок</th>
              <th className="p-3">Пол</th>
              <th className="p-3">Уровень</th>
              <th className="p-3">Статус</th>
              <th className="p-3">Mix</th>
              <th className="p-3">Рейтинг</th>
              <th className="p-3">Турниры</th>
              <th className="p-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id} className="border-t border-white/10 transition hover:-translate-y-0.5 hover:bg-orange-500/10">
                <td className="p-3">
                  <input type="checkbox" checked={selected.has(row.id)} onChange={(e) => setSelected((s) => {
                    const next = new Set(s);
                    if (e.target.checked) next.add(row.id); else next.delete(row.id);
                    return next;
                  })} />
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <Avatar row={row} />
                    <div>
                      <div className="font-semibold">{row.name}</div>
                      <div className="text-xs text-text-secondary">{row.heightCm ? `${row.heightCm} см` : 'рост -'} · {row.birthDate ? `${ageFromBirthDate(row.birthDate)} лет` : 'возраст -'}</div>
                    </div>
                  </div>
                </td>
                <td className="p-3">{row.gender === 'W' ? '♀' : '♂'}</td>
                <td className="p-3"><Badge text={levelOptions.find((x) => x.key === row.skillLevel)?.label ?? 'Не указан'} /></td>
                <td className="p-3"><Badge text={statusOptions.find((x) => x.key === row.status)?.label ?? row.status} /></td>
                <td className="p-3">{row.mixReady ? '🤝 Да' : 'Нет'}</td>
                <td className="p-3">{bestRating(row)}</td>
                <td className="p-3">{row.tournamentsPlayed}</td>
                <td className="p-3"><button type="button" onClick={() => openEdit(row)} className="rounded-lg border border-white/20 px-2 py-1 hover:border-brand">Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden" data-mobile-player-cards>
        {visibleRows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <div className="flex items-start gap-3">
              <input type="checkbox" checked={selected.has(row.id)} onChange={(e) => setSelected((s) => {
                const next = new Set(s);
                if (e.target.checked) next.add(row.id); else next.delete(row.id);
                return next;
              })} />
              <Avatar row={row} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{row.name}</div>
                <div className="mt-1 text-xs text-text-secondary">{row.gender} · {row.skillLevel ?? 'без уровня'} · {row.status} · Mix {row.mixReady ? 'да' : 'нет'}</div>
                <div className="mt-2 text-sm">Рейтинг: {bestRating(row)} · Турниров: {row.tournamentsPlayed}</div>
                <button type="button" onClick={() => openEdit(row)} className="mt-3 rounded-lg border border-white/20 px-3 py-1 text-sm">Редактировать</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/5 p-3">
        <div className="text-sm text-text-secondary">Найдено {filteredRows.length} игроков</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-secondary">Показать по</span>
          {(['25', '50', '100', 'all'] as const).map((size) => (
            <button key={size} type="button" onClick={() => setPageSize(size)} className={`rounded-lg px-2 py-1 text-sm ${pageSize === size ? 'bg-brand text-surface' : 'border border-white/20'}`}>
              {size === 'all' ? 'Все' : size}
            </button>
          ))}
          {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 12).map((p) => (
            <button key={p} type="button" onClick={() => setPage(p)} className={`rounded-lg px-2 py-1 text-sm ${page === p ? 'bg-white text-surface' : 'border border-white/20'}`}>{p}</button>
          ))}
        </div>
      </div>

      <button type="button" onClick={openNew} className="fixed bottom-5 right-5 z-30 rounded-full bg-brand px-5 py-4 font-bold text-surface shadow-2xl shadow-orange-500/40 md:hidden">
        + 🏐
      </button>

      {modalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm" data-player-modal>
          <form onSubmit={save} className="max-h-[96dvh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/15 bg-surface p-4 shadow-2xl animate-[fadeIn_.18s_ease-out] md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-text-secondary">{isEdit ? 'Редактирование' : 'Новый игрок'}</p>
                <h3 className="font-heading text-4xl leading-none">{isEdit ? form.name : 'Добавить игрока'}</h3>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-full border border-white/20 px-3 py-1">×</button>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-3">
                <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-orange-300/40 bg-gradient-to-br from-orange-500/20 to-cyan-500/10 p-4 text-center">
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoPreview} alt="" className="h-40 w-40 rounded-full object-cover" />
                  ) : (
                    <div className="text-6xl">🏐</div>
                  )}
                  <span className="mt-3 text-sm text-text-secondary">Загрузить аватарку или перетащить файл</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setPhotoFile(file);
                      setPhotoPreview(file ? URL.createObjectURL(file) : form.photoUrl);
                    }}
                  />
                </label>
                <Field label="Имя" value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} required />
                <div className="grid grid-cols-2 gap-2">
                  <SelectField label="Пол" value={form.gender} onChange={(v) => setForm((s) => ({ ...s, gender: v as 'M' | 'W' }))} options={[['M', '♂ Мужчины'], ['W', '♀ Женщины']]} />
                  <Field label={`Дата рождения${form.birthDate ? ` · ${ageFromBirthDate(form.birthDate)} лет` : ''}`} type="date" value={form.birthDate} onChange={(v) => setForm((s) => ({ ...s, birthDate: v }))} />
                </div>
                <SelectField label="Статус" value={form.status} onChange={(v) => setForm((s) => ({ ...s, status: v as PlayerStatus }))} options={statusOptions.map((x) => [x.key, x.label])} />
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Рост (см)" type="number" value={form.heightCm ?? ''} onChange={(v) => setForm((s) => ({ ...s, heightCm: toNullableNumber(v) }))} />
                  <Field label="Вес (кг)" type="number" value={form.weightKg ?? ''} onChange={(v) => setForm((s) => ({ ...s, weightKg: toNullableNumber(v) }))} />
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wider text-text-secondary">Уровень</p>
                  <div className="grid grid-cols-2 gap-2">
                    {levelOptions.map((level) => (
                      <Chip key={level.key} active={form.skillLevel === level.key} tone={level.tone} onClick={() => setForm((s) => ({ ...s, skillLevel: level.key }))}>
                        {level.label}
                      </Chip>
                    ))}
                  </div>
                </div>
                <SelectField label="Предпочитаемая позиция" value={form.preferredPosition ?? 'universal'} onChange={(v) => setForm((s) => ({ ...s, preferredPosition: v as PlayerPosition }))} options={positionOptions.map((x) => [x.key, x.label])} />
                <label className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                  <input type="checkbox" checked={form.mixReady} onChange={(e) => setForm((s) => ({ ...s, mixReady: e.target.checked }))} />
                  <span>🤝 Mix-ready</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Телефон" value={form.phone} onChange={(v) => setForm((s) => ({ ...s, phone: v }))} />
                  <Field label="Telegram" value={form.telegram} onChange={(v) => setForm((s) => ({ ...s, telegram: v }))} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Rating M" type="number" value={form.ratingM} onChange={(v) => setForm((s) => ({ ...s, ratingM: Number(v || 0) }))} />
                  <Field label="Rating W" type="number" value={form.ratingW} onChange={(v) => setForm((s) => ({ ...s, ratingW: Number(v || 0) }))} />
                  <Field label="Rating Mix" type="number" value={form.ratingMix} onChange={(v) => setForm((s) => ({ ...s, ratingMix: Number(v || 0) }))} />
                </div>
                <label className="block">
                  <span className="text-xs uppercase tracking-wider text-text-secondary">Комментарий администратора</span>
                  <textarea value={form.adminComment} onChange={(e) => setForm((s) => ({ ...s, adminComment: e.target.value }))} className="mt-1 min-h-24 w-full rounded-xl border border-white/20 bg-surface px-3 py-2" />
                </label>
              </div>
            </div>
            {formError ? <p className="mt-4 text-sm text-red-200">{formError}</p> : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="submit" disabled={loading || Boolean(formError)} className="rounded-2xl bg-[#FF9500] px-6 py-3 text-lg font-bold text-surface shadow-lg shadow-orange-500/30 disabled:opacity-50">
                🏐 {loading ? 'Сохраняем...' : 'Сохранить игрока'}
              </button>
              <button type="button" onClick={() => setForm(emptyForm)} className="rounded-2xl border border-white/20 px-6 py-3 text-lg">Сбросить</button>
            </div>
          </form>
        </div>
      ) : null}

      {message ? <div className="fixed bottom-5 left-5 z-50 rounded-2xl border border-emerald-300/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100 shadow-xl">✓ {message}</div> : null}
    </div>
  );
}

function Chip({ active, tone = 'border-orange-400/40 text-orange-100 bg-orange-500/10', onClick, children }: { active: boolean; tone?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1.5 text-sm transition hover:border-cyan-300 hover:bg-cyan-500/15 ${active ? tone : 'border-white/15 bg-white/5 text-text-secondary'}`}>
      {children}
    </button>
  );
}

function RangeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label} type="number" value={value} onChange={onChange} />;
}

function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-text-secondary">{label}</span>
      <input required={required} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-white/20 bg-surface px-3 py-2" />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-text-secondary">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-white/20 bg-surface px-3 py-2">
        {options.map(([key, labelText]) => <option key={key} value={key}>{labelText}</option>)}
      </select>
    </label>
  );
}

function Avatar({ row }: { row: Row }) {
  if (row.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={row.photoUrl} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-orange-300/30" />;
  }
  return <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-orange-500/40 to-cyan-500/30 text-xl">🏐</div>;
}

function Badge({ text }: { text: string }) {
  return <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs">{text}</span>;
}
