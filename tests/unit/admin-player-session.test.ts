import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { createPlayerToken } from '../../web/lib/player-auth';
import { getAdminSessionFromRequest } from '../../web/lib/admin-auth';

const queryMock = vi.fn();

vi.mock('../../web/lib/db.ts', () => ({
  getPool: () => ({ query: queryMock }),
}));

import { GET } from '../../web/app/api/admin/player-session/route';

function claimRequest(returnTo = '/admin') {
  const token = createPlayerToken(25, 'email-login@example.com');
  const url = `https://lpvolley.ru/api/admin/player-session?returnTo=${encodeURIComponent(returnTo)}`;
  return {
    url,
    nextUrl: new URL(url),
    headers: new Headers({ cookie: `player_session=${encodeURIComponent(token)}` }),
  } as unknown as NextRequest;
}

describe('admin player session claim', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('mints a full admin session for the linked account and preserves an admin return path', async () => {
    queryMock.mockResolvedValue({ rows: [{ email: 'sv-ugra@yandex.ru' }] });

    const response = await GET(claimRequest('/admin/tournaments?status=open'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://lpvolley.ru/admin/tournaments?status=open');
    const adminCookie = response.cookies.get('admin_session')?.value;
    expect(adminCookie).toBeTruthy();

    const authorizedRequest = {
      cookies: {
        get: (name: string) => name === 'admin_session' ? { value: adminCookie } : undefined,
      },
    } as unknown as NextRequest;
    expect(getAdminSessionFromRequest(authorizedRequest)).toEqual({ id: 'player:25', role: 'admin' });
  });

  it('does not grant admin access to another player account', async () => {
    queryMock.mockResolvedValue({ rows: [{ email: 'player@example.com' }] });

    const response = await GET(claimRequest('/admin'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://lpvolley.ru/admin/login');
    expect(response.cookies.get('admin_session')).toBeUndefined();
  });

  it('rejects external return targets', async () => {
    queryMock.mockResolvedValue({ rows: [{ email: 'sv-ugra@yandex.ru' }] });

    const response = await GET(claimRequest('//evil.example/admin'));

    expect(response.headers.get('location')).toBe('https://lpvolley.ru/admin');
  });
});
