import { describe, expect, it } from 'vitest';
import {
  buildTournamentEventKey,
  filterCalendarTournaments,
  normalizeCalendarFilters,
  sortTournamentsForCalendar,
} from '../../web/lib/calendar.ts';
import {
  enrichTournamentRuntimeState,
  resolveTournamentStatus,
} from '../../web/lib/tournament-status.ts';
import { localPosterForTournamentId } from '../../web/lib/tournament-poster.ts';
import { shouldHideTournamentFromPublic } from '../../web/lib/queries.ts';

const NOW = new Date(2026, 3, 2, 12, 0, 0);

function makeTournament(overrides = {}) {
  return {
    id: 't-1',
    name: 'Round Robin Malibu',
    date: '2026-04-10',
    time: '19:00',
    location: 'Malibu',
    format: 'Round Robin',
    division: 'Мужской',
    level: 'medium',
    capacity: 16,
    status: 'open',
    participantCount: 8,
    waitlistCount: 0,
    prize: '',
    photoUrl: '',
    formatCode: '',
    ...overrides,
  };
}

describe('tournament status helpers', () => {
  it('auto switches open tournaments to full when capacity is reached', () => {
    expect(
      resolveTournamentStatus(
        makeTournament({
          participantCount: 16,
        }),
        NOW
      )
    ).toBe('full');
  });

  it('reopens stale full tournaments when spots appear again', () => {
    expect(
      resolveTournamentStatus(
        makeTournament({
          status: 'full',
          participantCount: 14,
        }),
        NOW
      )
    ).toBe('open');
  });

  it('marks past tournaments as finished automatically', () => {
    expect(
      resolveTournamentStatus(
        makeTournament({
          date: '2026-04-01',
          participantCount: 4,
        }),
        NOW
      )
    ).toBe('finished');
  });

  it('preserves cancelled tournaments', () => {
    expect(
      resolveTournamentStatus(
        makeTournament({
          status: 'cancelled',
          participantCount: 16,
        }),
        NOW
      )
    ).toBe('cancelled');
  });

  it('adds derived runtime fields for cards and detail pages', () => {
    const tournament = enrichTournamentRuntimeState(
      makeTournament({
        participantCount: 12,
      }),
      NOW
    );

    expect(tournament.status).toBe('open');
    expect(tournament.spotsLeft).toBe(4);
    expect(tournament.registrationClosed).toBe(false);
  });
});

describe('public tournament visibility', () => {
  it('hides QA, demo and explicitly private tournaments from public pages', () => {
    expect(
      shouldHideTournamentFromPublic({
        name: 'THAI MN FULL QA 2026-04-03',
        location: 'Malibu',
      })
    ).toBe(true);

    expect(
      shouldHideTournamentFromPublic({
        name: 'THAI R2 DEMO 2026-04-03',
        location: 'Demo Court',
      })
    ).toBe(true);

    expect(
      shouldHideTournamentFromPublic({
        name: 'Regular Open Cup',
        settings: { hideFromPublic: true },
      })
    ).toBe(true);
  });

  it('keeps regular public tournaments visible', () => {
    expect(
      shouldHideTournamentFromPublic({
        name: 'МОНСТРЫ × ЛЮТЫЕ',
        location: 'Малибу',
      })
    ).toBe(false);
  });
});

describe('calendar helpers', () => {
  const tournaments = sortTournamentsForCalendar([
    enrichTournamentRuntimeState(
      makeTournament({
        id: 'past',
        name: 'Past Event',
        date: '2026-03-20',
      }),
      NOW
    ),
    enrichTournamentRuntimeState(
      makeTournament({
        id: 'soon',
        name: 'Soon Event',
        date: '2026-04-03',
        time: '18:00',
      }),
      NOW
    ),
    enrichTournamentRuntimeState(
      makeTournament({
        id: 'later',
        name: 'Later Event',
        date: '2026-04-18',
        time: '20:00',
      }),
      NOW
    ),
  ]);

  it('normalizes GET filters from plain search params', () => {
    expect(
      normalizeCalendarFilters({
        q: ['malibu'],
        month: '2026-04',
        status: 'open',
        available: '1',
      })
    ).toEqual({
      query: 'malibu',
      month: '2026-04',
      format: '',
      division: '',
      level: '',
      status: 'open',
      available: true,
    });
  });

  it('sorts upcoming tournaments ascending and finished tournaments after them', () => {
    expect(tournaments.map((tournament) => tournament.id)).toEqual([
      'soon',
      'later',
      'past',
    ]);
  });

  it('filters tournaments by month, search query and available spots', () => {
    const filtered = filterCalendarTournaments(
      [
        ...tournaments,
        enrichTournamentRuntimeState(
          makeTournament({
            id: 'full',
            name: 'Full Malibu',
            date: '2026-04-08',
            participantCount: 16,
          }),
          NOW
        ),
      ],
      {
        query: 'malibu',
        month: '2026-04',
        format: '',
        division: '',
        level: '',
        status: 'all',
        available: true,
      }
    );

    expect(filtered.map((tournament) => tournament.id)).toEqual(['soon', 'later']);
  });

  it('uses time and location in the event grouping key', () => {
    const morning = buildTournamentEventKey(
      makeTournament({
        id: 'morning',
        time: '10:00',
        location: 'Malibu',
      })
    );
    const evening = buildTournamentEventKey(
      makeTournament({
        id: 'evening',
        time: '18:00',
        location: 'Malibu',
      })
    );
    const anotherClub = buildTournamentEventKey(
      makeTournament({
        id: 'club-2',
        time: '10:00',
        location: 'Sand Arena',
      })
    );

    expect(morning).not.toBe(evening);
    expect(morning).not.toBe(anotherClub);
  });

  it('uses the editorial photo for the finished Double Trouble tournament card', () => {
    expect(localPosterForTournamentId('a19522bb-864e-4520-8182-61e035c27894')).toBe(
      '/images/tournaments/a19522bb-864e-4520-8182-61e035c27894/hero.jpg'
    );
  });
});
