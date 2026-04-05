import { describe, expect, it } from 'vitest';
import { getTournamentFormatCode, normalizeTournamentDbTime } from '../../web/lib/admin-tournament-db.ts';

describe('admin tournament db helpers', () => {
  it('normalizes empty db time values to null', () => {
    expect(normalizeTournamentDbTime('')).toBeNull();
    expect(normalizeTournamentDbTime('   ')).toBeNull();
    expect(normalizeTournamentDbTime(' 20:15 ')).toBe('20:15');
  });

  it('maps only supported tournament format codes', () => {
    expect(getTournamentFormatCode('King of the Court')).toBe('kotc');
    expect(getTournamentFormatCode('IPT Mixed')).toBe('ipt_mixed');
    expect(getTournamentFormatCode('Round Robin')).toBe('classic');
    expect(getTournamentFormatCode('Thai')).toBeNull();
    expect(getTournamentFormatCode('Round Robin', ['kotc'])).toBeNull();
  });
});
