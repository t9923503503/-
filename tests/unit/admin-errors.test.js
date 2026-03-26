import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminErrorResponse } from '../../web/lib/admin-errors.ts';

describe('admin error response mapping', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps missing DATABASE_URL to 503', async () => {
    const res = adminErrorResponse(new Error('Missing DATABASE_URL env var'), 'ctx');
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe('Database is not configured');
  });

  it('maps unknown errors to 500', async () => {
    const res = adminErrorResponse(new Error('boom'), 'ctx');
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Internal error');
  });
});
