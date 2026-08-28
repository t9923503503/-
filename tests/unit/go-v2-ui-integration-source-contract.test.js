import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Tournament Engine V2 UI integration', () => {
  it('keeps legacy GO as the default and routes only enabled tournaments to V2', () => {
    const wizard = read('web/components/admin/tournaments/TournamentWizard.tsx');
    const adminUi = read('web/lib/admin-tournaments-ui.ts');
    const adminApi = read('web/app/api/admin/tournaments/route.ts');
    const adminMapper = read('web/lib/admin-queries-pg.ts');
    const postgrestMapper = read('web/lib/admin-postgrest.ts');

    expect(wizard).toContain('initial?.goEngineVersion === 2 ? 2 : 1');
    expect(wizard).toContain('Tournament Engine V2');
    expect(adminUi).toContain("row.goEngineVersion === 2");
    expect(adminUi).toContain("return `/admin/tournaments/${encodeURIComponent(row.id)}/engine-v2`");
    expect(adminUi).toContain("return `/admin/tournaments/${encodeURIComponent(row.id)}/go-live`");
    expect(adminApi).toContain('validateGoEngineTransition');
    expect(adminApi).toContain("code: 'GO_ENGINE_TRANSITION_LOCKED'");
    expect(adminMapper).toContain('row.go_engine_version');
    expect(adminMapper).toContain('payload.go_engine_version');
    expect(postgrestMapper).toContain('payload.go_engine_version');
  });

  it('exposes separate admin and public V2 workspaces', () => {
    const adminPage = read('web/app/admin/tournaments/[id]/engine-v2/page.tsx');
    const publicPage = read('web/app/calendar/[id]/live/page.tsx');
    const publicView = read('web/components/go-v2/TournamentV2PublicView.tsx');

    expect(adminPage).toContain('TournamentEngineV2Workspace');
    expect(publicPage).toContain('TournamentV2PublicView');
    expect(publicView).toContain("type PublicTab = 'schedule' | 'groups' | 'brackets'");
    expect(publicView).toContain('/api/go-v2/tournaments/');
  });

  it('uses authenticated command envelopes and retries a lost response idempotently', () => {
    const workspace = read('web/components/go-v2/TournamentEngineV2Workspace.tsx');

    expect(workspace).toContain('commandId,');
    expect(workspace).toContain('idempotencyKey: commandId');
    expect(workspace).toContain('deviceId: getV2DeviceId()');
    expect(workspace).toContain('await adminCommandRequestHash(tournamentId, path, payload)');
    expect(workspace).toContain('for (let attempt = 0; attempt < 2; attempt += 1)');
    expect(workspace).toContain('exact same body and commandId');
  });

  it('provides an IndexedDB journal without an automatic last-write-wins merge', () => {
    const offline = read('web/lib/go-v2/client-offline.ts');
    const worker = read('web/public/go-v2-sw.js');

    expect(offline).toContain("commands.createIndex('byScopeQueuedAt'");
    expect(offline).toContain('expectedVersion');
    expect(offline).toContain('saveConflict');
    expect(offline).toContain('queueCommandAndSaveSnapshot');
    expect(offline).toContain("db.transaction(['commands', 'snapshots'], 'readwrite')");
    expect(offline).toContain('deliberately has no');
    expect(offline).not.toContain('lastWriteWins(');
    expect(worker).not.toContain("url.pathname.startsWith('/api/') return");
    expect(worker).toContain("url.pathname.startsWith('/api/')");
    expect(worker).toContain("url.pathname.includes('/judge/go-v2/')");
  });

  it('provides a court-scoped offline judge workspace with CAS and split-brain blocking', () => {
    const page = read('web/app/judge/go-v2/[tournamentId]/page.tsx');
    const judge = read('web/components/go-v2/GoV2JudgeWorkspace.tsx');
    const getState = read('web/app/api/go-v2/judge/tournaments/[id]/court/route.ts');
    const commands = read('web/app/api/go-v2/judge/tournaments/[id]/commands/route.ts');
    const chrome = read('web/components/layout/SiteChrome.tsx');

    expect(page).toContain('robots: { index: false, follow: false }');
    expect(judge).toContain('expectedVersion: selectedMatch.commandVersion');
    expect(judge).toContain('buildGoV2JudgeCommandEnvelope');
    expect(judge).toContain('queueCommandAndSaveSnapshot');
    expect(judge).toContain('sendGoV2JudgeCommandWithRetry');
    expect(judge).toContain("classification === 'conflict'");
    expect(judge).toContain("setSyncState('conflict')");
    expect(judge).toContain('Автоматического объединения и last-write-wins нет');
    expect(judge).toContain('window.sessionStorage.setItem(grantStorageKey');
    expect(judge).not.toContain('window.localStorage.setItem(`lpvolley:go-v2:grant:');
    expect(judge).toContain("document.body.classList.add('judge-workspace')");
    expect(judge).toContain('validateGoV2JudgeSetClose');
    expect(judge).toContain('validateGoV2JudgeFinish');
    expect(judge).toContain('Другие матчи корта');
    expect(judge).toContain('local: { journal, snapshot: cachedSnapshot }');
    expect(judge).toContain('remote: {');
    expect(judge).toContain("setSyncState('authorization')");
    expect(judge).toContain("setSyncState('rejected')");
    expect(chrome).toContain("pathname.startsWith('/judge/go-v2/')");
    expect(page).toContain('SCRUB_GRANT_FRAGMENT');
    expect(page).toContain("history.replaceState(null,'',location.pathname+location.search)");
    expect(getState).toContain("req.headers.get('authorization')");
    expect(getState).toContain("req.headers.get('x-go-v2-device-id')");
    expect(commands).toContain('applyGoV2JudgeCommand');
  });

  it('keeps judge bearer fragments out of Yandex Metrika', () => {
    const analytics = read('web/components/analytics/YandexMetrika.tsx');

    expect(analytics).toContain("pathname.startsWith('/judge/go-v2/')");
    expect(analytics).toContain('if (!normalizedCounterId || telemetryDisabled) return null');
    expect(analytics).toContain('if (telemetryDisabled || !metrikaReady');
  });

  it('exposes day-of controls and genuine second-admin approval in the admin workspace', () => {
    const workspace = read('web/components/go-v2/TournamentEngineV2Workspace.tsx');

    expect(workspace).toContain("{ id: 'live', label: 'Live-день' }");
    expect(workspace).toContain('/attendance/preview');
    expect(workspace).toContain('/schedule/disruptions/preview');
    expect(workspace).toContain('/grants/${encodeURIComponent(grantId)}/rotate');
    expect(workspace).toContain('targetDeviceId');
    expect(workspace).toContain('/approvals/${encodeURIComponent(approvalPreviewId.trim())}');
    expect(workspace).toContain('redApprovalId');
    expect(workspace).toContain('Самосогласование сервер блокирует');
  });

  it('offers versioned grouped and standalone format presets without weakening group constraints', () => {
    const workspace = read('web/components/go-v2/TournamentEngineV2Workspace.tsx');
    const wizard = read('web/components/admin/tournaments/TournamentWizard.tsx');

    expect(workspace).toContain('lpv_groups_hl_se_v1');
    expect(workspace).toContain('lpv_groups_hml_se_v1');
    expect(workspace).toContain('lpv_groups_tiers_de_v1');
    expect(workspace).toContain('lpv_modified4_de_v1');
    expect(workspace).toContain('lpv_standalone_se_v1');
    expect(workspace).toContain('lpv_standalone_de_v1');
    expect(workspace).toContain('lpv_classification_v1');
    expect(workspace).toContain("playoffFormat === 'classification'");
    expect(workspace).toContain("formatMode: config.formatMode");
    expect(workspace).toContain("standaloneBracket && config.playoffFormat === 'single_elimination' ? 2 : 3");
    expect(wizard).toMatch(/label="Команд"[\s\S]*?min=\{2\}[\s\S]*?max=\{48\}/);
    expect(wizard).toMatch(/label="Кортов"[\s\S]*?min=\{1\}[\s\S]*?max=\{6\}/);
  });
});
