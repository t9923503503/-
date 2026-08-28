import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { getAdminSessionFromCookies, requireApiRole } from '@/lib/admin-auth';

export async function requireCoachPageActor() {
  const actor = await getAdminSessionFromCookies();
  if (!actor) redirect('/coach/login');
  if (actor.role === 'viewer') redirect('/admin');
  return actor;
}

export function requireCoachApiActor(req: NextRequest) {
  return requireApiRole(req, 'operator');
}
