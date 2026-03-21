import { getPool } from './db';
import type { AdminRole } from './admin-auth';

export interface AuditEntry {
  id: number;
  createdAt: string;
  actorId: string;
  actorRole: AdminRole;
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  beforeState: unknown;
  afterState: unknown;
  source: string;
}

export async function writeAuditLog(input: {
  actorId: string;
  actorRole: AdminRole;
  action: string;
  entityType: string;
  entityId?: string;
  reason?: string;
  beforeState?: unknown;
  afterState?: unknown;
  source?: string;
}): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const pool = getPool();
  await pool.query(
    `INSERT INTO admin_audit_log
      (actor_id, actor_role, action, entity_type, entity_id, reason, before_state, after_state, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      input.actorId,
      input.actorRole,
      input.action,
      input.entityType,
      input.entityId ?? '',
      input.reason ?? '',
      input.beforeState != null ? JSON.stringify(input.beforeState) : null,
      input.afterState != null ? JSON.stringify(input.afterState) : null,
      input.source ?? 'admin-panel',
    ]
  );
}

export async function fetchAuditLog(limit = 100): Promise<AuditEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = getPool();
  const max = Math.max(1, Math.min(Number(limit || 100), 500));
  const { rows } = await pool.query(
    `SELECT id, created_at, actor_id, actor_role, action, entity_type, entity_id, reason, before_state, after_state, source
     FROM admin_audit_log
     ORDER BY created_at DESC
     LIMIT $1`,
    [max]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    createdAt: row.created_at ? String(row.created_at) : '',
    actorId: row.actor_id ?? '',
    actorRole: row.actor_role as AdminRole,
    action: row.action ?? '',
    entityType: row.entity_type ?? '',
    entityId: row.entity_id ?? '',
    reason: row.reason ?? '',
    beforeState: row.before_state ?? null,
    afterState: row.after_state ?? null,
    source: row.source ?? 'admin-panel',
  }));
}
