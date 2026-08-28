import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createPlayerToken,
  createRecentPlayerAuthToken,
  getPlayerTokenFromCookieHeader,
  verifyPlayerToken,
  verifyRecentPlayerAuthToken,
} from '../../web/lib/player-auth';

describe('player session separation', () => {
  beforeEach(() => {
    process.env.PLAYER_SESSION_SECRET = 'unit-test-player-session-secret';
  });

  it('does not accept a recent-auth token as a player session', () => {
    const session = createPlayerToken(17, 'player@example.com');
    const recent = createRecentPlayerAuthToken(17);

    expect(verifyPlayerToken(session)).toEqual({ id: 17, email: 'player@example.com' });
    expect(verifyRecentPlayerAuthToken(recent)).toEqual({ id: 17 });
    expect(verifyPlayerToken(recent)).toBeNull();
    expect(verifyRecentPlayerAuthToken(session)).toBeNull();
  });

  it('matches cookie names exactly instead of accepting a suffix collision', () => {
    expect(getPlayerTokenFromCookieHeader('not_player_session=attacker')).toBeNull();
    expect(getPlayerTokenFromCookieHeader('not_player_session=attacker; player_session=real'))
      .toBe('real');
  });

  it('fails closed for a signed-token-shaped JSON null payload', () => {
    const nullPayload = `${Buffer.from('null').toString('base64')}.${'0'.repeat(64)}`;
    expect(() => verifyPlayerToken(nullPayload)).not.toThrow();
    expect(() => verifyRecentPlayerAuthToken(nullPayload)).not.toThrow();
    expect(verifyPlayerToken(nullPayload)).toBeNull();
    expect(verifyRecentPlayerAuthToken(nullPayload)).toBeNull();
    expect(verifyPlayerToken(`${createPlayerToken(17, 'player@example.com')}.extra`)).toBeNull();
  });

  it('keeps valid legacy sessions during the cookie migration but rejects purpose confusion', () => {
    const legacyData = {
      id: 17,
      email: 'legacy@example.com',
      exp: Date.now() + 60_000,
    };
    const legacyPayload = JSON.stringify(legacyData);
    const legacySignature = crypto
      .createHmac('sha256', process.env.PLAYER_SESSION_SECRET!)
      .update(legacyPayload)
      .digest('hex');
    const legacyToken = `${Buffer.from(legacyPayload).toString('base64')}.${legacySignature}`;
    expect(verifyPlayerToken(legacyToken)).toEqual({ id: 17, email: 'legacy@example.com' });

    const confusedData = {
      ...legacyData,
      aud: 'player-session',
      purpose: 'recent-player-auth',
    };
    const confusedPayload = JSON.stringify(confusedData);
    const confusedSignature = crypto
      .createHmac('sha256', process.env.PLAYER_SESSION_SECRET!)
      .update(`player-session\n${confusedPayload}`)
      .digest('hex');
    const confusedToken = `${Buffer.from(confusedPayload).toString('base64')}.${confusedSignature}`;
    expect(verifyPlayerToken(confusedToken)).toBeNull();
  });

  it('uses host-only production cookie names and distinct token audiences', () => {
    const source = readFileSync(resolve('web/lib/player-auth.ts'), 'utf8');
    expect(source).toContain("'__Host-lpvolley_player_session'");
    expect(source).toContain("'__Host-lpvolley_recent_auth'");
    expect(source).toContain("aud: 'player-session'");
    expect(source).toContain("aud: 'recent-player-auth'");
  });
});
