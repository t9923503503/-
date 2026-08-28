'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface GalleryImage {
  src: string;
  thumbnailSrc?: string;
  alt: string;
  caption?: string;
}

interface Props {
  images: GalleryImage[];
}

const AUTOPLAY_MS = 5000;

export default function FinishedTournamentGallery({ images }: Props) {
  const safeImages = useMemo(() => images.filter((image) => Boolean(image?.src)), [images]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (safeImages.length <= 1 || isPaused || isLightboxOpen) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev === safeImages.length - 1 ? 0 : prev + 1));
    }, AUTOPLAY_MS);

    return () => window.clearInterval(timer);
  }, [isLightboxOpen, isPaused, safeImages.length]);

  useEffect(() => {
    if (!isLightboxOpen) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLightboxOpen(false);
        return;
      }
      if (event.key === 'ArrowLeft') {
        setActiveIndex((prev) => (prev === 0 ? safeImages.length - 1 : prev - 1));
        return;
      }
      if (event.key === 'ArrowRight') {
        setActiveIndex((prev) => (prev === safeImages.length - 1 ? 0 : prev + 1));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLightboxOpen, safeImages.length]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, safeImages.length - 1)));
  }, [safeImages.length]);

  useEffect(() => {
    if (!isLightboxOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isLightboxOpen]);

  if (safeImages.length === 0) {
    return null;
  }

  const current = safeImages[Math.min(activeIndex, safeImages.length - 1)];
  const goPrev = () => setActiveIndex((prev) => (prev === 0 ? safeImages.length - 1 : prev - 1));
  const goNext = () => setActiveIndex((prev) => (prev === safeImages.length - 1 ? 0 : prev + 1));
  const onTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
    setIsPaused(true);
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    setIsPaused(false);
    if (start == null || safeImages.length <= 1) return;
    const distance = (event.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(distance) < 48) return;
    if (distance > 0) goPrev();
    else goNext();
  };

  return (
    <>
      <div
        className="space-y-4"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="relative overflow-hidden rounded-[28px] border border-white/10 shadow-[0_24px_70px_rgba(0,0,0,0.28)]"
          style={{ backgroundColor: '#050505' }}
        >
          <button
            type="button"
            onClick={() => setIsLightboxOpen(true)}
            className="block w-full text-left"
            aria-label="Открыть галерею на весь экран"
          >
            <img
              src={current.src}
              alt={current.alt}
              className="mx-auto block h-auto max-h-[min(68svh,520px)] w-auto max-w-full object-contain"
              loading="eager"
              sizes="(max-width: 768px) 100vw, 960px"
            />
          </button>

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs font-body text-text-primary/85 backdrop-blur">
                {activeIndex + 1} / {safeImages.length}
              </span>
              {safeImages.length > 1 ? (
                <span className="rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs font-body text-text-primary/75 backdrop-blur">
                  {isPaused ? 'Пауза' : 'Автопоказ'}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setIsLightboxOpen(true)}
              className="pointer-events-auto rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs font-body text-text-primary/85 backdrop-blur transition hover:border-brand/50 hover:text-brand"
            >
              Во весь экран
            </button>
          </div>

          {safeImages.length > 1 ? (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-lg font-semibold text-text-primary transition hover:border-brand/50 hover:text-brand"
                aria-label="Предыдущее фото"
              >
                ←
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-lg font-semibold text-text-primary transition hover:border-brand/50 hover:text-brand"
                aria-label="Следующее фото"
              >
                →
              </button>
            </>
          ) : null}
        </div>

        {current.caption ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-brand/90">Подпись к кадру</div>
            <p className="mt-2 text-sm font-body text-text-primary/90">{current.caption}</p>
          </div>
        ) : null}

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
                    'relative h-[72px] w-24 flex-shrink-0 overflow-hidden rounded-xl border transition md:h-20 md:w-28 md:rounded-2xl',
                    isActive
                      ? 'border-brand shadow-[0_0_0_1px_rgba(255,90,0,0.35)]'
                      : 'border-white/10 hover:border-white/30',
                  ].join(' ')}
                  aria-label={`Показать фото ${index + 1}`}
                  aria-pressed={isActive}
                >
                  <img
                    src={image.thumbnailSrc || image.src}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {isLightboxOpen ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-6"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.94)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр фото турнира"
          onClick={() => setIsLightboxOpen(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="relative flex max-h-full w-full max-w-6xl flex-col gap-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className="rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs font-body"
                style={{ color: '#ffffff' }}
              >
                {activeIndex + 1} / {safeImages.length}
              </div>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                className="rounded-full border border-white/15 bg-black/45 px-3 py-1 text-sm font-body transition hover:border-brand/50 hover:text-brand"
                style={{ color: '#ffffff' }}
                aria-label="Закрыть просмотр"
              >
                Закрыть
              </button>
            </div>

            <div
              className="relative overflow-hidden rounded-[28px] border border-white/10"
              style={{ backgroundColor: '#050505' }}
            >
              <img
                src={current.src}
                alt={current.alt}
                className="mx-auto block h-auto max-h-[78svh] w-auto max-w-full object-contain"
                loading="eager"
                sizes="100vw"
              />

              {safeImages.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-lg font-semibold text-text-primary transition hover:border-brand/50 hover:text-brand"
                    aria-label="Предыдущее фото"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-lg font-semibold text-text-primary transition hover:border-brand/50 hover:text-brand"
                    aria-label="Следующее фото"
                  >
                    →
                  </button>
                </>
              ) : null}
            </div>

            {current.caption ? (
              <div
                className="rounded-2xl border border-white/10 px-4 py-3"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
              >
                <p className="text-sm font-body" style={{ color: '#ffffff' }}>{current.caption}</p>
              </div>
            ) : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
