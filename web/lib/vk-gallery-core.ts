export interface GalleryPhoto {
  id: number;
  thumbSrc: string;
  fullSrc: string;
  width: number;
  height: number;
  alt: string;
  vkUrl: string;
}

export interface GalleryAlbum {
  id: number;
  title: string;
  description?: string;
  photoCount: number;
  updatedAt: string;
  coverUrl: string;
  vkUrl: string;
  photos: GalleryPhoto[];
}

export interface VkPhotoSize {
  url?: unknown;
  width?: unknown;
  height?: unknown;
}

export interface VkAlbumItem {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  size?: unknown;
  updated?: unknown;
}

export interface VkPhotoItem {
  id?: unknown;
  text?: unknown;
  sizes?: unknown;
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function usableSizes(value: unknown): Array<{ url: string; width: number; height: number }> {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate: VkPhotoSize) => {
    const url = safeText(candidate?.url);
    const width = finiteNumber(candidate?.width);
    const height = finiteNumber(candidate?.height);
    if (!url || !url.startsWith('https://') || !width || !height || width <= 0 || height <= 0) {
      return [];
    }
    return [{ url, width, height }];
  });
}

export function selectPhotoSources(sizes: unknown, minimumThumbWidth = 800) {
  const available = usableSizes(sizes).sort((left, right) => {
    const areaDifference = left.width * left.height - right.width * right.height;
    return areaDifference || left.width - right.width;
  });
  if (available.length === 0) return null;

  const full = available[available.length - 1];
  const thumb = available.find((size) => size.width >= minimumThumbWidth) ?? full;
  return { thumb, full };
}

export function normalizeVkPhoto(
  raw: VkPhotoItem,
  albumTitle: string,
  ownerId: number,
): GalleryPhoto | null {
  const id = finiteNumber(raw?.id);
  const selected = selectPhotoSources(raw?.sizes);
  if (!id || !selected) return null;

  const text = safeText(raw.text);
  return {
    id,
    thumbSrc: selected.thumb.url,
    fullSrc: selected.full.url,
    width: selected.full.width,
    height: selected.full.height,
    alt: text || `Фото с турнира «${albumTitle}»`,
    vkUrl: `https://vk.com/photo${ownerId}_${id}`,
  };
}

export function selectRecentAlbums(rawAlbums: VkAlbumItem[], limit = 4): Array<{
  id: number;
  title: string;
  description?: string;
  photoCount: number;
  updated: number;
}> {
  return rawAlbums
    .flatMap((album) => {
      const id = finiteNumber(album?.id);
      const photoCount = finiteNumber(album?.size);
      const updated = finiteNumber(album?.updated) ?? 0;
      if (!id || id <= 0 || !photoCount || photoCount <= 0) return [];

      const title = safeText(album.title) || 'Турнир LPVOLLEY';
      const description = safeText(album.description);
      return [{ id, title, description: description || undefined, photoCount, updated }];
    })
    .sort((left, right) => right.updated - left.updated)
    .slice(0, limit);
}

export function normalizeVkAlbum(
  album: ReturnType<typeof selectRecentAlbums>[number],
  photos: VkPhotoItem[],
  ownerId: number,
): GalleryAlbum | null {
  const normalizedPhotos = photos
    .map((photo) => normalizeVkPhoto(photo, album.title, ownerId))
    .filter((photo): photo is GalleryPhoto => Boolean(photo));
  if (normalizedPhotos.length === 0) return null;

  return {
    id: album.id,
    title: album.title,
    description: album.description,
    photoCount: Math.max(album.photoCount, normalizedPhotos.length),
    updatedAt: new Date(Math.max(0, album.updated) * 1000).toISOString(),
    coverUrl: normalizedPhotos[0].thumbSrc,
    vkUrl: `https://vk.com/album${ownerId}_${album.id}`,
    photos: normalizedPhotos,
  };
}
