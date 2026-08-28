import { NextRequest } from 'next/server';
import { getAdminSessionFromRequest, type AdminActor } from '@/lib/admin-auth';
import {
  getPlayerTokenFromCookieHeader,
  verifyPlayerToken,
} from '@/lib/player-auth';

export type PlayActor =
  | { kind: 'admin'; admin: AdminActor }
  | { kind: 'user'; userId: number; email: string };

export function getPlayUserFromRequest(req: NextRequest): { id: number; email: string } | null {
  const token = getPlayerTokenFromCookieHeader(req.headers.get('cookie') || '');
  return token ? verifyPlayerToken(token) : null;
}

export function getPlayActor(req: NextRequest): PlayActor | null {
  const admin = getAdminSessionFromRequest(req);
  if (admin && admin.role !== 'viewer') return { kind: 'admin', admin };
  const user = getPlayUserFromRequest(req);
  return user ? { kind: 'user', userId: user.id, email: user.email } : null;
}

