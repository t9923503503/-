import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('managed Play roster source contract', () => {
  it('exposes manager-only search and direct add endpoints', () => {
    const route = read('web/app/api/play-posts/[id]/participants/route.ts');
    expect(route).toContain('getPlayActor');
    expect(route).toContain('searchManagedPlayParticipantCandidates');
    expect(route).toContain('addManagedPlayParticipant');
    expect(route).toContain('export async function POST');
  });

  it('locks roster changes after a result exists', () => {
    const service = read('web/lib/play-service.ts');
    expect(service).toContain('EXISTS (SELECT 1 FROM play_game_results');
    expect(service).toContain('Результат уже внесён — состав игры зафиксирован');
    expect(service).toContain("status = 'confirmed'");
  });

  it('provides a fast roster picker and a safe remove action', () => {
    const client = read('web/components/partner/PlayManagementClient.tsx');
    expect(client).toContain('Игроки LPVOLLEY');
    expect(client).toContain('Пригласить выбранных');
    expect(client).toContain('Добавить выбранных');
    expect(client).toContain('Пригласить {quickInviteCandidates.length} подходящ');
    expect(client).toContain('initiallyOpen={createdPostId === post.id}');
    expect(client).toContain('+ В состав');
    expect(client).toContain('window.setTimeout');
    expect(client).toContain('Найти по имени или выбрать из списка');
    expect(client).not.toContain("onSubmit={findPlayers}");
    expect(client).toContain('onChanged={() => load(true)}');
    expect(client).toContain("method: 'DELETE'");
    expect(client).toContain('организатор утвердит результат');
  });

  it('supports a mixed roster of registered users and named guests', () => {
    const service = read('web/lib/play-service.ts');
    const client = read('web/components/partner/PlayManagementClient.tsx');
    const migration = read('migrations/079_play_guest_participants.sql');
    const guestNamesMigration = read('migrations/086_play_participant_guest_names.sql');
    expect(service).toContain('identity.guestName');
    expect(service).toContain('guest_name, status, reviewed_at');
    expect(service).toContain('ON CONFLICT (post_id, player_id)');
    expect(client).toContain('+ Добавить гостя');
    expect(client).toContain('Игра сохранится в профиле каждого');
    expect(client).toContain('playerId: candidate.playerId');
    expect(migration).toContain('ALTER COLUMN user_id DROP NOT NULL');
    expect(migration).toContain('result_key BIGINT');
    expect(guestNamesMigration).toContain('ADD COLUMN IF NOT EXISTS guest_name TEXT');
  });
});
