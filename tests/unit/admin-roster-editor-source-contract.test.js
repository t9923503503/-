import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relPath) {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Admin roster editor source contract', () => {
  it('adds migration and history service for per-user roster editor persistence', () => {
    const migration = read('migrations/054_roster_editor_history.sql');
    const migrationAudit = read('migrations/056_roster_editor_action_log_audit_fields.sql');
    const service = read('web/lib/roster-editor/history.ts');
    expect(migration).toContain('roster_editor_history_state');
    expect(migration).toContain('roster_editor_action_log');
    expect(migrationAudit).toContain('revision_before');
    expect(migrationAudit).toContain('request_id');
    expect(service).toContain('HISTORY_LIMIT = 150');
    expect(service).toContain('applyRosterEditorAction');
    expect(service).toContain('undoRosterEditorAction');
    expect(service).toContain('redoRosterEditorAction');
    expect(service).toContain('pruneRosterEditorActionLog');
  });

  it('ships roster editor API endpoints for history/action/undo/redo/clear', () => {
    expect(read('web/app/api/admin/tournaments/[id]/roster-editor/history/route.ts')).toContain('getRosterEditorHistoryState');
    expect(read('web/app/api/admin/tournaments/[id]/roster-editor/action/route.ts')).toContain('applyRosterEditorAction');
    expect(read('web/app/api/admin/tournaments/[id]/roster-editor/undo/route.ts')).toContain('undoRosterEditorAction');
    expect(read('web/app/api/admin/tournaments/[id]/roster-editor/redo/route.ts')).toContain('redoRosterEditorAction');
    expect(read('web/app/api/admin/tournaments/[id]/roster-editor/history/clear/route.ts')).toContain('clearRosterEditorHistory');
  });

  it('uses optimistic locking metadata (revision/session) and conflict responses', () => {
    const types = read('web/lib/roster-editor/types.ts');
    const service = read('web/lib/roster-editor/history.ts');
    const actionRoute = read('web/app/api/admin/tournaments/[id]/roster-editor/action/route.ts');
    expect(types).toContain('revision: number');
    expect(types).toContain('sessionId: string | null');
    expect(types).toContain('requestId?: string | null');
    expect(service).toContain('assertExpectedRevision');
    expect(service).toContain('revision_before');
    expect(actionRoute).toContain('history_revision_conflict');
    expect(actionRoute).toContain('expectedRevision');
    expect(actionRoute).toContain('requestId');
  });
});
