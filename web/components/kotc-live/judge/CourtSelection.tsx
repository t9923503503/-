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
  onDisplayNameChange
}: CourtSelectionProps) {
  return (
    <section className="mt-5 w-full max-w-4xl mx-auto">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="font-heading text-3xl text-text-primary tracking-wide">Choose Court</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Your Name (optional)"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            className="rounded-lg border border-white/10 bg-surface/60 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/50 w-full sm:w-48"
          />
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-text-primary hover:border-brand/40 disabled:opacity-50 whitespace-nowrap"
          >
            Back
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {courts.map(({ idx }) => {
          const occupant = getCourtSeat(presence, idx);
          const occupied = Boolean(occupant?.isOnline ?? occupant);

          return (
            <div key={idx} className="rounded-xl border border-white/10 bg-surface-light/30 p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between">
                  <div className="font-heading text-2xl text-text-primary">Court {idx}</div>
                  <span className={`text-xs px-2 py-1 rounded border ${occupied ? "bg-amber-500/10 text-amber-200 border-amber-500/20" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"}`}>
                    {occupied ? `Occupied by ${occupant?.displayName || "another judge"}` : "Free to Claim"}
                  </span>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3 mt-auto">
                <button
                  type="button"
                  disabled={busy || occupied}
                  onClick={() => onClaim(idx)}
                  className="flex-1 rounded-lg border border-brand/40 bg-brand/20 px-3 py-3 text-sm font-semibold text-brand-light disabled:opacity-40 hover:bg-brand/30 transition-colors"
                >
                  {occupied ? "Occupied" : "Claim as Judge"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onView(idx)}
                  className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-3 text-sm font-semibold text-text-primary disabled:opacity-40 hover:bg-white/10 transition-colors"
                >
                  Viewer Mode
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
