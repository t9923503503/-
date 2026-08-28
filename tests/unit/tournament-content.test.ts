import { describe, expect, it } from 'vitest';

import { buildTournamentContentCopy } from '../../web/lib/tournament-content';

describe('tournament content copy', () => {
  it('shows podium places inside HARD and ADVANCE and uses engaging match facts', () => {
    const copy = buildTournamentContentCopy({
      tournamentName: 'Тайский микст',
      date: '25.07.2026',
      location: 'Малибу',
      division: 'Микст',
      resultsUrl: 'https://lpvolley.ru/calendar/tournament-1',
      matchStats: { matches: 12, totalPoints: 304, closeMatches: 3 },
      results: [
        { name: 'Килатов', place: 1, levelPlace: 1, level: 'hard', wins: 4, diff: 12, ratingPts: 100, gender: 'M' },
        { name: 'Пелымская', place: 1, levelPlace: 1, level: 'hard', wins: 4, diff: 25, ratingPts: 100, gender: 'W' },
        { name: 'Камышев', place: 2, levelPlace: 2, level: 'hard', wins: 2, diff: 5, ratingPts: 90, gender: 'M' },
        { name: 'Робак', place: 2, levelPlace: 2, level: 'hard', wins: 3, diff: 9, ratingPts: 90, gender: 'W' },
        { name: 'Лебедев', place: 5, levelPlace: 1, level: 'advance', wins: 4, diff: 23, ratingPts: 65, gender: 'M' },
        { name: 'Шерметова', place: 5, levelPlace: 1, level: 'advance', wins: 2, diff: 0, ratingPts: 65, gender: 'W' },
      ],
    });

    expect(copy.text).toContain('🏆 Пьедесталы по уровням');
    expect(copy.text).toContain('HARD\n🥇 1 место — Килатов (м) · Пелымская (ж)');
    expect(copy.text).toContain('ADVANCE\n🥇 1 место — Лебедев (м) · Шерметова (ж)');
    expect(copy.text).toContain('6 игроков · 2 уровня · 12 матчей · 304 разыгранных очков');
    expect(copy.text).toContain('3 матча завершились с разницей всего в 1–2 очка');
    expect(copy.text).toContain('Серия дня: Килатов, Пелымская и Лебедев — по 4 победы');
    expect(copy.text).toContain('Все места, очки и расклад по раундам — смотрите на сайте');
    expect(copy.text).not.toContain('рейтинг +');
    expect(copy.stats).toMatchObject({ participantCount: 6, levelCount: 2, matches: 12, totalPoints: 304 });
  });

  it('falls back to a regular podium when result levels are unavailable', () => {
    const copy = buildTournamentContentCopy({
      tournamentName: 'Кубок пляжа',
      date: '10.08.2026',
      resultsUrl: 'https://lpvolley.ru/calendar/tournament-2',
      results: [
        { name: 'Анна', place: 1, wins: 3, diff: 8, ratingPts: 100 },
        { name: 'Мария', place: 2, wins: 2, diff: 3, ratingPts: 90 },
        { name: 'Ольга', place: 3, wins: 1, diff: -1, ratingPts: 82 },
      ],
    });

    expect(copy.text).toContain('🏆 Пьедестал\n🥇 1 место — Анна\n🥈 2 место — Мария\n🥉 3 место — Ольга');
    expect(copy.text).toContain('⚡ Турнир в цифрах: 3 игрока');
    expect(copy.text).toContain('🔥 Серия дня: Анна — 3 победы');
    expect(copy.podiums).toHaveLength(3);
  });
});
