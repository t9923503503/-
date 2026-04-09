'use client';

import { useEffect, useMemo, useState } from 'react';
import type { KotcNextR2SeedZone, KotcNextZoneKey } from '@/lib/kotc-next';
import { zoneLabel } from '@/lib/kotc-next-config';

interface DraftEntry {
  id: string;
  zone: KotcNextZoneKey;
  courtNo: number;
  pairIdx: number;
  pairLabel: string;
  kingWins: number;
  takeovers: number;
}

function flattenDraft(draft: KotcNextR2SeedZone[]): DraftEntry[] {
  return draft.flatMap((zone) =>
    zone.pairRefs.map((pair) => ({
      id: `${pair.courtNo}:${pair.pairIdx}`,
      zone: zone.zone,
      courtNo: pair.courtNo,
      pairIdx: pair.pairIdx,
      pairLabel: pair.pairLabel,
      kingWins: pair.kingWins,
      takeovers: pair.takeovers,
    })),
  );
}

export function KotcNextR2SeedEditor({
  draft,
  loading,
  message,
  onReload,
  onConfirm,
}: {
  draft: KotcNextR2SeedZone[] | null;
  loading: boolean;
  message?: string | null;
  onReload: () => void;
  onConfirm: (zones: KotcNextR2SeedZone[]) => void;
}) {
  const [entries, setEntries] = useState<DraftEntry[]>([]);

  useEffect(() => {
    setEntries(draft ? flattenDraft(draft) : []);
  }, [draft]);

  const availableZones = useMemo(() => draft?.map((zone) => zone.zone) ?? [], [draft]);

  const groupedZones = useMemo(
    () =>
      availableZones.map((zone) => ({
        zone,
        pairs: entries.filter((entry) => entry.zone === zone),
      })),
    [availableZones, entries],
  );

  const confirmDisabled = !draft || loading || entries.length === 0;

  return (
    <section className="rounded-[24px] border border-[#2d3144] bg-[rgba(11,14,24,0.88)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-[#7d8498]">R2 Seeding</div>
          <h3 className="mt-2 text-xl font-semibold text-white">R2 zone editor</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#aeb6c8]">
            Проверьте автопосев и при необходимости перекиньте пару в другую зону перед запуском R2.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onReload}
            disabled={loading}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Обновляем…' : 'Обновить'}
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm(
                groupedZones.map((zone) => ({
                  zone: zone.zone,
                  pairRefs: zone.pairs.map((pair) => ({
                    courtNo: pair.courtNo,
                    pairIdx: pair.pairIdx,
                    pairLabel: pair.pairLabel,
                    kingWins: pair.kingWins,
                    takeovers: pair.takeovers,
                  })),
                })),
              )
            }
            disabled={confirmDisabled}
            className="rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Подтвердить R2
          </button>
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-[18px] border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          {message}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {groupedZones.map((zone) => (
          <div key={zone.zone} className="rounded-[18px] border border-white/8 bg-[#11111d] p-4">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#8f7c4a]">{zoneLabel(zone.zone)}</div>
            <div className="mt-3 space-y-2">
              {zone.pairs.length ? (
                zone.pairs.map((pair) => (
                  <div
                    key={`${zone.zone}-${pair.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{pair.pairLabel}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#9aa1b3]">
                        R1 court {pair.courtNo} · pair {pair.pairIdx + 1} · KP {pair.kingWins} · TO {pair.takeovers}
                      </div>
                    </div>
                    <select
                      value={pair.zone}
                      onChange={(event) => {
                        const nextZone = event.target.value as KotcNextZoneKey;
                        setEntries((current) =>
                          current.map((entry) => (entry.id === pair.id ? { ...entry, zone: nextZone } : entry)),
                        );
                      }}
                      className="rounded-xl border border-white/10 bg-[#0e111b] px-3 py-2 text-sm text-white outline-none transition focus:border-[#ffd24a]"
                    >
                      {availableZones.map((value) => (
                        <option key={`${pair.id}-${value}`} value={value}>
                          {zoneLabel(value)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-[#7d8498]">
                  В этой зоне пока нет пар.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
