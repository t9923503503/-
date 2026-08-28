import 'server-only';

import { unstable_cache } from 'next/cache';
import { readServerEnv } from '@/lib/server-env';
import {
  normalizeVkAlbum,
  selectRecentAlbums,
  type GalleryAlbum,
  type VkAlbumItem,
  type VkPhotoItem,
} from '@/lib/vk-gallery-core';

const VK_API_URL = 'https://api.vk.com/method';
const DEFAULT_OWNER_ID = -231914175;
const DEFAULT_API_VERSION = '5.199';
const DEFAULT_REVALIDATE_SECONDS = 3600;
const REQUEST_TIMEOUT_MS = 8_000;

interface VkResponse<T> {
  response?: T;
  error?: { error_code?: number; error_msg?: string };
}

function integerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(readServerEnv(name), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const ownerId = integerEnv('VK_GALLERY_OWNER_ID', DEFAULT_OWNER_ID);
const apiVersion = readServerEnv('VK_API_VERSION').trim() || DEFAULT_API_VERSION;
const revalidateSeconds = Math.max(
  60,
  integerEnv('VK_GALLERY_REVALIDATE_SECONDS', DEFAULT_REVALIDATE_SECONDS),
);

function reportVkError(scope: string, error: unknown) {
  const safeMessage = error instanceof Error ? error.message : 'Unknown VK gallery error';
  console.error(`[vk-gallery:${scope}] ${safeMessage}`);
}

async function callVk<T>(method: string, params: Record<string, string | number>): Promise<T> {
  const token = readServerEnv('VK_SERVICE_TOKEN').trim();
  if (!token) throw new Error('VK service token is not configured');

  const body = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
    access_token: token,
    v: apiVersion,
  });
  const response = await fetch(`${VK_API_URL}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  let payload: VkResponse<T>;
  try {
    payload = (await response.json()) as VkResponse<T>;
  } catch {
    throw new Error('VK returned invalid JSON');
  }
  if (payload.error) {
    throw new Error(`VK API error ${payload.error.error_code ?? 'unknown'}`);
  }
  if (payload.response == null) throw new Error('VK response is missing data');
  return payload.response;
}

async function fetchVkGallery(): Promise<GalleryAlbum[]> {
  const albumsPayload = await callVk<{ items?: VkAlbumItem[] }>('photos.getAlbums', {
    owner_id: ownerId,
    need_system: 0,
    need_covers: 1,
    photo_sizes: 1,
    count: 6,
  });
  const albums = selectRecentAlbums(Array.isArray(albumsPayload.items) ? albumsPayload.items : []);
  if (albums.length === 0) return [];

  const results = await Promise.allSettled(
    albums.map(async (album) => {
      const photosPayload = await callVk<{ items?: VkPhotoItem[] }>('photos.get', {
        owner_id: ownerId,
        album_id: album.id,
        rev: 1,
        photo_sizes: 1,
        count: 12,
      });
      return normalizeVkAlbum(
        album,
        Array.isArray(photosPayload.items) ? photosPayload.items : [],
        ownerId,
      );
    }),
  );

  const successful = results.flatMap((result, index) => {
    if (result.status === 'fulfilled' && result.value) return [result.value];
    if (result.status === 'rejected') reportVkError(`album-${albums[index]?.id ?? 'unknown'}`, result.reason);
    return [];
  });
  if (successful.length === 0) throw new Error('VK returned no usable album photos');
  return successful;
}

const getCachedVkGallery = unstable_cache(fetchVkGallery, ['vk-gallery-v1', String(ownerId), apiVersion], {
  revalidate: revalidateSeconds,
});

export async function getVkGallery(): Promise<GalleryAlbum[]> {
  if (!readServerEnv('VK_SERVICE_TOKEN').trim()) return [];
  try {
    return await getCachedVkGallery();
  } catch (error) {
    reportVkError('load', error);
    return [];
  }
}
