import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('tournament archive gallery source contract', () => {
  it('keeps the 20-photo limit in both the database and API service', () => {
    const migration = read('migrations/080_tournament_gallery.sql');
    const service = read('web/lib/tournament-media.ts');
    expect(migration).toContain('current_count >= 20');
    expect(migration).toContain('FOR UPDATE');
    expect(service).toContain('MAX_TOURNAMENT_GALLERY_IMAGES = 20');
    expect(service).toContain('TOURNAMENT_MEDIA_GALLERY_FULL');
  });

  it('requires operator access or an allowlisted Telegram administrator', () => {
    const route = read('web/app/api/admin/tournaments/[id]/media/route.ts');
    expect(route).toContain("requireApiRole(req, 'operator')");
    expect(route).toContain('TELEGRAM_AGENT_SECRET');
    expect(route).toContain('TELEGRAM_ADMIN_USER_IDS');
    expect(route).toContain("source: 'telegram'");
  });

  it('renders the cover first and uses generated thumbnails on mobile', () => {
    const page = read('web/components/calendar/FinishedTournamentPage.tsx');
    const gallery = read('web/components/calendar/FinishedTournamentGallery.tsx');
    expect(page).toContain('galleryWithCover');
    expect(page).toContain("caption: 'Общее фото турнира'");
    expect(gallery).toContain('image.thumbnailSrc || image.src');
    expect(gallery).toContain('68svh');
    expect(gallery).toContain('onTouchStart');
  });

  it('teaches the relay an owner-only album flow', () => {
    const bot = read('telegram-bot/bot.mjs');
    expect(bot).toContain("command === '/gallery'");
    expect(bot).toContain("session.stage === 'cover' ? 'cover' : 'gallery'");
    expect(bot).toContain('ADMIN_USER_IDS.has(telegramUserId)');
    expect(bot).toContain("formData.set('telegramFileUniqueId'");
    expect(bot).toContain("command === '/done'");
  });

  it('turns proxy HTML errors into a readable upload message', () => {
    const manager = read('web/components/admin/TournamentMediaManager.tsx');
    expect(manager).toContain('async function readApiPayload');
    expect(manager).toContain('const rawBody = await response.text()');
    expect(manager).toContain('response.status === 413');
    expect(manager).toContain('Сервер отклонил размер загрузки');
    expect(manager).not.toContain('const data = await response.json()');
  });
});
