import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/admin-audit';
import { requireApiRole } from '@/lib/admin-auth';
import {
  addTournamentPhoto,
  deleteTournamentPhoto,
  getTournamentMedia,
  MAX_TOURNAMENT_GALLERY_IMAGES,
  MAX_TOURNAMENT_PHOTO_BYTES,
  type TournamentPhotoKind,
} from '@/lib/tournament-media';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MediaActor = {
  id: string;
  role: 'admin' | 'operator';
  source: 'admin' | 'telegram';
};

function telegramAdminIds(): Set<string> {
  return new Set(
    String(process.env.TELEGRAM_ADMIN_USER_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => /^[1-9]\d*$/.test(value)),
  );
}

function isTelegramAgent(req: NextRequest): boolean {
  const secret = String(process.env.TELEGRAM_AGENT_SECRET || '');
  return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`;
}

function mediaError(error: unknown): NextResponse {
  const message = String((error as Error)?.message || '');
  if (message === 'TOURNAMENT_MEDIA_NOT_FOUND') {
    return NextResponse.json({ error: 'Турнир не найден' }, { status: 404 });
  }
  if (message === 'TOURNAMENT_MEDIA_REQUIRES_FINISHED_TOURNAMENT') {
    return NextResponse.json({ error: 'Фотоотчёт доступен только для завершённого турнира' }, { status: 409 });
  }
  if (message === 'TOURNAMENT_MEDIA_GALLERY_FULL') {
    return NextResponse.json(
      { error: `В галерее уже ${MAX_TOURNAMENT_GALLERY_IMAGES} фото — удалите одно перед загрузкой нового` },
      { status: 409 },
    );
  }
  if (message === 'TOURNAMENT_MEDIA_PHOTO_NOT_FOUND') {
    return NextResponse.json({ error: 'Фото не найдено' }, { status: 404 });
  }
  if (message.includes('UNSUPPORTED_IMAGE') || message.includes('INVALID_IMAGE')) {
    return NextResponse.json({ error: 'Повреждённое изображение или неподдерживаемый формат' }, { status: 400 });
  }
  if (message.includes('FILE_TOO_LARGE')) {
    return NextResponse.json({ error: 'Фото слишком большое' }, { status: 413 });
  }
  console.error('[tournament-media]', error);
  return NextResponse.json({ error: 'Не удалось обработать фото турнира' }, { status: 500 });
}

async function tournamentIdFromParams(params: Promise<{ id: string }>): Promise<string | null> {
  const { id } = await params;
  return UUID_PATTERN.test(String(id || '')) ? id : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  const tournamentId = await tournamentIdFromParams(params);
  if (!tournamentId) return NextResponse.json({ error: 'Некорректный id турнира' }, { status: 400 });
  try {
    const media = await getTournamentMedia(tournamentId);
    return NextResponse.json({ ...media, limit: MAX_TOURNAMENT_GALLERY_IMAGES });
  } catch (error) {
    return mediaError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tournamentId = await tournamentIdFromParams(params);
  if (!tournamentId) return NextResponse.json({ error: 'Некорректный id турнира' }, { status: 400 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Ожидается загрузка файла' }, { status: 400 });
  }

  let actor: MediaActor;
  if (isTelegramAgent(req)) {
    const telegramUserId = String(formData.get('telegramUserId') || '').trim();
    if (!telegramAdminIds().has(telegramUserId)) {
      return NextResponse.json({ error: 'Нет прав администратора' }, { status: 403 });
    }
    actor = { id: `telegram:${telegramUserId}`, role: 'operator', source: 'telegram' };
  } else {
    const auth = requireApiRole(req, 'operator');
    if (!auth.ok) return auth.response;
    actor = { id: auth.actor.id, role: auth.actor.role === 'admin' ? 'admin' : 'operator', source: 'admin' };
  }

  const kind = String(formData.get('kind') || '') as TournamentPhotoKind;
  if (kind !== 'cover' && kind !== 'gallery') {
    return NextResponse.json({ error: 'Не выбран тип фото' }, { status: 400 });
  }
  const photo = formData.get('photo');
  if (!(photo instanceof File)) return NextResponse.json({ error: 'Файл не выбран' }, { status: 400 });
  if (photo.size > MAX_TOURNAMENT_PHOTO_BYTES) {
    return NextResponse.json({ error: 'Фото больше 15 МБ' }, { status: 413 });
  }

  try {
    const media = await addTournamentPhoto({
      tournamentId,
      kind,
      input: Buffer.from(await photo.arrayBuffer()),
      caption: String(formData.get('caption') || ''),
      source: actor.source,
      uploadedBy: actor.id,
      telegramFileId: String(formData.get('telegramFileId') || ''),
      telegramFileUniqueId: String(formData.get('telegramFileUniqueId') || ''),
    });

    await writeAuditLog({
      actorId: actor.id,
      actorRole: actor.role,
      action: kind === 'cover' ? 'tournament.media.setCover' : 'tournament.media.addGallery',
      entityType: 'tournament',
      entityId: tournamentId,
      afterState: { source: actor.source, galleryCount: media.gallery.length },
    });

    return NextResponse.json({ ok: true, ...media, limit: MAX_TOURNAMENT_GALLERY_IMAGES });
  } catch (error) {
    return mediaError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireApiRole(req, 'operator');
  if (!auth.ok) return auth.response;
  const tournamentId = await tournamentIdFromParams(params);
  if (!tournamentId) return NextResponse.json({ error: 'Некорректный id турнира' }, { status: 400 });

  const kind = String(req.nextUrl.searchParams.get('kind') || '') as TournamentPhotoKind;
  const photoId = String(req.nextUrl.searchParams.get('photoId') || '');
  if (kind !== 'cover' && kind !== 'gallery') {
    return NextResponse.json({ error: 'Не выбран тип фото' }, { status: 400 });
  }
  if (kind === 'gallery' && !UUID_PATTERN.test(photoId)) {
    return NextResponse.json({ error: 'Некорректный id фото' }, { status: 400 });
  }

  try {
    const media = await deleteTournamentPhoto({ tournamentId, kind, photoId });
    await writeAuditLog({
      actorId: auth.actor.id,
      actorRole: auth.actor.role,
      action: kind === 'cover' ? 'tournament.media.deleteCover' : 'tournament.media.deleteGallery',
      entityType: 'tournament',
      entityId: tournamentId,
      afterState: { galleryCount: media.gallery.length },
    });
    return NextResponse.json({ ok: true, ...media, limit: MAX_TOURNAMENT_GALLERY_IMAGES });
  } catch (error) {
    return mediaError(error);
  }
}
