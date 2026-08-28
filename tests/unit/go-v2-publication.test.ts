import { describe, expect, it } from 'vitest';

import {
  assessGoV2PublicationRisk,
  buildGoV2PublicationRequestHash,
} from '../../web/lib/go-v2/publication';
import { adminCommandRequestHash } from '../../web/lib/go-v2/client-admin-command';
import type { GoV2CommandEnvelope } from '../../web/lib/go-v2/contracts';

function command(toState: 'published' | 'unpublished'): GoV2CommandEnvelope {
  return {
    expectedVersion: 7,
    commandId: 'publication-command-0001',
    requestHash: '0'.repeat(64),
    deviceId: 'admin-browser-1',
    idempotencyKey: 'publication-command-0001',
    reasonCode: 'publication_state_changed',
    reasonNote: 'Closed pilot publication decision',
    payload: { toState },
  };
}

describe('GO V2 publication contract', () => {
  it('classifies participant or schedule disclosure as red and unpublish as amber', () => {
    expect(assessGoV2PublicationRisk({ toState: 'published', entryCount: 1, assignmentCount: 0 }))
      .toBe('red');
    expect(assessGoV2PublicationRisk({ toState: 'published', entryCount: 0, assignmentCount: 1 }))
      .toBe('red');
    expect(assessGoV2PublicationRisk({ toState: 'published', entryCount: 0, assignmentCount: 0 }))
      .toBe('amber');
    expect(assessGoV2PublicationRisk({ toState: 'unpublished', entryCount: 40, assignmentCount: 80 }))
      .toBe('amber');
  });

  it('builds a deterministic command-bound SHA-256 request hash', () => {
    const tournamentId = '11111111-1111-4111-8111-111111111111';
    const first = command('published');
    const sameWithDifferentDeclaredHash = { ...first, requestHash: 'f'.repeat(64) };
    const expected = buildGoV2PublicationRequestHash('publication.preview', tournamentId, first);

    expect(expected).toMatch(/^[0-9a-f]{64}$/);
    expect(buildGoV2PublicationRequestHash('publication.preview', tournamentId, sameWithDifferentDeclaredHash))
      .toBe(expected);
    expect(buildGoV2PublicationRequestHash('publication.preview', tournamentId, command('unpublished')))
      .not.toBe(expected);
    expect(buildGoV2PublicationRequestHash('publication.commit', tournamentId, first))
      .not.toBe(expected);
  });

  it('uses the exact same canonical hash in the admin browser command', async () => {
    const tournamentId = '11111111-1111-4111-8111-111111111111';
    const envelope = command('published');
    const clientEnvelope = { ...envelope, toState: 'published' };
    await expect(adminCommandRequestHash(tournamentId, '/publication/preview', clientEnvelope))
      .resolves.toBe(buildGoV2PublicationRequestHash('publication.preview', tournamentId, envelope));
  });
});
