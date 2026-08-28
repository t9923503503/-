import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('play attendance source contract', () => {
  it('stores an explicit response and promotes the reserve on withdrawal', () => {
    const migration = read('migrations/091_play_attendance.sql');
    const service = read('web/lib/play-service.ts');
    const route = read('web/app/api/play-posts/[id]/attendance/route.ts');
    const ui = read('web/components/play/PlayAttendanceButtons.tsx');
    expect(migration).toContain("attendance_status IN ('unknown', 'going', 'not_going', 'attended', 'no_show')");
    expect(service).toContain('export async function respondPlayAttendance');
    expect(service).toContain("attendance_status = 'not_going'");
    expect(service).toContain('promoteReserves(client, postId, 1)');
    expect(route).toContain("body.response === 'going'");
    expect(ui).toContain('Да, освободить место');
  });

  it('uses the same attendance domain action from Telegram', () => {
    const telegram = read('web/lib/telegram-actions.ts');
    expect(telegram).toContain("respondPlayAttendance(userId, postId, 'going')");
    expect(telegram).toContain("respondPlayAttendance(userId, postId, 'not_going')");
  });
});

describe('avatar source onboarding', () => {
  it('asks for a source during registration and imports provider photos locally', () => {
    const auth = read('web/components/profile/PlayerAuthPanel.tsx');
    const importer = read('web/lib/profile-avatar-import.ts');
    const vk = read('web/app/api/auth/vk/callback/route.ts');
    const telegram = read('web/app/api/auth/telegram-login/route.ts');
    expect(auth).toContain('Откуда взять аватар?');
    expect(auth).toContain('Взять из ВК');
    expect(auth).toContain('Взять из Telegram');
    expect(auth).toContain('Загрузить фото');
    expect(auth).toMatch(/if \(!loginResponse\.ok\)[\s\S]{0,1200}await continueAfterRegistration\(\);/);
    expect(auth).not.toContain('window.location.href = redirectTo');
    expect(auth).toContain('returnTo=${encodeURIComponent(redirectTo)}');
    expect(importer).toContain('normalizeProfilePhoto');
    expect(importer).toContain('getUserProfilePhotos');
    expect(importer).toContain('/images/users/');
    expect(importer).toContain('async function getExistingAvatarUrl');
    expect(importer).toContain('if (existingAvatarUrl) return existingAvatarUrl;');
    expect(importer).toContain('p.photo_url AS player_photo_url');
    expect(importer).toContain('account.rows[0].avatar_url || account.rows[0].player_photo_url');
    expect(importer).toContain('FOR UPDATE OF u');
    expect(importer).toContain('controller.abort(), 8_000');
    expect(importer).toContain('readLimitedImageBody(response)');
    expect(importer).toContain('reader.cancel()');
    expect(importer).not.toContain('response.arrayBuffer()');
    expect(vk).toContain('importVkProfileAvatar(account.id, vkAvatarUrl)');
    expect(telegram).toContain('importTelegramProfileAvatar(accountId, telegramUserId)');
    expect(telegram).toContain('after(async () =>');
    const cabinet = read('web/components/profile/PlayerCabinetPage.tsx');
    const upload = read('web/components/profile/PlayerPhotoUploadForm.tsx');
    const telegramLink = read('web/components/profile/TelegramLinkForm.tsx');
    expect(cabinet).toContain("rawAvatarReturnTo.startsWith('/') && !rawAvatarReturnTo.startsWith('//')");
    expect(upload).toContain('window.location.assign(setupReturnTo)');
    expect(telegramLink).toContain('timer = setTimeout(refreshLinkState, 2500)');
    expect(telegramLink).toContain('window.location.assign(setupReturnTo)');
  });
});
