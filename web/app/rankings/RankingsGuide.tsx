'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

const slides = [
  {
    src: '/images/rankings/guide/personal-meetings-overview.png',
    width: 1122,
    height: 1402,
    alt: 'Как открыть личные встречи, посмотреть рекорды и выбрать сортировку',
  },
  {
    src: '/images/rankings/guide/personal-meetings-list.png',
    width: 1092,
    height: 1440,
    alt: 'Как переключить личные встречи в режим списка и выбрать игрока',
  },
  {
    src: '/images/rankings/guide/personal-meetings-details.png',
    width: 1024,
    height: 1536,
    alt: 'История личных встреч: игры вместе, против и результаты матчей',
  },
  {
    src: '/images/rankings/guide/personal-meetings-history.png',
    width: 997,
    height: 1577,
    alt: 'Подробная история личных встреч двух игроков',
  },
] as const;

export default function RankingsGuide() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  const previous = useCallback(
    () => setIndex((current) => (current - 1 + slides.length) % slides.length),
    [],
  );
  const next = useCallback(() => setIndex((current) => (current + 1) % slides.length), []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') previous();
      if (event.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [close, next, open, previous]);

  const slide = slides[index];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#ff6a00]/55 bg-[#1f1207] px-4 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-[#ff8a38] transition hover:border-[#ff6a00] hover:bg-[#2b1708] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26c6ff] sm:text-xs"
        aria-haspopup="dialog"
        aria-label="Новый гайд: личные встречи игроков"
      >
        <span aria-hidden="true" className="rounded-full bg-[#ff6a00] px-2 py-1 text-[9px] text-white">
          Новое
        </span>
        Личные встречи
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-2 backdrop-blur-md sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="rankings-guide-title"
            className="flex max-h-[96dvh] w-full max-w-[980px] flex-col overflow-hidden rounded-[24px] border border-white/12 bg-[#0b0b0b] shadow-[0_30px_100px_rgba(0,0,0,0.7)] sm:rounded-[32px]"
          >
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
              <div className="min-w-0">
                <h2 id="rankings-guide-title" className="truncate text-base font-black uppercase tracking-[0.06em] text-white sm:text-xl">
                  Личные встречи — новый гайд
                </h2>
                <p className="mt-0.5 text-xs text-white/60 sm:text-sm">
                  Слайд {index + 1} из {slides.length}
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/12 bg-white/5 text-xl text-white/70 transition hover:border-[#ff6a00]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26c6ff]"
                aria-label="Закрыть гайд о личных встречах"
              >
                ×
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-auto bg-[#06080d] p-2 sm:p-4">
              <Image
                key={slide.src}
                src={slide.src}
                width={slide.width}
                height={slide.height}
                alt={slide.alt}
                className="mx-auto h-auto max-h-[calc(96dvh-10.5rem)] w-auto max-w-full rounded-xl object-contain sm:rounded-2xl"
                sizes="(max-width: 640px) 96vw, 920px"
                priority={index === 0}
              />
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-3 sm:px-5">
              <button
                type="button"
                onClick={previous}
                className="min-h-11 rounded-full border border-white/12 px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-white/65 transition hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26c6ff]"
                aria-label="Предыдущий слайд"
              >
                ← Назад
              </button>
              <div className="flex items-center" aria-label="Выбор слайда">
                {slides.map((item, slideIndex) => (
                  <button
                    key={item.src}
                    type="button"
                    onClick={() => setIndex(slideIndex)}
                    className="group grid h-11 w-9 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26c6ff]"
                    aria-label={`Открыть слайд ${slideIndex + 1}`}
                    aria-current={slideIndex === index ? 'step' : undefined}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2.5 rounded-full transition-all ${
                        slideIndex === index ? 'w-7 bg-[#ff6a00]' : 'w-2.5 bg-white/25 group-hover:bg-white/50'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={next}
                className="min-h-11 rounded-full border border-[#ff6a00]/55 bg-[#1f1207] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#ff8a38] transition hover:border-[#ff6a00] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26c6ff]"
                aria-label="Следующий слайд"
              >
                Далее →
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
