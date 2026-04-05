import { getPool } from './db';
import type { AdminRole } from './admin-auth';
import { createPostgrestAdminJwt, hasAdminPostgrestConfig, normalizeAdminApiBase } from './admin-postgrest';
import { readServerEnv } from './server-env';

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

function readFirstServerEnv(names: string[]): string {
  for (const name of names) {
    const value = String(readServerEnv(name) || '').trim();
    if (value) return value;
  }
  return '';
}

function getAuditRemoteConfig() {
  const restBase = normalizeAdminApiBase(
    readFirstServerEnv(['APP_API_BASE', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'])
  );
  const apiKey = readFirstServerEnv([
    'APP_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ]);
  const explicitToken = readFirstServerEnv(['POSTGREST_ADMIN_TOKEN']);
  const jwtSecret = readFirstServerEnv(['POSTGREST_JWT_SECRET']);
  const adminRole = readFirstServerEnv(['POSTGREST_ADMIN_ROLE']) || 'authenticated';
  const bearerToken = explicitToken || (jwtSecret ? createPostgrestAdminJwt(jwtSecret, adminRole) : '');
  if (!restBase || (!bearerToken && !apiKey)) return null;
  return { restBase, apiKey, bearerToken };
}

async function auditFetch(path: string, init: RequestInit = {}) {
  const cfg = getAuditRemoteConfig();
  if (!cfg) throw new Error('Missing admin server DB config: APP_API_BASE');
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (cfg.apiKey) headers.set('apikey', cfg.apiKey);
  if (cfg.bearerToken) {
    headers.set('Authorization', `Bearer ${cfg.bearerToken}`);
  } else if (cfg.apiKey) {
    headers.set('Authorization', `Bearer ${cfg.apiKey}`);
  }
  if (init.body != null && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${cfg.restBase}${path}`, {
    ...init,
    cache: 'no-store',
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Audit remote request failed (${res.status})`);
  }
  return res;
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
  if (hasAdminPostgrestConfig()) {
    await auditFetch('/admin_audit_log', {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        actor_id: input.actorId,
        actor_role: input.actorRole,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId ?? '',
        reason: input.reason ?? '',
        before_state: input.beforeState ?? null,
        after_state: input.afterState ?? null,
        source: input.source ?? 'admin-panel',
      }),
    });
    return;
  }

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
  if (hasAdminPostgrestConfig()) {
    const max = Math.max(1, Math.min(Number(limit || 100), 500));
    const res = await auditFetch(
      `/admin_audit_log?select=id,created_at,actor_id,actor_role,action,entity_type,entity_id,reason,before_state,after_state,source&order=created_at.desc&limit=${max}`
    );
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return (rows ?? []).map((row) => ({
      id: Number(row.id ?? 0),
      createdAt: row.created_at ? String(row.created_at) : '',
      actorId: String(row.actor_id ?? ''),
      actorRole: String(row.actor_role ?? 'viewer') as AdminRole,
      action: String(row.action ?? ''),
      entityType: String(row.entity_type ?? ''),
      entityId: String(row.entity_id ?? ''),
      reason: String(row.reason ?? ''),
      beforeState: row.before_state ?? null,
      afterState: row.after_state ?? null,
      source: String(row.source ?? 'admin-panel'),
    }));
  }

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
