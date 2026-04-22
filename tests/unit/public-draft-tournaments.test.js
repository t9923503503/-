import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../web/lib/db.ts', () => ({
  getPool: () => ({
    query: queryMock,
  }),
}));

describe('public draft tournament filters', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://test';
    queryMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
    if (originalDatabaseUrl == null) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('hides draft tournaments from public calendar listings and tournament-by-id', async () => {
    queryMock.mockImplementation(async (sql, params) => {
      const text = String(sql);
      if (text.includes('FROM tournaments t') && text.includes('GROUP BY t.id') && Array.isArray(params) && params[0] === 200) {
        return {
          rows: [
            {
              id: 'tour-open',
              name: 'Open Cup',
              date: '2026-04-22',
              time: '10:00',
              location: 'Court 1',
              format: 'Round Robin',
              division: 'mix',
              level: 'medium',
              capacity: 16,
              status: 'open',
              participant_count: 8,
              waitlist_count: 0,
              partner_request_count: 0,
              prize: '',
              photo_url: '',
              format_code: '',
              settings: {},
            },
            {
              id: 'tour-draft',
              name: 'Draft Cup',
              date: '2026-04-22',
              time: '12:00',
              location: 'Court 2',
              format: 'Round Robin',
              division: 'mix',
              level: 'medium',
              capacity: 16,
              status: 'draft',
              participant_count: 4,
              waitlist_count: 0,
              partner_request_count: 0,
              prize: '',
              photo_url: '',
              format_code: '',
              settings: {},
            },
          ],
        };
      }
      if (text.includes('FROM player_requests pr')) {
        return { rows: [] };
      }
      if (text.includes('WHERE t.id = $1')) {
        return {
          rows: [
            {
              id: params[0],
              name: 'Draft Cup',
              date: '2026-04-22',
              time: '12:00',
              location: 'Court 2',
              format: 'Round Robin',
              division: 'mix',
              level: 'medium',
              capacity: 16,
              status: 'draft',
              participant_count: 4,
              waitlist_count: 0,
              partner_request_count: 0,
              prize: '',
              photo_url: '',
              format_code: '',
              settings: {},
            },
          ],
        };
      }
      throw new Error(`Unexpected query: ${text}`);
    });

    const { fetchTournamentById, fetchTournaments } = await import('../../web/lib/queries.ts');

    await expect(fetchTournaments(20)).resolves.toEqual([
      expect.objectContaining({
        id: 'tour-open',
        status: 'open',
      }),
    ]);
    await expect(fetchTournamentById('tour-draft')).resolves.toBeNull();
  });

  it('keeps draft tournaments out of thai court feeds and partner requests', async () => {
    queryMock.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM tournaments t') && text.includes('JOIN thai_round r')) {
        expect(text).toContain("COALESCE(t.status, '') NOT IN ('cancelled', 'draft')");
        return { rows: [] };
      }
      if (text.includes('FROM player_requests pr')) {
        expect(text).toContain("COALESCE(t.status, 'open') NOT IN ('cancelled', 'draft')");
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${text}`);
    });

    const { fetchActiveThaiJudgeTournaments, fetchPartnerRequests } = await import('../../web/lib/queries.ts');

    await expect(fetchActiveThaiJudgeTournaments()).resolves.toEqual([]);
    await expect(fetchPartnerRequests()).resolves.toEqual([]);
  });
});
