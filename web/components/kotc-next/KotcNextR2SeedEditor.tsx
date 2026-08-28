'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KotcNextR2SeedZone, KotcNextZoneKey } from '@/lib/kotc-next/types';
import { zoneLabel } from '@/lib/kotc-next-config';

interface DraftEntry {
  id: string;
  zone: KotcNextZoneKey;
  courtNo: number;
  pairIdx: number;
  pairLabel: string;
  kingWins: number;
  takeovers: number;
  longestKingRun: number;
  firstLongestKingRunOrder: number | null;
  primaryPlayerId?: string | null;
  primaryPlayerName?: string;
  primaryGender?: 'M' | 'W' | null;
  secondaryPlayerId?: string | null;
  secondaryPlayerName?: string;
  secondaryGender?: 'M' | 'W' | null;
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
      longestKingRun: pair.longestKingRun ?? 0,
      firstLongestKingRunOrder: pair.firstLongestKingRunOrder ?? null,
      primaryPlayerId: pair.primaryPlayerId,
      primaryPlayerName: pair.primaryPlayerName,
      primaryGender: pair.primaryGender,
      secondaryPlayerId: pair.secondaryPlayerId,
      secondaryPlayerName: pair.secondaryPlayerName,
      secondaryGender: pair.secondaryGender,
    })),
  );
}

function formatRunMeta(pair: Pick<DraftEntry, 'longestKingRun' | 'firstLongestKingRunOrder'>): string {
  const run = pair.longestKingRun ?? 0;
  const order = pair.firstLongestKingRunOrder ?? null;
  if (!run) return '\u0421\u0435\u0440\u0438\u044f 0';
  return order
    ? `\u0421\u0435\u0440\u0438\u044f ${run} · \u043f\u0435\u0440\u0432\u0430\u044f #${order}`
    : `\u0421\u0435\u0440\u0438\u044f ${run}`;
}

const R2_SEEDING_LABEL = '\u041f\u043e\u0441\u0435\u0432 R2';
const R2_ZONE_EDITOR_TITLE = '\u0420\u0435\u0434\u0430\u043a\u0442\u043e\u0440 \u0437\u043e\u043d R2';
const R2_ZONE_EDITOR_TEXT =
  '\u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0430\u0432\u0442\u043e\u043f\u043e\u0441\u0435\u0432 \u0438 \u043f\u0440\u0438 ' +
  '\u043d\u0435\u043e\u0431\u0445\u043e\u0434\u0438\u043c\u043e\u0441\u0442\u0438 \u043f\u0435\u0440\u0435\u043a\u0438\u043d\u044c\u0442\u0435 \u043f\u0430\u0440\u0443 ' +
  '\u0432 \u0434\u0440\u0443\u0433\u0443\u044e \u0437\u043e\u043d\u0443 \u043f\u0435\u0440\u0435\u0434 \u0437\u0430\u043f\u0443\u0441\u043a\u043e\u043c R2.';
const RELOAD_LABEL = '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c';
const RELOADING_LABEL = '\u041e\u0431\u043d\u043e\u0432\u043b\u044f\u0435\u043c...';
const CONFIRM_R2_LABEL = '\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c R2';
const R1_COURT_LABEL = '\u043a\u043e\u0440\u0442 R1';
const PAIR_LABEL = '\u043f\u0430\u0440\u0430';
const EMPTY_ZONE_LABEL = '\u0412 \u044d\u0442\u043e\u0439 \u0437\u043e\u043d\u0435 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 \u043f\u0430\u0440.';

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
  const [draftDirty, setDraftDirty] = useState(false);
  const [remoteUpdateAvailable, setRemoteUpdateAvailable] = useState(false);
  const sourceFingerprintRef = useRef('');
  const draftDirtyRef = useRef(false);

  useEffect(() => {
    const fingerprint = JSON.stringify(draft ?? []);
    if (draftDirtyRef.current && sourceFingerprintRef.current && sourceFingerprintRef.current !== fingerprint) {
      setRemoteUpdateAvailable(true);
      return;
    }
    setEntries(draft ? flattenDraft(draft) : []);
    sourceFingerprintRef.current = fingerprint;
    setRemoteUpdateAvailable(false);
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
          <div className="text-[10px] uppercase tracking-[0.28em] text-[#7d8498]">{R2_SEEDING_LABEL}</div>
          <h3 className="mt-2 text-xl font-semibold text-white">{R2_ZONE_EDITOR_TITLE}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#aeb6c8]">{R2_ZONE_EDITOR_TEXT}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (draftDirty && !window.confirm('Отменить локальные изменения и загрузить новую версию R2?')) return;
              setDraftDirty(false);
              draftDirtyRef.current = false;
              setRemoteUpdateAvailable(false);
              onReload();
            }}
            disabled={loading}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? RELOADING_LABEL : RELOAD_LABEL}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftDirty(false);
              draftDirtyRef.current = false;
              onConfirm(
                groupedZones.map((zone) => ({
                  zone: zone.zone,
                  pairRefs: zone.pairs.map((pair) => ({
                    courtNo: pair.courtNo,
                    pairIdx: pair.pairIdx,
                    pairLabel: pair.pairLabel,
                    kingWins: pair.kingWins,
                    takeovers: pair.takeovers,
                    longestKingRun: pair.longestKingRun,
                    firstLongestKingRunOrder: pair.firstLongestKingRunOrder,
                    primaryPlayerId: pair.primaryPlayerId,
                    primaryPlayerName: pair.primaryPlayerName,
                    primaryGender: pair.primaryGender,
                    secondaryPlayerId: pair.secondaryPlayerId,
                    secondaryPlayerName: pair.secondaryPlayerName,
                    secondaryGender: pair.secondaryGender,
                  })),
                })),
              );
            }}
            disabled={confirmDisabled}
            className="rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {CONFIRM_R2_LABEL}
          </button>
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-[18px] border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          {message}
        </div>
      ) : null}
      {remoteUpdateAvailable ? (
        <div role="status" aria-live="polite" className="mt-4 rounded-[18px] border border-amber-300/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Доступна новая серверная версия. Ваш черновик сохранён; нажмите «Обновить», чтобы заменить его.
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
                        {R1_COURT_LABEL} {pair.courtNo} · {PAIR_LABEL} {pair.pairIdx + 1} · KP {pair.kingWins} ·{' '}
                        {formatRunMeta(pair)} · TO {pair.takeovers}
                      </div>
                    </div>
                    <select
                      value={pair.zone}
                      onChange={(event) => {
                        const nextZone = event.target.value as KotcNextZoneKey;
                        setEntries((current) =>
                          current.map((entry) => (entry.id === pair.id ? { ...entry, zone: nextZone } : entry)),
                        );
                        setDraftDirty(true);
                        draftDirtyRef.current = true;
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
                  {EMPTY_ZONE_LABEL}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
