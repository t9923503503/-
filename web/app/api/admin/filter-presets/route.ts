import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import {
  deleteFilterPreset,
  listFilterPresets,
  upsertFilterPreset,
} from '@/lib/admin-queries';
import {
  normalizeFilterPresetInput,
  validateFilterPresetInput,
} from '@/lib/admin-validators';
import { adminErrorResponse } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';

const DEFAULT_SCOPE = 'admin.players';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  try {
    const scope = req.nextUrl.searchParams.get('scope') || DEFAULT_SCOPE;
    if (scope !== DEFAULT_SCOPE) return NextResponse.json({ error: 'Unsupported preset scope' }, { status: 400 });
    return NextResponse.json(await listFilterPresets(auth.actor.id, scope));
  } catch (err) {
    return adminErrorResponse(err, 'filter-presets.get');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const input = normalizeFilterPresetInput(body);
    const err = validateFilterPresetInput(input);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const preset = await upsertFilterPreset({
      id: input.id || undefined,
      actorId: auth.actor.id,
      scope: input.scope,
      name: input.name,
      filters: input.filters,
    });
    return NextResponse.json(preset);
  } catch (err) {
    return adminErrorResponse(err, 'filter-presets.post');
  }
}

export async function PUT(req: NextRequest) {
  return POST(req);
}

export async function DELETE(req: NextRequest) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  try {
    const id = req.nextUrl.searchParams.get('id') || '';
    const scope = req.nextUrl.searchParams.get('scope') || DEFAULT_SCOPE;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    if (scope !== DEFAULT_SCOPE) return NextResponse.json({ error: 'Unsupported preset scope' }, { status: 400 });
    const ok = await deleteFilterPreset({ id, actorId: auth.actor.id, scope });
    return NextResponse.json({ ok });
  } catch (err) {
    return adminErrorResponse(err, 'filter-presets.delete');
  }
}
