import { describe, expect, it } from 'vitest';
import {
  buildPlayersCsv,
  buildTelegramReport,
  buildTournamentsCsv,
} from '../../web/lib/admin-reports.ts';

describe('admin reports helpers', () => {
  it('builds tournaments CSV with header and rows', () => {
    const csv = buildTournamentsCsv([
      {
        id: 't1',
        name: 'Thai Friday',
        date: '2026-03-20',
        time: '19:00',
        location: 'Beach A',
        format: 'thai',
        division: 'mix',
        level: 'open',
        capacity: 16,
        status: 'open',
        participantCount: 12,
      },
    ]);

    expect(csv).toContain('id,name,date,time');
    expect(csv).toContain('"t1","Thai Friday","2026-03-20"');
  });

  it('builds players CSV and telegram payload', () => {
    const players = [
      {
        id: 'p1',
        name: 'Alex',
        gender: 'M',
        status: 'active',
        ratingM: 10,
        ratingW: 0,
        ratingMix: 15,
        wins: 3,
        totalPts: 18,
        tournamentsPlayed: 2,
        photoUrl: '/images/players/p1.jpg',
        birthDate: '1999-01-01',
        heightCm: 188,
        weightKg: 82,
        skillLevel: 'advanced',
        preferredPosition: 'defender',
        mixReady: true,
        phone: '+70000000000',
        telegram: '@alex',
        adminComment: 'captain',
      },
      {
        id: 'p2',
        name: 'Nina',
        gender: 'W',
        status: 'active',
        ratingM: 0,
        ratingW: 12,
        ratingMix: 21,
        wins: 4,
        totalPts: 24,
        tournamentsPlayed: 3,
        photoUrl: '',
        birthDate: '',
        heightCm: null,
        weightKg: null,
        skillLevel: 'pro',
        preferredPosition: 'universal',
        mixReady: true,
        phone: '',
        telegram: '@nina',
        adminComment: '',
      },
    ];

    const tournaments = [
      {
        id: 't1',
        name: 'Cup',
        date: '2026-03-20',
        time: '19:00',
        location: 'Beach A',
        format: 'thai',
        division: 'mix',
        level: 'open',
        capacity: 16,
        status: 'finished',
        participantCount: 16,
      },
    ];

    const csv = buildPlayersCsv(players);
    const tg = buildTelegramReport({ players, tournaments });

    expect(csv).toContain('"p1","Alex","M","active"');
    expect(csv).toContain('tournamentsPlayed,photoUrl,birthDate,heightCm,weightKg,skillLevel,preferredPosition,mixReady,phone,telegram,adminComment');
    expect(csv).toContain('"advanced","defender","true"');
    expect(tg).toContain('ТОП-5 Mix рейтинга:');
    expect(tg).toContain('1. Nina');
  });
});
