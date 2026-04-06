'use client';

import { useMemo, useState } from 'react';

interface GalleryImage {
  src: string;
  alt: string;
}

interface Props {
  images: GalleryImage[];
}

export default function FinishedTournamentGallery({ images }: Props) {
  const safeImages = useMemo(() => images.filter((image) => Boolean(image?.src)), [images]);
  const [activeIndex, setActiveIndex] = useState(0);

  if (safeImages.length === 0) {
    return null;
  }

  const current = safeImages[Math.min(activeIndex, safeImages.length - 1)];
  const goPrev = () => setActiveIndex((prev) => (prev === 0 ? safeImages.length - 1 : prev - 1));
  const goNext = () => setActiveIndex((prev) => (prev === safeImages.length - 1 ? 0 : prev + 1));

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/40 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        <img
          src={current.src}
          alt={current.alt}
          className="block h-[300px] w-full object-contain bg-black/70 md:h-[520px]"
          loading="eager"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 py-4">
          <span className="rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs font-body text-text-primary/85 backdrop-blur">
            {activeIndex + 1} / {safeImages.length}
          </span>
          <a
            href={current.src}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs font-body text-text-primary/85 backdrop-blur transition hover:border-brand/50 hover:text-brand"
          >
            Открыть кадр
          </a>
        </div>

        {safeImages.length > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-black/55 px-3 py-2 text-lg font-semibold text-text-primary transition hover:border-brand/50 hover:text-brand"
              aria-label="Предыдущее фото"
            >
              ←
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-black/55 px-3 py-2 text-lg font-semibold text-text-primary transition hover:border-brand/50 hover:text-brand"
              aria-label="Следующее фото"
            >
              →
            </button>
          </>
        ) : null}
      </div>

      {safeImages.length > 1 ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {safeImages.map((image, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={image.src}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={[
                  'relative h-20 w-28 flex-shrink-0 overflow-hidden rounded-2xl border transition',
                  isActive
                    ? 'border-brand shadow-[0_0_0_1px_rgba(255,90,0,0.35)]'
                    : 'border-white/10 hover:border-white/30',
                ].join(' ')}
                aria-label={`Показать фото ${index + 1}`}
                aria-pressed={isActive}
              >
                <img src={image.src} alt="" className="h-full w-full object-cover" loading="lazy" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
