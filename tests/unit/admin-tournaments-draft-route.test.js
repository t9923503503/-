import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requireApiRoleMock = vi.fn();
const createTournamentMock = vi.fn();
const updateTournamentMock = vi.fn();
const getTournamentByIdMock = vi.fn();
const writeAuditLogMock = vi.fn();

vi.mock('../../web/lib/admin-auth.ts', () => ({
  requireApiRole: requireApiRoleMock,
}));

vi.mock('../../web/lib/admin-queries.ts', () => ({
  createTournament: createTournamentMock,
  deleteTournament: vi.fn(),
  getPlayersByIds: vi.fn().mockResolvedValue([]),
  getTournamentById: getTournamentByIdMock,
  listTournaments: vi.fn(),
  updateTournament: updateTournamentMock,
}));

vi.mock('../../web/lib/admin-audit.ts', () => ({
  writeAuditLog: writeAuditLogMock,
}));

async function readJson(response) {
  return response.json();
}

describe('admin tournaments draft route', () => {
  beforeEach(() => {
    requireApiRoleMock.mockReturnValue({
      ok: true,
      actor: { id: 'operator-1', role: 'operator' },
    });
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('creates draft tournaments through the admin route', async () => {
    createTournamentMock.mockResolvedValue({
      id: 'tour-draft',
      name: 'Draft Cup',
      status: 'draft',
    });

    const { POST } = await import('../../web/app/api/admin/tournaments/route.ts');
    const response = await POST(
      new Request('http://localhost/api/admin/tournaments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Draft Cup',
          date: '2026-04-22',
          time: '10:00',
          format: 'Round Robin',
          division: 'mix',
          level: 'medium',
          capacity: 16,
          status: 'draft',
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      id: 'tour-draft',
      status: 'draft',
    });
    expect(createTournamentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Draft Cup',
        status: 'draft',
      }),
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tournament.create',
        entityId: 'tour-draft',
      }),
    );
  });

  it('transitions draft tournaments to open through PUT without direct SQL coupling', async () => {
    getTournamentByIdMock.mockResolvedValue({
      id: 'tour-draft',
      name: 'Draft Cup',
      status: 'draft',
      settings: {},
    });
    updateTournamentMock.mockResolvedValue({
      id: 'tour-draft',
      name: 'Draft Cup',
      status: 'open',
    });

    const { PUT } = await import('../../web/app/api/admin/tournaments/route.ts');
    const response = await PUT(
      new Request('http://localhost/api/admin/tournaments', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'tour-draft',
          name: 'Draft Cup',
          date: '2026-04-22',
          time: '10:00',
          format: 'Round Robin',
          division: 'mix',
          level: 'medium',
          capacity: 16,
          status: 'open',
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      id: 'tour-draft',
      status: 'open',
    });
    expect(updateTournamentMock).toHaveBeenCalledWith(
      'tour-draft',
      expect.objectContaining({
        status: 'open',
      }),
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tournament.update',
        entityId: 'tour-draft',
      }),
    );
  });
});
