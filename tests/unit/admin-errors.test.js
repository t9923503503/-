import { describe, expect, it } from 'vitest';
import { adminErrorResponse } from '../../web/lib/admin-errors.ts';

async function readJson(response) {
  return response.json();
}

describe('adminErrorResponse', () => {
  it('maps tournament check constraint failures to 400 responses', async () => {
    const capacity = adminErrorResponse(
      new Error('new row for relation "tournaments" violates check constraint "tournaments_capacity_check"'),
      'tournaments.post'
    );
    expect(capacity.status).toBe(400);
    await expect(readJson(capacity)).resolves.toEqual({ error: 'Capacity must be at least 4' });

    const division = adminErrorResponse(
      new Error('new row for relation "tournaments" violates check constraint "tournaments_division_check"'),
      'tournaments.post'
    );
    expect(division.status).toBe(400);
    await expect(readJson(division)).resolves.toEqual({
      error: 'Division must be Мужской, Женский, or Микст',
    });

    const level = adminErrorResponse(
      new Error('new row for relation "tournaments" violates check constraint "tournaments_level_check"'),
      'tournaments.post'
    );
    expect(level.status).toBe(400);
    await expect(readJson(level)).resolves.toEqual({
      error: 'Level must be hard, medium, or easy',
    });
  });

  it('passes through explicit service error statuses instead of masking them as 500', async () => {
    const controlled = new Error('Thai judge launch is blocked for finished tournaments');
    controlled.status = 409;

    const response = adminErrorResponse(controlled, 'tournaments.thaiLive');

    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toEqual({
      error: 'Thai judge launch is blocked for finished tournaments',
    });
  });
});
