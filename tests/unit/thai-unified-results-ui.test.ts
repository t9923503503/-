/** @vitest-environment jsdom */

import * as React from '../../web/node_modules/react';
import { createRoot, type Root } from '../../web/node_modules/react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ThaiUnifiedResultsTable } from '../../web/components/thai-live/ThaiUnifiedResultsTable';
import type {
  ThaiUnifiedPlayerResult,
  ThaiUnifiedResultsModel,
} from '../../web/lib/thai-live/unified-results';

function player(input: {
  id: string;
  name: string;
  gender: 'M' | 'W';
  points: number;
  rating: number;
}): ThaiUnifiedPlayerResult {
  return {
    playerId: input.id,
    playerName: input.name,
    playerPhotoUrl: '',
    gender: input.gender,
    pool: input.gender === 'M' ? 'primary' : 'secondary',
    poolLabel: input.gender === 'M' ? 'Мужчины' : 'Женщины',
    finalZone: 'hard',
    finalZoneLabel: 'HARD',
    finalLocalPlace: input.gender === 'M' ? 1 : 2,
    finalGlobalPlace: input.gender === 'M' ? 1 : 2,
    ratingPts: input.rating,
    overall: {
      matches: 2,
      wins: input.points > 10 ? 2 : 1,
      losses: input.points > 10 ? 0 : 1,
      winRate: input.points > 10 ? 100 : 50,
      pointsP: input.points,
      diff: input.points > 10 ? 5 : 1,
      scored: 30,
      conceded: input.points > 10 ? 25 : 29,
      ratio: input.points > 10 ? 1.2 : 30 / 29,
    },
    rounds: { r1: null, r2: null },
    matches: [
      {
        matchId: `${input.id}-match`,
        round: 'r1',
        roundNo: 1,
        courtId: 'court-1',
        courtNo: 1,
        courtLabel: 'Корт 1',
        zone: null,
        zoneLabel: null,
        tourNo: 1,
        partner: { playerId: 'partner-id', playerName: 'Партнёр' },
        opponents: [
          { playerId: 'opponent-1', playerName: 'Соперник 1' },
          { playerId: null, playerName: 'Соперник 2' },
        ],
        teamScore: 15,
        opponentScore: 13,
        status: 'confirmed',
        outcome: 'win',
        diff: 2,
        pointsP: 11,
      },
    ],
    advanced: {
      closeWins: 1,
      bestWin: null,
      worstLoss: null,
      longestWinStreak: 1,
      uniquePartners: 1,
    },
  };
}

function model(): ThaiUnifiedResultsModel {
  return {
    tournamentId: 'tournament-id',
    tournamentName: 'Thai test',
    variant: 'MF',
    stage: 'r2_live',
    isOfficial: false,
    summary: { playerCount: 2, totalMatches: 2, confirmedMatches: 2, totalScore: 56 },
    players: [
      player({ id: 'alpha-id', name: 'Альфа', gender: 'M', points: 10, rating: 90 }),
      player({ id: 'beta-id', name: 'Бета', gender: 'W', points: 20, rating: 80 }),
    ],
  };
}

describe('ThaiUnifiedResultsTable', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    React.act(() => root.render(React.createElement(ThaiUnifiedResultsTable, { model: model() })));
  });

  afterEach(() => {
    React.act(() => root.unmount());
    host.remove();
  });

  it('searches and filters players while keeping preliminary ratings hidden', () => {
    expect(host.textContent).toContain('Предварительные');
    expect(host.textContent).not.toContain('90');

    const search = host.querySelector<HTMLInputElement>('input[type="search"]');
    expect(search).not.toBeNull();
    React.act(() => {
      if (!search) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'Бета');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(host.textContent).toContain('Бета');
    expect(host.textContent).not.toContain('Альфа');

    const gender = host.querySelector<HTMLSelectElement>('select');
    React.act(() => {
      if (!gender) return;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(gender, 'M');
      gender.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.textContent).toContain('Игроки не найдены');
  });

  it('sorts numeric columns and expands linked match participants', () => {
    const pointsSort = host.querySelector<HTMLButtonElement>('button[aria-label="Сортировать: P"]');
    expect(pointsSort).not.toBeNull();
    React.act(() => pointsSort?.click());

    const desktopNames = Array.from(host.querySelectorAll('th[scope="row"]')).map((node) =>
      node.textContent?.trim(),
    );
    expect(desktopNames[0]).toContain('Бета');

    const expand = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Показать подробности: Альфа"]',
    );
    expect(expand).not.toBeNull();
    React.act(() => expand?.click());

    expect(host.querySelector('a[href="/players/partner-id"]')?.textContent).toBe('Партнёр');
    expect(host.querySelector('a[href="/players/opponent-1"]')?.textContent).toBe('Соперник 1');
  });
});
