'use client';

import { useEffect, useRef, useState } from 'react';

interface GalleryImage {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  caption: string;
  width: number;
  height: number;
  byteSize: number;
}

interface TournamentMediaPayload {
  coverPhotoUrl: string;
  gallery: GalleryImage[];
  limit: number;
  error?: string;
}

interface Props {
  tournamentId: string;
  tournamentName: string;
  initialAlbumUrl: string;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

const DEFAULT_LIMIT = 20;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

async function readApiPayload<T extends { error?: string }>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const rawBody = await response.text();
  let payload: T | null = null;

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as T;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    if (response.status === 413) {
      throw new Error('Сервер отклонил размер загрузки. Допустимо до 15 МБ — попробуйте ещё раз или выберите файл меньше.');
    }
    throw new Error(payload?.error || `${fallbackMessage} (HTTP ${response.status})`);
  }
  if (!payload) throw new Error('Сервер вернул некорректный ответ. Обновите страницу и повторите попытку.');
  return payload;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

export default function TournamentMediaManager({
  tournamentId,
  tournamentName,
  initialAlbumUrl,
  onClose,
  onChanged,
}: Props) {
  const [media, setMedia] = useState<TournamentMediaPayload>({
    coverPhotoUrl: '',
    gallery: [],
    limit: DEFAULT_LIMIT,
  });
  const [albumUrl, setAlbumUrl] = useState(initialAlbumUrl);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    async function loadMedia() {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/tournaments/${tournamentId}/media`, { cache: 'no-store' });
        const data = await readApiPayload<TournamentMediaPayload>(response, 'Не удалось загрузить галерею');
        setMedia(data);
      } catch (error) {
        setMessage(`❌ ${String((error as Error)?.message || 'Не удалось загрузить галерею')}`);
      } finally {
        setLoading(false);
      }
    }

    void loadMedia();
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [tournamentId]);

  async function uploadOne(kind: 'cover' | 'gallery', file: File): Promise<TournamentMediaPayload> {
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: файл больше 15 МБ`);
    const formData = new FormData();
    formData.set('kind', kind);
    formData.set('photo', file);
    const response = await fetch(`/api/admin/tournaments/${tournamentId}/media`, {
      method: 'POST',
      body: formData,
    });
    return readApiPayload<TournamentMediaPayload>(response, 'Не удалось загрузить фото');
  }

  async function uploadCover(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage('Оптимизируем главное фото…');
    try {
      const data = await uploadOne('cover', file);
      setMedia(data);
      setMessage('✅ Главное фото сохранено и оптимизировано для телефона');
      await onChanged();
    } catch (error) {
      setMessage(`❌ ${String((error as Error)?.message || 'Не удалось загрузить фото')}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadGallery(files: File[]) {
    if (!files.length) return;
    const remaining = Math.max(0, media.limit - media.gallery.length);
    if (!remaining) {
      setMessage(`❌ В галерее уже ${media.limit} фото`);
      return;
    }
    if (files.length > remaining) {
      setMessage(`❌ Можно выбрать ещё только ${remaining} фото`);
      return;
    }

    setBusy(true);
    let latest = media;
    try {
      for (const [index, file] of files.entries()) {
        setMessage(`Оптимизируем фото ${index + 1} из ${files.length}…`);
        latest = await uploadOne('gallery', file);
        setMedia(latest);
      }
      setMessage(`✅ Добавлено ${files.length} фото. В галерее ${latest.gallery.length} из ${latest.limit}`);
      await onChanged();
    } catch (error) {
      setMessage(`❌ ${String((error as Error)?.message || 'Не удалось загрузить фото')}`);
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(kind: 'cover' | 'gallery', photoId = '') {
    if (!window.confirm(kind === 'cover' ? 'Удалить главное фото?' : 'Удалить это фото из галереи?')) return;
    setBusy(true);
    setMessage('Удаляем фото…');
    try {
      const query = new URLSearchParams({ kind });
      if (photoId) query.set('photoId', photoId);
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/media?${query}`, { method: 'DELETE' });
      const data = await readApiPayload<TournamentMediaPayload>(response, 'Не удалось удалить фото');
      setMedia(data);
      setMessage('✅ Фото удалено');
      await onChanged();
    } catch (error) {
      setMessage(`❌ ${String((error as Error)?.message || 'Не удалось удалить фото')}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveAlbumUrl() {
    setBusy(true);
    setMessage('Сохраняем ссылку на полный альбом…');
    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_url: albumUrl }),
      });
      await readApiPayload<{ error?: string }>(response, 'Не удалось сохранить ссылку');
      setMessage('✅ Ссылка на полный альбом сохранена');
      await onChanged();
    } catch (error) {
      setMessage(`❌ ${String((error as Error)?.message || 'Не удалось сохранить ссылку')}`);
    } finally {
      setBusy(false);
    }
  }

  const remaining = Math.max(0, media.limit - media.gallery.length);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-2 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tournament-media-title"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onClose();
      }}
    >
      <div className="flex max-h-[calc(100svh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-surface shadow-2xl sm:max-h-[calc(100svh-2rem)]">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Архив турнира</p>
            <h3 id="tournament-media-title" className="mt-1 truncate font-heading text-xl sm:text-2xl">
              Фото · {tournamentName}
            </h3>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-xl transition hover:border-brand disabled:opacity-50"
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>

        <div className="overflow-y-auto px-4 py-5 sm:px-6">
          {message ? (
            <p className="mb-5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm" aria-live="polite">
              {message}
            </p>
          ) : null}

          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h4 className="font-heading text-lg">Главное общее фото</h4>
                <p className="mt-1 text-xs text-text-secondary">Показывается в шапке и первым в фотоотчёте.</p>
              </div>
              <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                {media.coverPhotoUrl ? 'Заменить фото' : 'Добавить фото'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif"
                  className="sr-only"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    void uploadCover(file);
                  }}
                />
              </label>
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
              {loading ? (
                <div className="grid min-h-52 place-items-center text-sm text-text-secondary">Загружаем…</div>
              ) : media.coverPhotoUrl ? (
                <div className="relative">
                  <img src={media.coverPhotoUrl} alt={`Главное фото турнира ${tournamentName}`} className="max-h-[420px] w-full object-contain" />
                  <button
                    type="button"
                    onClick={() => void removePhoto('cover')}
                    disabled={busy}
                    className="absolute right-3 top-3 min-h-11 rounded-xl border border-red-300/30 bg-black/70 px-3 py-2 text-xs text-red-200 backdrop-blur transition hover:border-red-300 disabled:opacity-50"
                  >
                    Удалить
                  </button>
                </div>
              ) : (
                <div className="grid min-h-52 place-items-center px-4 text-center text-sm text-text-secondary">
                  Добавьте общее фото после турнира
                </div>
              )}
            </div>
          </section>

          <section className="mt-7 border-t border-white/10 pt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h4 className="font-heading text-lg">Галерея · {media.gallery.length} из {media.limit}</h4>
                <p className="mt-1 text-xs text-text-secondary">
                  JPEG, PNG, WebP или HEIC до 15 МБ. Сервер сам уменьшит и переведёт фото в WebP.
                </p>
              </div>
              <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-brand/50 px-4 py-2 text-sm font-semibold text-brand transition hover:bg-brand/10 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                Добавить фото
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif"
                  multiple
                  className="sr-only"
                  disabled={busy || remaining === 0}
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files || []);
                    event.currentTarget.value = '';
                    void uploadGallery(files);
                  }}
                />
              </label>
            </div>

            {media.gallery.length ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {media.gallery.map((photo, index) => (
                  <article key={photo.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                    <div className="relative aspect-[4/3] overflow-hidden bg-black/30">
                      <img
                        src={photo.thumbnailUrl || photo.imageUrl}
                        alt={`Фото ${index + 1} турнира ${tournamentName}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] text-white">
                        {index + 1}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2">
                      <span className="truncate text-[10px] text-text-secondary">
                        {photo.width}×{photo.height}{photo.byteSize ? ` · ${formatBytes(photo.byteSize)}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => void removePhoto('gallery', photo.id)}
                        disabled={busy}
                        className="min-h-9 shrink-0 rounded-lg px-2 text-xs text-red-200 transition hover:bg-red-400/10 disabled:opacity-50"
                        aria-label={`Удалить фото ${index + 1}`}
                      >
                        Удалить
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : !loading ? (
              <div className="mt-4 rounded-2xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-text-secondary">
                В галерее пока нет фото. Можно выбрать сразу несколько файлов.
              </div>
            ) : null}

            <p className="mt-3 text-xs text-text-secondary">
              Осталось мест: {remaining}. В Telegram тот же сценарий запускается командой <code>/gallery</code>.
            </p>
          </section>

          <section className="mt-7 border-t border-white/10 pt-6">
            <h4 className="font-heading text-lg">Ссылка на полный внешний альбом</h4>
            <p className="mt-1 text-xs text-text-secondary">Необязательно: Яндекс Диск, Google Drive или VK.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                value={albumUrl}
                onChange={(event) => setAlbumUrl(event.target.value)}
                placeholder="https://…"
                className="min-h-11 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void saveAlbumUrl()}
                disabled={busy}
                className="min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold transition hover:border-brand disabled:opacity-50"
              >
                Сохранить ссылку
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
