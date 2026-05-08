import type { RegistrationEntry } from '@/lib/types';

interface Props {
  registrations: RegistrationEntry[];
  capacity: number;
  participantCount: number;
  waitlistCount: number;
  spotsLeft: number | null | undefined;
}

function genderLabel(g: string) {
  if (g === 'M') return 'М';
  if (g === 'W') return 'Ж';
  return g;
}

export default function RegisteredParticipantsList({
  registrations,
  capacity,
  participantCount,
  waitlistCount,
  spotsLeft,
}: Props) {
  const spots = spotsLeft ?? Math.max(0, capacity - participantCount);
  const isFull = spots <= 0;

  return (
    <div className="mt-8 rounded-xl border border-white/10 bg-surface-light/20 p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl text-text-primary tracking-wide">
          Зарегистрированы
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-body text-sm text-text-secondary">
            {participantCount}/{capacity}
          </span>
          {isFull ? (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-body font-semibold text-amber-300">
              Мест нет
            </span>
          ) : (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-body font-semibold text-emerald-300">
              {spots === 1 ? '1 место' : `${spots} мест${spots < 5 ? 'а' : ''}`}
            </span>
          )}
        </div>
      </div>

      {registrations.length === 0 ? (
        <p className="mt-4 font-body text-sm text-text-secondary">
          Пока нет одобренных участников.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-white/5">
          {registrations.map((entry, i) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-5 text-right font-body text-xs text-text-secondary shrink-0">
                  {i + 1}
                </span>
                <span className="font-body text-sm text-text-primary truncate">
                  {entry.name}
                </span>
                <span className="shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-body text-[11px] text-text-secondary">
                  {genderLabel(entry.gender)}
                </span>
              </div>
              {entry.formatRating != null && entry.formatRating > 0 ? (
                <span className="shrink-0 font-body text-sm font-semibold text-brand">
                  {entry.formatRating}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {waitlistCount > 0 && (
        <div className="mt-5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <span className="font-body text-sm text-amber-300">
            Лист ожидания: {waitlistCount}{' '}
            {waitlistCount === 1 ? 'человек' : waitlistCount < 5 ? 'человека' : 'человек'}
          </span>
        </div>
      )}
    </div>
  );
}
