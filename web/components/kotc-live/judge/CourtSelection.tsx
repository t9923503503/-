"use client";

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
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.18),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.32)]">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.4em] text-brand-light/80">Court Claim</div>
            <h2 className="mt-3 font-heading text-4xl uppercase tracking-[0.08em] text-text-primary">Choose Your Lane</h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              Old KOTC principle stays intact: one judge, one court, one clear surface. Take a free lane to work, or
              switch to viewer mode if you only need the feed.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,280px)_auto]">
            <input
              type="text"
              placeholder="Judge tag (optional)"
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
              Back
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {courts.map(({ idx, court }) => {
            const occupant = getCourtSeat(presence, idx);
            const occupied = Boolean(occupant?.isOnline ?? occupant);
            const statusTone = occupied
              ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";

            return (
              <div key={idx} className="overflow-hidden rounded-[24px] border border-white/10 bg-black/20">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.32em] text-text-secondary">Court</div>
                    <div className="mt-1 font-heading text-3xl uppercase tracking-[0.08em] text-text-primary">{idx}</div>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${statusTone}`}>
                    {occupied ? "Occupied" : "Ready"}
                  </span>
                </div>

                <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
                      <div className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">Judge</div>
                      <div className="mt-2 text-sm text-text-primary">
                        {occupant?.displayName || (occupied ? "Another judge" : "Open seat")}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
                      <div className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">Round</div>
                      <div className="mt-2 text-2xl font-heading text-text-primary">{court?.roundIdx ?? 0}</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
                      <div className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">Timer</div>
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
                      {occupied ? "Seat Taken" : "Take Judge Seat"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onView(idx)}
                      className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                    >
                      Watch This Court
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
