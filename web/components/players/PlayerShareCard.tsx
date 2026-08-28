'use client';

import { useEffect, useState } from 'react';
import { METRIKA_GOALS, reachMetrikaGoal } from '@/lib/metrika-goals';

interface PlayerShareCardProps {
  sharePath: string;
  playerName: string;
  rank: number | null;
  rating: number;
  rankDelta: number | null;
}

function movementText(delta: number | null) {
  if (delta == null) return 'Новое имя в рейтинге';
  if (delta > 0) return `Подъём на ${delta} поз.`;
  if (delta < 0) return `Изменение на ${Math.abs(delta)} поз. вниз`;
  return 'Позиция сохранена';
}

export default function PlayerShareCard({
  sharePath,
  playerName,
  rank,
  rating,
  rankDelta,
}: PlayerShareCardProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardPath = `${sharePath}/opengraph-image`;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function shareProfile() {
    const url = new URL(sharePath, window.location.origin).toString();
    const nativeShare = typeof navigator.share === 'function';

    reachMetrikaGoal(METRIKA_GOALS.shareClick, {
      shareType: 'player_card',
      playerId: sharePath.split('/').filter(Boolean).slice(-1)[0] || '',
      shareMethod: nativeShare ? 'native' : 'clipboard',
    });

    try {
      if (nativeShare) {
        await navigator.share({
          title: `${playerName} | LPVOLLEY.RU`,
          text: `${playerName}: ${rank ? `#${rank}` : 'рейтинг формируется'}, ${rating} очков`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // A cancelled native share is not an error state for the visitor.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--profile-border)] bg-[var(--profile-card)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--profile-muted-strong)] transition hover:border-[var(--profile-accent)] hover:text-[var(--profile-text)]"
      >
        Поделиться карточкой
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-share-title"
            className="w-full max-w-[680px] rounded-[28px] border border-white/12 bg-[#101010] p-3 shadow-[0_30px_100px_rgba(0,0,0,0.65)] sm:p-5"
          >
            <div className="flex items-start justify-between gap-3 px-1 pb-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ff8d3a]">Готово для сторис и чатов</div>
                <h2 id="player-share-title" className="mt-1 text-xl font-black text-white">Карточка игрока</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть карточку"
                className="grid h-11 w-11 place-items-center rounded-full border border-white/10 text-xl text-white/70 transition hover:bg-white/8 hover:text-white"
              >
                ×
              </button>
            </div>

            {/* The same image is used by social networks as the link preview. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- the route already returns the final social-card image. */}
            <img
              src={cardPath}
              alt={`Карточка игрока ${playerName}`}
              className="aspect-[1200/630] w-full rounded-[20px] border border-white/10 bg-[#181818] object-cover"
            />

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="px-1 text-xs text-white/50">
                {rank ? `Место #${rank}` : 'Рейтинг формируется'} · {rating} очков · {movementText(rankDelta)}
              </p>
              <div className="flex gap-2">
                <a
                  href={cardPath}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/12 px-4 text-sm font-bold text-white/75 sm:flex-none"
                >
                  Открыть
                </a>
                <button
                  type="button"
                  onClick={shareProfile}
                  aria-live="polite"
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#ff6a00] px-5 text-sm font-black text-white shadow-[0_10px_28px_rgba(255,106,0,0.28)] sm:flex-none"
                >
                  {copied ? 'Ссылка скопирована' : 'Поделиться'}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
