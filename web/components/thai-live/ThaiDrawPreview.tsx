'use client';

import type { ThaiDrawPreview as ThaiDrawPreviewModel } from '@/lib/thai-live/types';

export function ThaiDrawPreview({
  preview,
  loading,
  disabled,
  message,
  onShuffle,
  onConfirm,
}: {
  preview: ThaiDrawPreviewModel | null;
  loading?: boolean;
  disabled?: boolean;
  message?: string | null;
  onShuffle: () => void;
  onConfirm: () => void;
}) {
  return (
    <section className="rounded-[24px] border border-[#3a3016] bg-[linear-gradient(180deg,rgba(20,18,32,0.98),rgba(12,12,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">R1 Draw Preview</div>
          <h2 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">Жеребьёвка по кортам</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#c7cada]/78">
            Перед запуском R1 можно несколько раз перестроить расклад и только потом материализовать Thai Next state.
          </p>
        </div>
        {preview ? (
          <span className="rounded-full border border-[#4b3c15] bg-[#1b160d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ffd24a]">
            Seed {preview.seed}
          </span>
        ) : null}
      </div>

      {message ? (
        <div className="mt-4 rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#c7cada]">
          {message}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onShuffle}
          disabled={loading || disabled}
          className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Перемешиваем...' : 'Перемешать заново'}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading || disabled || !preview}
          className="inline-flex rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Подтвердить жеребьёвку
        </button>
      </div>

      {preview ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {preview.courts.map((court) => (
            <article
              key={`preview-court-${court.courtNo}`}
              className="rounded-[20px] border border-white/8 bg-[#10101a] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-semibold text-white">Court {court.courtLabel}</div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">
                  {court.players.length} players
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {court.players.map((player) => (
                  <div
                    key={`${court.courtNo}-${player.playerId}`}
                    className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2"
                  >
                    <div className="text-sm font-semibold text-white">{player.playerName}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[#7d8498]">
                      {player.role === 'primary' ? 'Primary' : 'Secondary'} • {player.gender}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
