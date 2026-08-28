'use client';

import Image, { getImageProps } from 'next/image';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { GalleryAlbum, GalleryPhoto } from '@/lib/vk-gallery-core';

const LOCAL_PLACEHOLDERS = Array.from(
  { length: 6 },
  (_, index) => `/images/landing/tough-tournaments/tournament-${index + 1}.jpg`,
);
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  albums: GalleryAlbum[];
  isFallback: boolean;
}

function albumCountLabel(count: number) {
  if (count === 1) return '1 АЛЬБОМ';
  if (count >= 2 && count <= 4) return `${count} АЛЬБОМА`;
  return `${count} АЛЬБОМОВ`;
}

function mosaicClass(count: number, index: number) {
  if (count === 1) return 'md:col-span-12 md:row-span-2';
  if (count === 2) return 'md:col-span-6 md:row-span-2';
  if (count === 3) return index === 0 ? 'md:col-span-6 md:row-span-2' : 'md:col-span-6';
  if (count === 4) {
    if (index === 0) return 'md:col-span-6 md:row-span-2';
    if (index === 1) return 'md:col-span-6';
    return 'md:col-span-3';
  }
  if (index === 0) return 'md:col-span-6 md:row-span-2';
  if (count === 5) return 'md:col-span-3';
  return index <= 2 ? 'md:col-span-3' : 'md:col-span-2';
}

function formatAlbumDate(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function prefetchOptimizedPhoto(photo: GalleryPhoto) {
  const { props } = getImageProps({
    src: photo.fullSrc,
    alt: '',
    width: photo.width,
    height: photo.height,
    sizes: '100vw',
  });
  const image = new window.Image();
  if (props.srcSet) image.srcset = props.srcSet;
  image.sizes = props.sizes || '100vw';
  image.src = props.src;
}

export default function TournamentGallery({ albums, isFallback }: Props) {
  const [albumIndex, setAlbumIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());
  const [shareStatus, setShareStatus] = useState('');
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    startOffsetX: number;
    startOffsetY: number;
    pinchDistance: number;
    pinchScale: number;
  } | null>(null);
  const lastTapRef = useRef(0);

  const activeAlbum = albums[Math.min(albumIndex, Math.max(0, albums.length - 1))];
  const previewPhotos = useMemo(() => activeAlbum?.photos.slice(0, 6) ?? [], [activeAlbum]);
  const currentPhoto = lightboxIndex == null ? null : activeAlbum?.photos[lightboxIndex] ?? null;
  const isLightboxOpen = lightboxIndex != null;

  const resetZoom = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    pointersRef.current.clear();
    gestureRef.current = null;
  };

  const closeLightbox = () => {
    setLightboxIndex(null);
    setShareStatus('');
    resetZoom();
  };

  const showPhoto = (index: number) => {
    if (!activeAlbum?.photos.length) return;
    setLightboxIndex((index + activeAlbum.photos.length) % activeAlbum.photos.length);
    setShareStatus('');
    resetZoom();
  };

  useEffect(() => {
    if (!isLightboxOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [isLightboxOpen]);

  useEffect(() => {
    if (lightboxIndex == null) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLightbox();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        showPhoto(lightboxIndex - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        showPhoto(lightboxIndex + 1);
      } else if (event.key === 'Tab') {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // Navigation helpers intentionally use the current album and slide snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex, activeAlbum]);

  useEffect(() => {
    if (lightboxIndex == null || !activeAlbum || activeAlbum.photos.length < 2) return;
    const count = activeAlbum.photos.length;
    const neighbors = [activeAlbum.photos[(lightboxIndex - 1 + count) % count], activeAlbum.photos[(lightboxIndex + 1) % count]];
    neighbors.forEach(prefetchOptimizedPhoto);
  }, [activeAlbum, lightboxIndex]);

  useEffect(() => {
    if (!shareStatus) return undefined;
    const timer = window.setTimeout(() => setShareStatus(''), 2500);
    return () => window.clearTimeout(timer);
  }, [shareStatus]);

  if (!activeAlbum || activeAlbum.photos.length === 0) return null;

  const markBroken = (key: string) => {
    setBrokenImages((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
  };

  const imageSource = (photo: GalleryPhoto, index: number, variant: 'thumb' | 'full') => {
    const key = `${activeAlbum.id}:${photo.id}:${variant}`;
    return brokenImages.has(key)
      ? LOCAL_PLACEHOLDERS[index % LOCAL_PLACEHOLDERS.length]
      : variant === 'thumb'
        ? photo.thumbSrc
        : photo.fullSrc;
  };

  const shareCurrentPhoto = async () => {
    if (!currentPhoto) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: activeAlbum.title, text: currentPhoto.alt, url: currentPhoto.vkUrl });
        setShareStatus('Ссылка отправлена');
      } else {
        await navigator.clipboard.writeText(currentPhoto.vkUrl);
        setShareStatus('Ссылка скопирована');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareStatus('Не удалось поделиться ссылкой');
    }
  };

  const clampOffset = (x: number, y: number, nextScale: number) => {
    const viewport = viewportRef.current;
    if (!viewport || nextScale <= 1) return { x: 0, y: 0 };
    const maxX = (viewport.clientWidth * (nextScale - 1)) / 2;
    const maxY = (viewport.clientHeight * (nextScale - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  const toggleZoom = () => {
    if (scale > 1) resetZoom();
    else setScale(2);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(pointersRef.current.values());
    if (points.length === 2) {
      gestureRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        startOffsetX: offset.x,
        startOffsetY: offset.y,
        pinchDistance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        pinchScale: scale,
      };
    } else if (points.length === 1) {
      gestureRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        startOffsetX: offset.x,
        startOffsetY: offset.y,
        pinchDistance: 0,
        pinchScale: scale,
      };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId) || !gestureRef.current) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(pointersRef.current.values());
    if (points.length === 2 && gestureRef.current.pinchDistance > 0) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const nextScale = Math.max(1, Math.min(4, gestureRef.current.pinchScale * (distance / gestureRef.current.pinchDistance)));
      setScale(nextScale);
      setOffset((current) => clampOffset(current.x, current.y, nextScale));
    } else if (points.length === 1 && scale > 1) {
      const deltaX = event.clientX - gestureRef.current.lastX;
      const deltaY = event.clientY - gestureRef.current.lastY;
      setOffset((current) => clampOffset(current.x + deltaX, current.y + deltaY, scale));
      gestureRef.current.lastX = event.clientX;
      gestureRef.current.lastY = event.clientY;
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    pointersRef.current.delete(event.pointerId);
    if (!gesture) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (scale === 1 && Math.abs(deltaX) > 52 && Math.abs(deltaX) > Math.abs(deltaY)) {
      showPhoto((lightboxIndex ?? 0) + (deltaX > 0 ? -1 : 1));
    } else if (event.pointerType === 'touch' && Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) toggleZoom();
      lastTapRef.current = now;
    }
    if (pointersRef.current.size === 0) gestureRef.current = null;
  };

  return (
    <>
      <section className="px-4 py-6 md:px-6 md:py-8" aria-labelledby="tough-tournaments-heading">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-brand">Наши люди. Наш песок. Наши эмоции.</div>
              <h2 id="tough-tournaments-heading" className="mt-2 text-2xl font-black uppercase tracking-[-0.04em] text-white md:text-4xl" style={{ fontFamily: 'Sora, sans-serif' }}>
                Лютые турниры!
              </h2>
            </div>
            <span className="w-fit rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/72">
              VK · {isFallback ? 'ФОТОГАЛЕРЕЯ' : albumCountLabel(albums.length)}
            </span>
          </div>

          {albums.length > 1 ? (
            <div className="mt-5 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Альбомы VK">
              {albums.map((album, index) => {
                const selected = index === albumIndex;
                return (
                  <button
                    key={album.id}
                    type="button"
                    onClick={() => {
                      setAlbumIndex(index);
                      closeLightbox();
                    }}
                    className={`min-h-11 min-w-[76%] snap-start rounded-2xl border px-4 py-3 text-left transition sm:min-w-64 ${selected ? 'border-brand bg-brand/10' : 'border-white/10 bg-white/[0.04] hover:border-white/25'}`}
                    aria-pressed={selected}
                  >
                    <span className="block truncate text-sm font-bold text-white">{album.title}</span>
                    <span className="mt-1 block text-xs text-white/55">
                      {[formatAlbumDate(album.updatedAt), `${album.photoCount} фото`].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">{activeAlbum.title}</div>
              <div className="mt-1 text-xs text-white/55">
                {[formatAlbumDate(activeAlbum.updatedAt), `${activeAlbum.photoCount} фото`].filter(Boolean).join(' · ')}
              </div>
            </div>
            <a href={activeAlbum.vkUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-brand/45 px-4 text-xs font-black uppercase tracking-[0.12em] text-brand transition hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              Весь альбом в VK
            </a>
          </div>

          <div className="mt-4 grid auto-cols-[86%] snap-x snap-mandatory grid-flow-col gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:auto-cols-auto md:auto-rows-[160px] md:snap-none md:grid-flow-row md:grid-cols-12 md:grid-rows-2 md:overflow-visible md:pb-0" aria-label={`Фотографии из альбома «${activeAlbum.title}»`}>
            {previewPhotos.map((photo, index) => {
              const thumbKey = `${activeAlbum.id}:${photo.id}:thumb`;
              const remaining = activeAlbum.photos.length - previewPhotos.length;
              return (
                <button
                  key={photo.id}
                  type="button"
                  onClick={(event) => {
                    openerRef.current = event.currentTarget;
                    showPhoto(index);
                  }}
                  className={`group relative h-[220px] snap-center overflow-hidden rounded-2xl border border-white/10 bg-[#11161F] text-left shadow-[0_12px_30px_rgba(0,0,0,0.2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:h-auto ${mosaicClass(previewPhotos.length, index)}`}
                  aria-label={`Открыть фото ${index + 1} из ${activeAlbum.photos.length}: ${photo.alt}`}
                >
                  <Image
                    src={imageSource(photo, index, 'thumb')}
                    alt={photo.alt}
                    width={photo.width}
                    height={photo.height}
                    sizes="(max-width: 767px) 86vw, (max-width: 1279px) 50vw, 640px"
                    priority={albumIndex === 0 && index === 0}
                    onError={() => markBroken(thumbKey)}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025] motion-reduce:transition-none"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" aria-hidden />
                  <span className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[10px] font-bold tracking-[0.12em] text-white backdrop-blur-sm">
                    {String(index + 1).padStart(2, '0')} / {String(activeAlbum.photos.length).padStart(2, '0')}
                  </span>
                  {remaining > 0 && index === previewPhotos.length - 1 ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-3xl font-black text-white">+{remaining}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-sm leading-6 text-white/55 md:hidden">Листайте фотографии по горизонтали.</p>
        </div>
      </section>

      {currentPhoto && lightboxIndex != null ? createPortal(
        <div
          ref={dialogRef}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 md:p-6"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.94)' }}
          role="dialog"
          aria-modal="true"
          aria-label={`Просмотр альбома «${activeAlbum.title}»`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeLightbox();
          }}
        >
          <div className="flex max-h-full w-full max-w-7xl flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0" style={{ color: '#ffffff' }}>
                <div className="truncate text-sm font-bold">{activeAlbum.title}</div>
                <div className="text-xs text-white/60">{lightboxIndex + 1} / {activeAlbum.photos.length}</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={shareCurrentPhoto} className="inline-flex min-h-11 items-center rounded-full border border-white/20 bg-black/45 px-4 text-sm font-semibold transition hover:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ color: '#ffffff' }} aria-describedby="gallery-share-status">
                  Поделиться
                </button>
                <button ref={closeButtonRef} type="button" onClick={closeLightbox} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/45 text-2xl transition hover:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ color: '#ffffff' }} aria-label="Закрыть галерею">
                  ×
                </button>
              </div>
            </div>

            <div
              ref={viewportRef}
              className="relative flex min-h-0 flex-1 select-none items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-black"
              style={{ touchAction: 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={toggleZoom}
            >
              <Image
                src={imageSource(currentPhoto, lightboxIndex, 'full')}
                alt={currentPhoto.alt}
                width={currentPhoto.width}
                height={currentPhoto.height}
                sizes="100vw"
                priority
                draggable={false}
                onError={() => markBroken(`${activeAlbum.id}:${currentPhoto.id}:full`)}
                className="max-h-[72svh] w-auto max-w-full object-contain transition-transform duration-200 motion-reduce:transition-none"
                style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }}
              />

              {activeAlbum.photos.length > 1 && scale === 1 ? (
                <>
                  <button type="button" onClick={() => showPhoto(lightboxIndex - 1)} className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-xl transition hover:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ color: '#ffffff' }} aria-label="Предыдущее фото">←</button>
                  <button type="button" onClick={() => showPhoto(lightboxIndex + 1)} className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-xl transition hover:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ color: '#ffffff' }} aria-label="Следующее фото">→</button>
                </>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between" style={{ color: 'rgba(255, 255, 255, 0.78)' }}>
              <p className="line-clamp-2">{currentPhoto.alt}</p>
              <a href={currentPhoto.vkUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 flex-shrink-0 items-center text-brand hover:underline">Открыть в VK</a>
            </div>
            <p id="gallery-share-status" className="sr-only" aria-live="polite">{shareStatus}</p>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
