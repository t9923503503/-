'use client';

export function GoCourtTabs({
  courts,
  currentCourt,
  onChange,
}: {
  courts: Array<{ courtNo: number; label: string }>;
  currentCourt: number;
  onChange: (courtNo: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {courts.map((court) => {
        const active = court.courtNo === currentCourt;
        return (
          <button
            key={court.courtNo}
            type="button"
            onClick={() => onChange(court.courtNo)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              active
                ? 'border-brand/60 bg-brand/20 text-brand'
                : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25'
            }`}
          >
            {court.label || `К${court.courtNo}`}
          </button>
        );
      })}
    </div>
  );
}
