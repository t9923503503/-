'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Notice = { type: 'success' | 'error'; text: string } | null;

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MULTIPART_OVERHEAD_BYTES = 32 * 1024;
const SAFE_REQUEST_BYTES = 380 * 1024;
const MAX_UPLOAD_BYTES = SAFE_REQUEST_BYTES - MULTIPART_OVERHEAD_BYTES;
const OUTPUT_SIZE = 512;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('IMAGE_ENCODE_FAILED')), 'image/jpeg', quality);
  });
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
    image.src = url;
  });
}

function drawCrop(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  zoom: number,
  rotation: number,
  offsetX: number,
  offsetY: number
) {
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('NO_CANVAS_CONTEXT');
  const sideways = Math.abs(rotation % 180) === 90;
  const rotatedWidth = sideways ? image.naturalHeight : image.naturalWidth;
  const rotatedHeight = sideways ? image.naturalWidth : image.naturalHeight;
  const scale = Math.max(OUTPUT_SIZE / rotatedWidth, OUTPUT_SIZE / rotatedHeight) * zoom;

  context.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  context.fillStyle = '#0b1220';
  context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  context.save();
  context.translate(OUTPUT_SIZE / 2 + offsetX, OUTPUT_SIZE / 2 + offsetY);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(scale, scale);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
}

function clampOffset(
  image: HTMLImageElement,
  zoom: number,
  rotation: number,
  offsetX: number,
  offsetY: number
) {
  const sideways = Math.abs(rotation % 180) === 90;
  const rotatedWidth = sideways ? image.naturalHeight : image.naturalWidth;
  const rotatedHeight = sideways ? image.naturalWidth : image.naturalHeight;
  const scale = Math.max(OUTPUT_SIZE / rotatedWidth, OUTPUT_SIZE / rotatedHeight) * zoom;
  const maxX = Math.max(0, (rotatedWidth * scale - OUTPUT_SIZE) / 2);
  const maxY = Math.max(0, (rotatedHeight * scale - OUTPUT_SIZE) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, offsetX)),
    y: Math.max(-maxY, Math.min(maxY, offsetY)),
  };
}

export default function PlayerPhotoUploadForm({
  playerId,
  embedded = false,
  setupReturnTo = null,
}: {
  playerId?: string;
  embedded?: boolean;
  setupReturnTo?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [sourceName, setSourceName] = useState('avatar');
  const [sourceUrl, setSourceUrl] = useState('');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => () => {
    if (sourceUrl.startsWith('blob:')) URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

  useEffect(() => {
    if (!sourceUrl) {
      imageRef.current = null;
      return;
    }
    let active = true;
    loadImage(sourceUrl)
      .then((image) => {
        if (!active) return;
        imageRef.current = image;
        if (canvasRef.current) drawCrop(canvasRef.current, image, 1, 0, 0, 0);
      })
      .catch(() => setNotice({ type: 'error', text: 'Не удалось прочитать изображение.' }));
    return () => { active = false; };
  }, [sourceUrl]);

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;
    const next = clampOffset(image, zoom, rotation, offset.x, offset.y);
    if (next.x !== offset.x || next.y !== offset.y) {
      setOffset(next);
      return;
    }
    drawCrop(canvas, image, zoom, rotation, offset.x, offset.y);
  }, [zoom, rotation, offset]);

  function resetEditor() {
    if (sourceUrl.startsWith('blob:')) URL.revokeObjectURL(sourceUrl);
    setSourceUrl('');
    imageRef.current = null;
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    if (inputRef.current) inputRef.current.value = '';
  }

  async function selectFile(file: File | null) {
    setNotice(null);
    if (!file) return resetEditor();
    if (!ACCEPTED_TYPES.has(file.type)) {
      setNotice({ type: 'error', text: 'Разрешены только JPG, PNG и WEBP.' });
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setNotice({ type: 'error', text: 'Исходный файл превышает 10 MB.' });
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (sourceUrl.startsWith('blob:')) URL.revokeObjectURL(sourceUrl);
    setSourceName(file.name.replace(/\.[^.]+$/, '') || 'avatar');
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setSourceUrl(URL.createObjectURL(file));
  }

  async function createUploadFile(): Promise<File> {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) throw new Error('IMAGE_NOT_READY');
    drawCrop(canvas, image, zoom, rotation, offset.x, offset.y);
    for (const quality of [0.88, 0.8, 0.72, 0.64, 0.56]) {
      const blob = await canvasToJpegBlob(canvas, quality);
      if (blob.size <= MAX_UPLOAD_BYTES) {
        return new File([blob], `${sourceName}.jpg`, { type: 'image/jpeg' });
      }
    }
    throw new Error('FILE_TOO_LARGE');
  }

  async function save() {
    setLoading(true);
    setNotice(null);
    try {
      const uploadFile = await createUploadFile();
      const formData = new FormData();
      formData.append('photo', uploadFile);
      if (playerId) formData.append('playerId', playerId);
      const response = await fetch('/api/auth/photo', { method: 'POST', body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice({ type: 'error', text: data.error || 'Не удалось загрузить фото.' });
        return;
      }
      setNotice({ type: 'success', text: data.message || 'Фото обновлено.' });
      resetEditor();
      if (setupReturnTo) {
        window.location.assign(setupReturnTo);
        return;
      }
      startTransition(() => router.refresh());
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error && error.message === 'FILE_TOO_LARGE'
          ? 'Не удалось подготовить изображение для отправки.'
          : 'Не удалось обработать изображение. Выберите другой файл.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={embedded ? '' : 'rounded-xl border border-white/10 bg-surface-light/20 p-4'}>
      <p className="text-sm text-text-secondary">JPG, PNG или WEBP до 10 MB. Результат сохраняется квадратом 512×512 без метаданных.</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => void selectFile(event.currentTarget.files?.[0] || null)}
        className="mt-3 block w-full text-sm text-text-secondary file:mr-4 file:rounded-lg file:border-0 file:bg-brand/20 file:px-4 file:py-2 file:text-brand-light hover:file:bg-brand/30"
      />

      {sourceUrl ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
          <div>
            <div className="relative aspect-square w-full max-w-80 overflow-hidden rounded-2xl border border-white/15 bg-slate-950 touch-none">
              <canvas
                ref={canvasRef}
                aria-label="Предпросмотр кадрирования аватара"
                className="h-full w-full cursor-grab active:cursor-grabbing"
                onPointerDown={(event) => {
                  dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const drag = dragRef.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const ratio = OUTPUT_SIZE / Math.max(1, rect.width);
                  const image = imageRef.current;
                  if (!image) return;
                  const next = clampOffset(
                    image,
                    zoom,
                    rotation,
                    offset.x + (event.clientX - drag.x) * ratio,
                    offset.y + (event.clientY - drag.y) * ratio
                  );
                  dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
                  setOffset(next);
                }}
                onPointerUp={(event) => {
                  dragRef.current = null;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => { dragRef.current = null; }}
              />
              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/25" />
            </div>
            <p className="mt-2 text-xs text-text-secondary">Перетаскивайте фото внутри квадрата.</p>
          </div>

          <div className="grid content-start gap-4">
            <label className="grid gap-2 text-sm font-semibold text-text-primary">
              Масштаб: {Math.round(zoom * 100)}%
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="accent-brand"
              />
            </label>
            <div>
              <span className="text-sm font-semibold text-text-primary">Поворот</span>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => setRotation((value) => (value + 270) % 360)} className="rounded-xl border border-white/15 px-3 py-2 text-sm text-text-primary">↶ 90°</button>
                <button type="button" onClick={() => setRotation((value) => (value + 90) % 360)} className="rounded-xl border border-white/15 px-3 py-2 text-sm text-text-primary">↷ 90°</button>
                <button type="button" onClick={() => { setZoom(1); setRotation(0); setOffset({ x: 0, y: 0 }); }} className="rounded-xl border border-white/15 px-3 py-2 text-sm text-text-secondary">Сбросить</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={loading} onClick={() => void save()} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {loading ? 'Сохраняем…' : 'Сохранить фото'}
              </button>
              <button type="button" disabled={loading} onClick={resetEditor} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-text-primary">Отмена</button>
            </div>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className={`mt-3 rounded-lg border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-red-500/40 bg-red-500/10 text-red-200'}`} role="status">
          {notice.text}
        </div>
      ) : null}
    </section>
  );
}
