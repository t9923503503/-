import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  normalizeVkAlbum,
  normalizeVkPhoto,
  selectPhotoSources,
  selectRecentAlbums,
} from '../../web/lib/vk-gallery-core';

describe('VK gallery normalization', () => {
  it('sorts ordinary non-empty albums and keeps the four newest', () => {
    const albums = selectRecentAlbums([
      { id: -6, title: 'System', size: 20, updated: 999 },
      { id: 1, title: 'Old', size: 3, updated: 100 },
      { id: 2, title: 'Empty', size: 0, updated: 800 },
      { id: 3, title: 'Third', size: 2, updated: 300 },
      { id: 4, title: 'Newest', size: 5, updated: 500 },
      { id: 5, title: 'Second', size: 1, updated: 400 },
      { id: 6, title: 'Fourth', size: 4, updated: 200 },
    ]);

    expect(albums.map((album) => album.id)).toEqual([4, 5, 3, 6]);
  });

  it('chooses preview and full image by dimensions rather than VK size order', () => {
    const selected = selectPhotoSources([
      { type: 'w', url: 'https://sun.example/full.jpg', width: 2560, height: 1707 },
      { type: 'm', url: 'https://sun.example/small.jpg', width: 130, height: 87 },
      { type: 'z', url: 'https://sun.example/large.jpg', width: 1280, height: 853 },
      { type: 'x', url: 'https://sun.example/thumb.jpg', width: 807, height: 538 },
    ]);

    expect(selected?.thumb.url).toBe('https://sun.example/thumb.jpg');
    expect(selected?.full.url).toBe('https://sun.example/full.jpg');
  });

  it('uses VK text when available and a meaningful album fallback otherwise', () => {
    const withText = normalizeVkPhoto(
      { id: 10, text: 'Финал турнира', sizes: [{ url: 'https://sun.example/1.jpg', width: 900, height: 600 }] },
      'Август',
      -231914175,
    );
    const withoutText = normalizeVkPhoto(
      { id: 11, text: '   ', sizes: [{ url: 'https://sun.example/2.jpg', width: 900, height: 600 }] },
      'Август',
      -231914175,
    );

    expect(withText?.alt).toBe('Финал турнира');
    expect(withText?.vkUrl).toBe('https://vk.com/photo-231914175_10');
    expect(withoutText?.alt).toBe('Фото с турнира «Август»');
  });

  it('drops an album without usable photos and builds canonical album data otherwise', () => {
    const album = selectRecentAlbums([{ id: 77, title: 'Кубок', size: 12, updated: 1_700_000_000 }])[0];
    expect(normalizeVkAlbum(album, [], -231914175)).toBeNull();

    const normalized = normalizeVkAlbum(
      album,
      [{ id: 88, sizes: [{ url: 'https://sun.example/photo.jpg', width: 1200, height: 800 }] }],
      -231914175,
    );
    expect(normalized).toMatchObject({
      id: 77,
      photoCount: 12,
      coverUrl: 'https://sun.example/photo.jpg',
      vkUrl: 'https://vk.com/album-231914175_77',
    });
  });
});

describe('VK gallery server contract', () => {
  const source = readFileSync(path.join(process.cwd(), 'web/lib/vk-gallery.ts'), 'utf8');

  it('keeps credentials server-side and uses the required VK request parameters', () => {
    expect(source).toContain("import 'server-only'");
    expect(source).toContain("body,");
    expect(source).not.toContain('access_token=${');
    expect(source).toContain('need_system: 0');
    expect(source).toContain('need_covers: 1');
    expect(source).toContain('rev: 1');
    expect(source).toContain('count: 12');
  });

  it('uses a timeout, persistent Next cache and partial album recovery', () => {
    expect(source).toContain('AbortSignal.timeout(REQUEST_TIMEOUT_MS)');
    expect(source).toContain('unstable_cache');
    expect(source).toContain('Promise.allSettled');
    expect(source).toContain('VK returned invalid JSON');
    expect(source).toContain('VK API error');
  });
});
