import { describe, expect, it } from 'vitest';

import {
  assessGoEngineTransition,
  canonicalizeGoV2Settings,
  isGoV2PublicEnabled,
  parseGoEngineVersion,
  requestedGoEngineVersion,
} from '../../web/lib/go-v2-activation';

describe('GO V2 canonical activation', () => {
  it('accepts only the two supported versions and prefers the canonical field', () => {
    expect(parseGoEngineVersion(1)).toBe(1);
    expect(parseGoEngineVersion('2')).toBe(2);
    expect(parseGoEngineVersion(0)).toBeNull();
    expect(parseGoEngineVersion('v2')).toBeNull();
    expect(requestedGoEngineVersion({
      goEngineVersion: 1,
      settings: { goEngineVersion: 2 },
    })).toBe(1);
    expect(requestedGoEngineVersion({
      settings: { goEngineVersion: 2, go_engine_version: 2 },
    })).toBeUndefined();
  });

  it('removes duplicate JSON version fields and fails public access closed', () => {
    expect(canonicalizeGoV2Settings({
      goEngineVersion: 2,
      go_engine_version: 2,
      goV2PublicEnabled: true,
      courts: 4,
    }, 1)).toEqual({ courts: 4, goV2PublicEnabled: false });
    expect(isGoV2PublicEnabled({
      goEngineVersion: 2,
      settings: { goV2PublicEnabled: true },
    })).toBe(true);
    expect(isGoV2PublicEnabled({
      goEngineVersion: 1,
      settings: { goV2PublicEnabled: true },
    })).toBe(false);
    expect(isGoV2PublicEnabled({ goEngineVersion: 2, settings: {} })).toBe(false);
  });

  it('allows an empty-state transition only before tournament start', () => {
    expect(assessGoEngineTransition({
      currentVersion: 1,
      nextVersion: 2,
      tournamentStatus: 'draft',
      hasLegacyGoState: false,
      hasV2State: false,
    })).toBeNull();
    expect(assessGoEngineTransition({
      currentVersion: 1,
      nextVersion: 2,
      tournamentStatus: 'draft',
      nextTournamentStatus: 'finished',
      hasLegacyGoState: false,
      hasV2State: false,
    })).toMatch(/только до начала/i);
    expect(assessGoEngineTransition({
      currentVersion: 1,
      nextVersion: 2,
      tournamentStatus: 'draft',
      hasLegacyGoState: true,
      hasV2State: false,
    })).toMatch(/Legacy GO уже материализован/);
    expect(assessGoEngineTransition({
      currentVersion: 2,
      nextVersion: 1,
      tournamentStatus: 'open',
      hasLegacyGoState: false,
      hasV2State: true,
    })).toMatch(/уже содержит состояние/);
  });
});
