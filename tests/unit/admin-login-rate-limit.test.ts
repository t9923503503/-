import { afterEach, describe, expect, it } from 'vitest';
import {
  checkAdminLoginRateLimit,
  clearAdminLoginFailures,
  recordAdminLoginFailure,
  resetAdminLoginRateLimitForTests,
} from '../../web/lib/admin-login-rate-limit';

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);

function headers(ip: string): Headers {
  return new Headers({ 'x-real-ip': ip });
}

describe('admin login rate limit', () => {
  afterEach(() => resetAdminLoginRateLimitForTests());

  it('locks the same IP and actor after five failed attempts', () => {
    const requestHeaders = headers('203.0.113.10');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(checkAdminLoginRateLimit(requestHeaders, 'owner', NOW).blocked).toBe(false);
      recordAdminLoginFailure(requestHeaders, 'owner', NOW);
    }

    expect(checkAdminLoginRateLimit(requestHeaders, 'owner', NOW)).toEqual({
      blocked: true,
      retryAfterSeconds: 900,
    });
  });

  it('does not lock a different actor or IP and clears a successful identity', () => {
    const requestHeaders = headers('203.0.113.10');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      recordAdminLoginFailure(requestHeaders, 'owner', NOW);
    }

    expect(checkAdminLoginRateLimit(requestHeaders, 'operator', NOW).blocked).toBe(false);
    expect(checkAdminLoginRateLimit(headers('203.0.113.11'), 'owner', NOW).blocked).toBe(false);

    clearAdminLoginFailures(requestHeaders, 'owner');
    expect(checkAdminLoginRateLimit(requestHeaders, 'owner', NOW).blocked).toBe(false);
  });

  it('releases the lock after fifteen minutes', () => {
    const requestHeaders = headers('203.0.113.10');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      recordAdminLoginFailure(requestHeaders, '', NOW);
    }

    expect(checkAdminLoginRateLimit(requestHeaders, '', NOW + 15 * 60 * 1000).blocked).toBe(false);
  });
});
