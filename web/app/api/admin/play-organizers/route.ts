import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/admin-auth';
import { listOrganizerCandidateUsers, listPlayResources, savePlayOrganizer } from '@/lib/play-service';
import { playErrorResponse } from '@/lib/play-http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiRole(req, 'viewer');
  if (!auth.ok) return auth.response;
  try {
    const [resources, users] = await Promise.all([listPlayResources(true, true), listOrganizerCandidateUsers()]);
    return NextResponse.json({ resources, users });
  } catch (error) {
    return playErrorResponse(error, 'admin.organizers.get');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireApiRole(req, 'admin');
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    return NextResponse.json(await savePlayOrganizer(body));
  } catch (error) {
    return playErrorResponse(error, 'admin.organizers.post');
  }
}
