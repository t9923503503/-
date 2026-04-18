import { describe, expect, it } from 'vitest';
import {
  buildLegacyKotcFallbackUrl,
  buildSudyamLaunchUrl,
  getSudyamFormatForTournament,
  parseSudyamLaunch,
} from '../../web/lib/sudyam-launch.ts';

describe('Sudyam launch contract', () => {
  it('maps admin tournament labels into canonical format slugs', () => {
    expect(getSudyamFormatForTournament('IPT Mixed')).toBe('ipt');
    expect(getSudyamFormatForTournament('Thai')).toBe('thai');
    expect(getSudyamFormatForTournament('King of the Court')).toBe('kotc');
    expect(getSudyamFormatForTournament('Round Robin')).toBe('rr');
    expect(getSudyamFormatForTournament('Groups + Olympic')).toBe('go');
  });

  it('builds canonical sudyam launch URLs', () => {
    expect(buildSudyamLaunchUrl({ tournamentId: 'ipt-1', format: 'ipt' })).toBe('/sudyam?tournamentId=ipt-1&format=ipt');
    expect(buildSudyamLaunchUrl({ tournamentId: 'thai-1', format: 'thai' })).toBe('/sudyam?tournamentId=thai-1&format=thai');
    expect(buildSudyamLaunchUrl({ tournamentId: 'kotc-1', format: 'kotc' })).toBe('/sudyam?tournamentId=kotc-1&format=kotc');
    expect(buildSudyamLaunchUrl({ tournamentId: 'rr-1', format: 'rr' })).toBe('/sudyam?tournamentId=rr-1&format=rr');
    expect(buildSudyamLaunchUrl({ tournamentId: 'go-1', format: 'go' })).toBe('/sudyam?tournamentId=go-1&format=go');
  });

  it('keeps legacy params backward-compatible but does not force legacy mode from compat links', () => {
    expect(
      parseSudyamLaunch({
        legacyTournamentId: 'rr-legacy',
        legacyFormat: 'rr',
        legacy: '1',
      }),
    ).toEqual({
      source: 'legacy',
      tournamentId: 'rr-legacy',
      format: 'rr',
      forceLegacy: false,
    });
  });

  it('keeps explicit legacy mode only on canonical URLs', () => {
    expect(
      parseSudyamLaunch({
        tournamentId: 'kotc-legacy',
        format: 'kotc',
        legacy: '1',
      }),
    ).toEqual({
      source: 'canonical',
      tournamentId: 'kotc-legacy',
      format: 'kotc',
      forceLegacy: true,
    });
  });

  it('builds legacy KOTC fallback URLs from canonical targets', () => {
    expect(buildLegacyKotcFallbackUrl({ tournamentId: 'ipt-2', format: 'ipt' })).toBe(
      '/kotc/?legacyTournamentId=ipt-2&legacyFormat=ipt&startTab=roster',
    );
  });
});
