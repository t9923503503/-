import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('GO V2 explicit offline split-brain source contract', () => {
  it('persists both sides and retains resolved local commands as immutable evidence', () => {
    const offline = read('web/lib/go-v2/client-offline.ts');

    expect(offline).toContain("status?: 'pending' | 'discarded' | 'rebased'");
    expect(offline).toContain("action: 'discard' | 'rebase'");
    expect(offline).toContain('actorId: string');
    expect(offline).toContain('deviceId: string');
    expect(offline).toContain('remoteVersion: number');
    expect(offline).toContain('journal: GoV2QueuedCommand[]');
    expect(offline).toContain('snapshotVersion: number');
    expect(offline).toContain('async discardConflict');
    expect(offline).toContain('async rebaseConflict');
    expect(offline).toContain("status: input.action === 'discard' ? 'discarded' : 'rebased'");
    expect(offline).toContain("db.transaction(['commands', 'snapshots', 'conflicts'], 'readwrite')");
    expect(offline).toContain("transaction.objectStore('conflicts').delete(scopeKey)");
    expect(offline).not.toContain('lastWriteWins(');
  });

  it('permits only a single compatible lifecycle intent and fails closed for score/result', () => {
    const offline = read('web/lib/go-v2/client-offline.ts');
    const judge = read('web/components/go-v2/GoV2JudgeWorkspace.tsx');

    expect(offline).toContain('assessGoV2OfflineRebase');
    expect(offline).toContain("kind === 'score.replace' || kind === 'match.finish.request'");
    expect(offline).toContain('SCORE_OR_RESULT_REBASE_FORBIDDEN');
    expect(offline).toContain('REBASE_REQUIRES_SINGLE_PENDING_INTENT');
    expect(offline).toContain('REMOTE_STATE_CHANGED');
    expect(judge).toContain("makeId('judge-rebase')");
    expect(judge).toContain('expectedVersion: rebaseAssessment.expectedVersion');
    expect(judge).toContain('buildGoV2JudgeCommandEnvelope');
    expect(judge).toContain('Rebase intent-команды');
    expect(judge).toContain('счёт не переносится');
  });

  it('requires a visible comparison and explicit attributed confirmation', () => {
    const judge = read('web/components/go-v2/GoV2JudgeWorkspace.tsx');

    expect(judge).toContain('Локально · не подтверждено');
    expect(judge).toContain('Сервер · подтверждено');
    expect(judge).toContain('Обновить серверный снимок');
    expect(judge).toContain('Оператор, принимающий решение');
    expect(judge).toContain('Причина');
    expect(judge).toContain('resolutionConfirmed');
    expect(judge).toContain('Принять сервер · discard');
    expect(judge).toContain('store.discardConflict');
    expect(judge).toContain('store.rebaseConflict');
    expect(judge).toContain('downloadGoV2ConflictBackup');
    expect(judge).toContain('Автоматического объединения и last-write-wins нет');
  });
});
