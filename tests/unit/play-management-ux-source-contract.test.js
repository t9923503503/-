import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Play management cleanup source contract', () => {
  it('lets every registered site user create a game without organizer approval', () => {
    const client = read('web/components/partner/PlayManagementClient.tsx');
    const page = read('web/app/partner/manage/page.tsx');
    const auth = read('web/lib/play-auth.ts');
    const service = read('web/lib/play-service.ts');
    const route = read('web/app/api/play-management/route.ts');
    expect(auth).toContain("return user ? { kind: 'user', userId: user.id, email: user.email } : null");
    expect(service).toContain('INSERT INTO play_organizers (owner_user_id, display_name, status)');
    expect(page).toContain('Любой зарегистрированный игрок может собрать игру');
    expect(client).toContain('/login?returnTo=%2Fpartner%2Fmanage');
    expect(client).not.toContain('Нужен статус организатора');
    expect(route).toContain('Войдите или зарегистрируйтесь, чтобы создать игру');
  });

  it('uses distinct mechanic recipes and split court pricing by default', () => {
    const client = read('web/components/partner/PlayManagementClient.tsx');
    expect(client).toContain("title: 'Постоянные пары'");
    expect(client).toContain("title: 'Меняем партнёров'");
    expect(client).toContain("title: 'Победители остаются'");
    expect(client).toContain("title: 'Своя компания'");
    expect(client).toContain('Повторить: {repeatSourcePost.title}');
    expect(client).toContain('selectRepeatGame(dashboard.posts)');
    expect(client).toContain('getNextWeeklyRepeatDate(repeatSourcePost.startsAt)');
    expect(client).toContain('VALID_KING_CAPACITIES.map');
    expect(client).toContain('Тайский формат проводится ровно на 8 игроков.');
    expect(client).toContain("normalizeGameComposition(gameType, form.capacity, form.minPlayers)");
    expect(client).toContain("setQuickStart('tomorrow')");
    expect(client).toContain("setQuickStart('tuesday')");
    expect(client).toContain("setQuickStart('week')");
    expect(client).toContain('Создать и собрать состав');
    expect(client).not.toContain('quickTemplates.map');
    expect(client).not.toContain('quickTemplateLabel');
    expect(client).not.toContain('>По шаблону: {post.title}</button>');
    expect(client).toContain("priceMode: kind === 'game' ? 'split' : 'fixed'");
    expect(client).toContain("courtCostRub: kind === 'game' ? '3500' : ''");
    expect(client).toContain('Цена за корт, ₽');
    expect(client).toContain('Итог зависит от состава.');
    expect(client).toContain("const nextTargetScore = gameType === 'sideout' ? '15' : value");
    expect(client).toContain("pointLimit: form.resultFormat === 'king_sideout' ? 15 : Number(form.targetScore)");
    expect(client).toContain("disabled={gameType === 'sideout' && limit !== '15'}");
    expect(client).toContain('Для KING используется единый счёт до 15.');
  });

  it('separates active and past events and gives admins a reversible archive', () => {
    const client = read('web/components/partner/PlayManagementClient.tsx');
    const service = read('web/lib/play-service.ts');
    const route = read('web/app/api/play-posts/[id]/route.ts');
    const migration = read('migrations/085_play_posts_admin_archive.sql');
    expect(client).toContain("['past', 'Прошедшие']");
    expect(client).toContain("['archived', 'Архив']");
    expect(client).toContain("{ archived: true }");
    expect(client).toContain("{ archived: false }");
    expect(service).toContain('export async function setPlayPostArchived');
    expect(service).toContain("if (actor.kind !== 'admin')");
    expect(route).toContain("typeof body.archived === 'boolean'");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ');
  });
});

describe('Telegram game creation source contract', () => {
  it('creates a safe Play draft from the three common bot templates', () => {
    const actions = read('web/lib/telegram-actions.ts');
    const agent = read('web/app/api/telegram/agent/route.ts');
    const bot = read('telegram-bot/bot.mjs');
    const registration = read('web/lib/telegram-registration.ts');
    expect(actions).toContain('export async function createGameDraftFromTelegram');
    expect(actions).toContain("status: 'draft'");
    expect(actions).toContain('courtCostRub: 3500');
    expect(actions).toContain("export type TelegramGameTemplate = '2x2' | 'thai' | 'king'");
    expect(actions).toContain("'2x2': {");
    expect(actions).toContain('capacity: 4');
    expect(actions).toContain('capacity: 8');
    expect(actions).toContain('minPlayers: 6');
    expect(actions).toContain("created_at > now() - interval '15 minutes'");
    expect(agent).toContain("case 'gameCreateMenu':");
    expect(agent).toContain("case 'createGameDraft':");
    expect(bot).toContain("command === '/create_game'");
    expect(bot).toContain("payload === 'create_game'");
    expect(registration).toContain("{ text: '➕ Создать игру', callbackData: 'create:menu' }");
  });
});
