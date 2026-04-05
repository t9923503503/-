"use client";

import { useEffect, useMemo, useState } from "react";
import type { KotcCourtState, KotcPresenceItem } from "../types";

interface CourtSelectionProps {
  courts: Array<{ idx: number; court: KotcCourtState | undefined }>;
  presence: KotcPresenceItem[];
  busy: boolean;
  onClaim: (courtIdx: number) => void;
  onView: (courtIdx: number) => void;
  onBack: () => void;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
}

function getCourtSeat(presence: KotcPresenceItem[], courtIdx: number): KotcPresenceItem | null {
  return presence.find((item) => item.courtIdx === courtIdx && item.role === "judge") || null;
}

function CourtCard({
  idx,
  court,
  presence,
  busy,
  onClaim,
  onView,
}: {
  idx: number;
  court: KotcCourtState | undefined;
  presence: KotcPresenceItem[];
  busy: boolean;
  onClaim: (courtIdx: number) => void;
  onView: (courtIdx: number) => void;
}) {
  const occupant = getCourtSeat(presence, idx);
  const occupied = Boolean(occupant?.isOnline ?? occupant);
  const statusTone = occupied
    ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";

  return (
    <div className="overflow-hidden rounded-[22px] border border-white/10 bg-black/20">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.26em] text-text-secondary">Корт</div>
          <div className="mt-1 font-heading text-3xl uppercase tracking-[0.08em] text-text-primary">{idx}</div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${statusTone}`}>
          {occupied ? "Занят" : "Свободен"}
        </span>
      </div>

      <div className="grid gap-4 px-4 py-4 sm:px-5 sm:py-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-text-secondary">Судья</div>
            <div className="mt-2 text-sm text-text-primary">
              {occupant?.displayName || (occupied ? "Другой судья" : "Свободное место")}
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-text-secondary">Раунд</div>
            <div className="mt-2 text-2xl font-heading text-text-primary">{court?.roundIdx ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-text-secondary">Таймер</div>
            <div className="mt-2 text-sm uppercase tracking-[0.18em] text-text-primary">{court?.timerStatus || "idle"}</div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={busy || occupied}
            onClick={() => onClaim(idx)}
            className="rounded-2xl border border-brand/40 bg-brand/20 px-4 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-brand-light transition hover:bg-brand/30 disabled:opacity-40"
          >
            {occupied ? "Корт занят" : "Судить этот корт"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onView(idx)}
            className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-text-primary transition hover:bg-white/10 disabled:opacity-40"
          >
            Смотреть корт
          </button>
        </div>
      </div>
    </div>
  );
}

export function CourtSelection({
  courts,
  presence,
  busy,
  onClaim,
  onView,
  onBack,
  displayName,
  onDisplayNameChange,
}: CourtSelectionProps) {
  const [focusedCourtIdx, setFocusedCourtIdx] = useState<number>(courts[0]?.idx ?? 1);

  useEffect(() => {
    if (courts.some((item) => item.idx === focusedCourtIdx)) return;
    setFocusedCourtIdx(courts[0]?.idx ?? 1);
  }, [courts, focusedCourtIdx]);

  const focusedCourt = useMemo(
    () => courts.find((item) => item.idx === focusedCourtIdx) ?? courts[0],
    [courts, focusedCourtIdx],
  );

  return (
    <section className="mx-auto w-full max-w-5xl px-2 py-4 sm:px-4 sm:py-6">
      <div className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.15),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4 shadow-[0_24px_100px_rgba(0,0,0,0.32)] sm:p-6">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.34em] text-brand-light/80">Court Claim</div>
            <h2 className="mt-2 font-heading text-3xl uppercase tracking-[0.08em] text-text-primary sm:text-4xl">
              Выбор корта
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Один судья = один корт. На телефоне сначала выберите корт в верхней полосе, потом сразу входите в работу.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_auto]">
            <input
              type="text"
              placeholder="Имя судьи"
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-text-primary outline-none transition focus:border-brand/50"
            />
            <button
              type="button"
              onClick={onBack}
              disabled={busy}
              className="rounded-full border border-white/15 px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-text-primary transition hover:border-white/30 disabled:opacity-50"
            >
              Назад
            </button>
          </div>
        </div>

        <div className="mt-5 sm:hidden">
          <div className="grid grid-cols-4 gap-2">
            {courts.map(({ idx }) => {
              const occupied = Boolean(getCourtSeat(presence, idx)?.isOnline ?? getCourtSeat(presence, idx));
              const active = idx === focusedCourtIdx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setFocusedCourtIdx(idx)}
                  className={`rounded-2xl border px-2 py-3 text-center transition ${
                    active
                      ? "border-brand/50 bg-brand/15 text-brand-light"
                      : occupied
                        ? "border-amber-500/25 bg-amber-500/10 text-amber-100"
                        : "border-white/10 bg-white/5 text-text-secondary"
                  }`}
                >
                  <div className="text-lg font-semibold leading-none">{idx}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.18em]">корт</div>
                </button>
              );
            })}
          </div>

          {focusedCourt ? (
            <div className="mt-3">
              <CourtCard
                idx={focusedCourt.idx}
                court={focusedCourt.court}
                presence={presence}
                busy={busy}
                onClaim={onClaim}
                onView={onView}
              />
            </div>
          ) : null}
        </div>

        <div className="mt-5 hidden gap-3 sm:grid xl:grid-cols-2">
          {courts.map(({ idx, court }) => (
            <CourtCard
              key={idx}
              idx={idx}
              court={court}
              presence={presence}
              busy={busy}
              onClaim={onClaim}
              onView={onView}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
