'use client';

import { useMemo, useState } from 'react';
import type { GoAdminSettings, GoGroupView } from '@/lib/go-next/types';
import { buildRosterLevelSummary } from './view-model';

interface GoRosterConfigPanelProps {
  tournamentId: string;
  settings: GoAdminSettings;
  teams: GoGroupView[];   // to detect existing medium teams
  onSettingsUpdated: () => void;
}

type GenderFormat = 'male' | 'female' | 'mixed';
type LevelCount = 2 | 3;

interface Preset {
  label: string;
  genderFormat: GenderFormat;
  levelCount: LevelCount;
  hard: number;
  medium: number;
  lite: number;
}

const PRESETS: Preset[] = [
  { label: 'Микст / 3 уровня', genderFormat: 'mixed', levelCount: 3, hard: 2, medium: 1, lite: 1 },
  { label: 'М/М / 2 уровня', genderFormat: 'male', levelCount: 2, hard: 2, medium: 0, lite: 2 },
  { label: 'Ж/Ж / 2 уровня', genderFormat: 'female', levelCount: 2, hard: 2, medium: 0, lite: 2 },
  { label: 'Ж/Ж / 3 уровня', genderFormat: 'female', levelCount: 3, hard: 1, medium: 2, lite: 1 },
];

const GENDER_LABELS: Record<GenderFormat, string> = {
  male: 'М/М',
  female: 'Ж/Ж',
  mixed: 'Микст',
};

export function GoRosterConfigPanel({
  tournamentId,
  settings,
  teams,
  onSettingsUpdated,
}: GoRosterConfigPanelProps) {
  const [genderFormat, setGenderFormat] = useState<GenderFormat>(
    (settings.teamGenderFormat as GenderFormat) ?? 'mixed',
  );
  const [levelCount, setLevelCount] = useState<LevelCount>(
    (settings.levelCount as LevelCount) ?? 3,
  );
  const [hard, setHard] = useState(settings.groupFormula.hard);
  const [medium, setMedium] = useState(settings.groupFormula.medium);
  const [lite, setLite] = useState(settings.groupFormula.lite);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState('');

  // Detect if there are existing medium teams (blocks switching to 2 levels)
  const hasMediumTeams = useMemo(
    () => teams.some((g) => g.teams.some((t) => t.initialBucket === 'medium')),
    [teams],
  );

  function applyPreset(preset: Preset) {
    setGenderFormat(preset.genderFormat);
    setLevelCount(preset.levelCount);
    setHard(preset.hard);
    setMedium(preset.medium);
    setLite(preset.lite);
    setAlert('');
  }

  function handleLevelCountChange(count: LevelCount) {
    if (count === 2 && hasMediumTeams) {
      setAlert('⛔️ Нельзя переключить: на Medium уровне уже созданы команды. Сначала удалите группы Medium.');
      return;
    }
    setLevelCount(count);
    if (count === 2) setMedium(0);
    setAlert('');
  }

  // Compute group count preview
  const groupCountPreview = useMemo(() => {
    const effectiveMedium = levelCount === 2 ? 0 : medium;
    const slotSize = hard + effectiveMedium + lite;
    if (slotSize === 0) return null;
    // Approximate based on formula: each bucket contributes floor(teamCount/required)
    // We don't know actual team counts here — show formula only
    return { slotSize, hard, medium: effectiveMedium, lite };
  }, [hard, medium, lite, levelCount]);

  const rosterSummary = useMemo(
    () => buildRosterLevelSummary(teams, levelCount),
    [teams, levelCount],
  );

  async function handleSave() {
    setSaving(true);
    setAlert('');
    try {
      const effectiveMedium = levelCount === 2 ? 0 : medium;
      const res = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            ...settings,
            teamGenderFormat: genderFormat,
            levelCount,
            goGroupFormulaHard: hard,
            goGroupFormulaMedium: effectiveMedium,
            goGroupFormulaLite: lite,
          },
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setAlert(data.error ?? 'Ошибка сохранения');
        return;
      }
      onSettingsUpdated();
    } finally {
      setSaving(false);
    }
  }

  const effectiveMedium = levelCount === 2 ? 0 : medium;

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-4">
      <h4 className="text-sm font-semibold text-white">Формат ростера</h4>

      {/* Alert */}
      {alert ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {alert}
        </div>
      ) : null}

      {/* Gender format */}
      <div className="space-y-1">
        <label className="text-xs text-white/50">Формат команд</label>
        <div className="flex gap-2">
          {(['mixed', 'male', 'female'] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setGenderFormat(fmt)}
              className={[
                'rounded-md border px-3 py-1.5 text-xs font-semibold',
                genderFormat === fmt
                  ? 'border-brand/60 bg-brand/20 text-brand'
                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/25',
              ].join(' ')}
            >
              {GENDER_LABELS[fmt]}
            </button>
          ))}
        </div>
      </div>

      {/* Level count */}
      <div className="space-y-1">
        <label className="text-xs text-white/50">Уровни</label>
        <div className="flex gap-2">
          {([2, 3] as const).map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => handleLevelCountChange(count)}
              className={[
                'rounded-md border px-3 py-1.5 text-xs font-semibold',
                levelCount === count
                  ? 'border-brand/60 bg-brand/20 text-brand'
                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/25',
              ].join(' ')}
            >
              {count} уровня
            </button>
          ))}
        </div>
      </div>

      {/* Group template */}
      <div className="space-y-2">
        <label className="text-xs text-white/50">Шаблон группы (команд каждого уровня)</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'hard', label: 'HARD', value: hard, onChange: setHard, disabled: false },
            {
              key: 'medium',
              label: 'MEDIUM',
              value: medium,
              onChange: setMedium,
              disabled: levelCount === 2,
            },
            { key: 'lite', label: 'LITE', value: lite, onChange: setLite, disabled: false },
          ].map(({ key, label, value, onChange, disabled }) => (
            <div
              key={key}
              className={[
                'rounded-md border border-[#1F2A36] bg-[#0B0F14] p-2 text-center transition-opacity',
                disabled ? 'opacity-40' : '',
              ].join(' ')}
            >
              <label className="block text-[10px] text-white/40">{label}</label>
              <input
                type="number"
                min={0}
                max={4}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(Math.max(0, Math.min(4, Number(e.target.value))))}
                className="mt-1 w-full bg-transparent text-center text-lg font-bold text-white focus:outline-none disabled:cursor-not-allowed"
              />
              {teams.length > 0 ? (
                <div className="mt-1 text-[9px] leading-tight">
                  {(() => {
                    const summary = rosterSummary[key as 'hard' | 'medium' | 'lite'];
                    if (!summary.isUsed) {
                      return <span className="text-white/40">Не используется при 2 уровнях · 0 команд</span>;
                    }
                    return (
                      <>
                        <span className="text-white/40">
                          Сетка {summary.gridSize} мест | BYE: {summary.byeCount}
                        </span>{' '}
                        <span className={summary.ok ? 'text-emerald-400' : 'text-amber-400'}>
                          {summary.ok ? 'OK' : 'нет команд'}
                        </span>
                      </>
                    );
                  })()}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      {groupCountPreview ? (
        <div className="rounded-md bg-white/5 px-3 py-2 text-xs font-semibold text-white">
          Шаблон группы: {hard}H
          {levelCount === 3 ? ` + ${effectiveMedium}M` : ''} + {lite}L
          {' · '}Размер группы: {groupCountPreview.slotSize} команд
        </div>
      ) : null}

      {/* Presets */}
      <div className="space-y-1">
        <label className="text-xs text-white/50">Пресеты</label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:border-white/25 hover:text-white"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="w-full rounded-lg border border-brand/60 bg-brand/20 py-2 text-sm font-semibold text-brand disabled:opacity-50"
      >
        {saving ? 'Сохранение...' : 'Сохранить формат'}
      </button>
    </div>
  );
}
