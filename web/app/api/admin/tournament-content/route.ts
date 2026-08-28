import { NextRequest, NextResponse } from 'next/server';
import { generateTournamentContentDraft } from '@/lib/tournament-assistant';
import { writeAuditLog } from '@/lib/admin-audit';
import { adminErrorResponse } from '@/lib/admin-errors';
import { requireApiRole } from '@/lib/admin-auth';
import { getPool } from '@/lib/db';
import { sendTelegramChannelPost } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT_LENGTH = 5000;

type Draft = { id: string; tournament_id: string; tournament_name: string; vk_text: string; telegram_text: string; status: string };
type MediaItem = { id: string; tournament_name: string; kind: string; storage_url: string; caption: string };

function pickString(row: Record<string, unknown>, key: string, fallback = ''): string {
  const value = row[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

function parseDraftRow(row: Record<string, unknown>): Draft {
  const payload = (row.payload as Record<string, unknown> | null) ?? {};
  return {
    id: String(row.id ?? '').trim(),
    tournament_id: String(row.tournament_id ?? '').trim(),
    tournament_name: String(row.tournament_name ?? '').trim(),
    vk_text: pickString(payload, 'vk_text'),
    telegram_text: pickString(payload, 'telegram_text'),
    status: pickString(payload, 'status', 'draft') || 'draft',
  };
}

function parseMediaRow(row: Record<string, unknown>): MediaItem {
  const payload = (row.payload as Record<string, unknown> | null) ?? {};
  return {
    id: String(row.id ?? '').trim(),
    tournament_name: String(row.tournament_name ?? '').trim(),
    kind: pickString(payload, 'kind', 'gallery'),
    storage_url: pickString(payload, 'storage_url', pickString(payload, 'url', pickString(payload, 'image_url'))),
    caption: pickString(payload, 'caption'),
  };
}

function parseText(value: unknown, field: string): { value: string; error?: string } {
  if (typeof value !== 'string') return { value: '', error: `${field} must be a string` };
  const normalized = value.trim();
  if (!normalized) return { value: '', error: `${field} is required` };
  if (normalized.length > MAX_TEXT_LENGTH) return { value: '', error: `${field} must be ${MAX_TEXT_LENGTH} characters or less` };
  return { value: normalized };
}

async function hasColumn(pool: ReturnType<typeof getPool>, table: string, column: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column],
  );
  return Boolean(result.rowCount);
}

async function updateDraftText(pool: ReturnType<typeof getPool>, draftId: string, vkText: string, telegramText: string) {
  const hasUpdatedAt = await hasColumn(pool, 'tournament_content_drafts', 'updated_at');
  const setFragments = ['vk_text = $2', 'telegram_text = $3'];
  if (hasUpdatedAt) setFragments.push('updated_at = now()');
  return pool.query(
    `UPDATE tournament_content_drafts SET ${setFragments.join(', ')} WHERE id::text = $1`,
    [draftId, vkText, telegramText],
  );
}

async function markDraftPublished(pool: ReturnType<typeof getPool>, draftId: string) {
  if (!await hasColumn(pool, 'tournament_content_drafts', 'status')) return;
  const publishedAt = await hasColumn(pool, 'tournament_content_drafts', 'published_at');
  const fragments = ["status = 'published'"];
  if (publishedAt) fragments.push('published_at = now()');
  await pool.query(`UPDATE tournament_content_drafts SET ${fragments.join(', ')} WHERE id::text = $1`, [draftId]);
}

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  const pool = getPool();
  try {
    const hasMediaStatus = await hasColumn(pool, 'tournament_media', 'status');
    const [draftRows, mediaRows] = await Promise.all([
      pool.query(`SELECT d.id::text AS id, d.tournament_id::text AS tournament_id, t.name AS tournament_name, to_jsonb(d) AS payload
                    FROM tournament_content_drafts d JOIN tournaments t ON t.id = d.tournament_id
                   ORDER BY d.id DESC LIMIT 200`),
      pool.query(hasMediaStatus
        ? `SELECT m.id::text AS id, t.name AS tournament_name, to_jsonb(m) AS payload
             FROM tournament_media m JOIN tournaments t ON t.id = m.tournament_id
            WHERE COALESCE(m.status::text, '') = 'pending' ORDER BY m.id DESC LIMIT 200`
        : `SELECT m.id::text AS id, t.name AS tournament_name, to_jsonb(m) AS payload
             FROM tournament_media m JOIN tournaments t ON t.id = m.tournament_id
            ORDER BY m.id DESC LIMIT 200`),
    ]);
    return NextResponse.json({
      drafts: (draftRows.rows as Record<string, unknown>[]).map(parseDraftRow),
      pendingMedia: (mediaRows.rows as Record<string, unknown>[]).map(parseMediaRow),
    });
  } catch (error) {
    if (String((error as { code?: string })?.code) === '42P01') return NextResponse.json({ drafts: [], pendingMedia: [] });
    return adminErrorResponse(error, 'admin.tournament-content.get');
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Expected application/json' }, { status: 415 });
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const draftId = String(body.draftId || '').trim();
  const vk = parseText(body.vkText, 'vkText');
  const telegram = parseText(body.telegramText, 'telegramText');
  if (!UUID_RE.test(draftId)) return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 });
  if (vk.error || telegram.error) return NextResponse.json({ error: vk.error || telegram.error }, { status: 400 });
  try {
    const pool = getPool();
    const before = await pool.query(`SELECT status::text AS status, vk_text, telegram_text
                                       FROM tournament_content_drafts WHERE id::text = $1 LIMIT 1`, [draftId]);
    if (!before.rowCount) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    if (String(before.rows[0]?.status || 'draft') !== 'draft') return NextResponse.json({ error: 'Only draft content can be edited' }, { status: 409 });
    await updateDraftText(pool, draftId, vk.value, telegram.value);
    await writeAuditLog({
      actorId: auth.actor.id, actorRole: auth.actor.role, action: 'tournament.content.save',
      entityType: 'tournament_content_draft', entityId: draftId,
      beforeState: { vkText: before.rows[0]?.vk_text, telegramText: before.rows[0]?.telegram_text },
      afterState: { vkText: vk.value, telegramText: telegram.value },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminErrorResponse(error, 'admin.tournament-content.patch');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'Expected application/json' }, { status: 415 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || '').trim();
  const pool = getPool();
  try {
    if (action === 'generate') {
      const tournamentId = String(body.tournamentId || '').trim();
      if (!UUID_RE.test(tournamentId)) return NextResponse.json({ error: 'Invalid tournament id' }, { status: 400 });
      const draftId = await generateTournamentContentDraft(tournamentId);
      if (!draftId) return NextResponse.json({ error: 'Unable to create draft' }, { status: 409 });
      await writeAuditLog({ actorId: auth.actor.id, actorRole: auth.actor.role, action: 'tournament.content.generate', entityType: 'tournament_content_draft', entityId: draftId, beforeState: { tournamentId } });
      return NextResponse.json({ ok: true, draftId });
    }

    if (action !== 'publish') return NextResponse.json({ error: 'action must be generate or publish' }, { status: 400 });
    const draftId = String(body.draftId || '').trim();
    if (!UUID_RE.test(draftId)) return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 });
    const draftResult = await pool.query(`SELECT d.id::text AS id, t.id::text AS tournament_id, t.name AS tournament_name, to_jsonb(d) AS payload
                                           FROM tournament_content_drafts d JOIN tournaments t ON t.id = d.tournament_id
                                          WHERE d.id::text = $1 LIMIT 1`, [draftId]);
    if (!draftResult.rowCount) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    const draft = parseDraftRow(draftResult.rows[0] as Record<string, unknown>);
    if (draft.status !== 'draft' && draft.status !== 'ready') return NextResponse.json({ error: 'Only draft content can be published' }, { status: 409 });
    const telegramChannel = String(process.env.TELEGRAM_CHANNEL_ID || '').trim();
    const vkToken = String(process.env.VK_GROUP_ACCESS_TOKEN || '').trim();
    const vkGroupId = String(process.env.VK_GROUP_ID || '').trim();
    const missing = [!telegramChannel && 'TELEGRAM_CHANNEL_ID', (!vkToken || !vkGroupId) && 'VK_GROUP_ACCESS_TOKEN/VK_GROUP_ID'].filter(Boolean);
    if (missing.length) return NextResponse.json({ error: `Publishing is not configured: ${missing.join(', ')}` }, { status: 409 });
    const text = draft.vk_text || draft.telegram_text;
    if (!text) return NextResponse.json({ error: 'Draft has no publishable text' }, { status: 400 });

    const [telegramResult, vkResult] = await Promise.all([
      sendTelegramChannelPost(telegramChannel, draft.telegram_text || text, 'Open tournament results', `https://lpvolley.ru/calendar/${draft.tournament_id}`),
      fetch('https://api.vk.com/method/wall.post', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ owner_id: `-${vkGroupId}`, from_group: '1', message: draft.vk_text || text, access_token: vkToken, v: '5.199' }),
      }).then(async (response) => ({ ok: response.ok && Boolean((await response.json().catch(() => null) as { response?: { post_id?: number }; error?: unknown } | null)?.response?.post_id) })).catch(() => ({ ok: false })),
    ]);
    if (telegramResult === null || !vkResult.ok) return NextResponse.json({ error: `Publication failed: ${telegramResult === null ? 'Telegram' : ''}${telegramResult === null && !vkResult.ok ? ' and ' : ''}${!vkResult.ok ? 'VK' : ''}` }, { status: 502 });
    await markDraftPublished(pool, draft.id);
    await writeAuditLog({ actorId: auth.actor.id, actorRole: auth.actor.role, action: 'tournament.content.publish', entityType: 'tournament_content_draft', entityId: draft.id, beforeState: { status: draft.status }, afterState: { status: 'published', channels: ['vk', 'telegram'] } });
    return NextResponse.json({ ok: true, channels: ['vk', 'telegram'] });
  } catch (error) {
    return adminErrorResponse(error, 'admin.tournament-content.post');
  }
}
