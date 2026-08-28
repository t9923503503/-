export type TournamentContentLevel = 'hard' | 'advance' | 'medium' | 'light';

export type TournamentContentResult = {
  name: string;
  place: number;
  levelPlace?: number | null;
  level?: string | null;
  wins: number;
  diff: number;
  ratingPts: number;
  gender?: string | null;
};

export type TournamentContentMatchStats = {
  matches: number;
  totalPoints: number;
  closeMatches: number;
};

export type TournamentContentCopy = {
  text: string;
  podiums: Array<{
    level: TournamentContentLevel | null;
    place: number;
    names: string[];
  }>;
  stats: {
    participantCount: number;
    levelCount: number;
    matches: number;
    totalPoints: number;
    closeMatches: number;
    maxWins: number;
    maxWinPlayers: string[];
  };
};

const LEVEL_ORDER: TournamentContentLevel[] = ['hard', 'advance', 'medium', 'light'];
const LEVEL_LABELS: Record<TournamentContentLevel, string> = {
  hard: 'HARD',
  advance: 'ADVANCE',
  medium: 'MEDIUM',
  light: 'LIGHT',
};
const MEDALS = ['🥇', '🥈', '🥉'];

function normalizeLevel(value: unknown): TournamentContentLevel | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'hard' || normalized === 'pro') return 'hard';
  if (normalized === 'advance' || normalized === 'advanced') return 'advance';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'light' || normalized === 'lite' || normalized === 'easy') return 'light';
  return null;
}

function pluralRu(value: number, one: string, few: string, many: string): string {
  const absolute = Math.abs(Math.trunc(value));
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function joinNames(values: string[]): string {
  if (values.length <= 1) return values[0] || '';
  if (values.length === 2) return `${values[0]} и ${values[1]}`;
  return `${values.slice(0, -1).join(', ')} и ${values.at(-1)}`;
}

function genderSuffix(gender: unknown, showGender: boolean): string {
  if (!showGender) return '';
  const normalized = String(gender || '').trim().toUpperCase();
  if (normalized === 'M') return ' (м)';
  if (normalized === 'W') return ' (ж)';
  return '';
}

export function buildTournamentContentCopy(input: {
  tournamentName: string;
  date: string;
  location?: string;
  division?: string;
  resultsUrl: string;
  mediaUrl?: string;
  results: TournamentContentResult[];
  matchStats?: TournamentContentMatchStats | null;
  quotes?: string[];
}): TournamentContentCopy {
  const showGender = String(input.division || '').trim().toLowerCase().includes('микст');
  const rows = input.results.map((row) => ({
    ...row,
    name: String(row.name || '').trim(),
    place: Math.max(1, Math.trunc(Number(row.place) || 1)),
    levelPlace: Math.max(1, Math.trunc(Number(row.levelPlace || row.place) || 1)),
    normalizedLevel: normalizeLevel(row.level),
    wins: Math.max(0, Math.trunc(Number(row.wins) || 0)),
  })).filter((row) => row.name);
  const availableLevels = LEVEL_ORDER.filter((level) => rows.some((row) => row.normalizedLevel === level));
  const podiums: TournamentContentCopy['podiums'] = [];
  const podiumLines: string[] = [];

  if (availableLevels.length) {
    podiumLines.push('🏆 Пьедесталы по уровням');
    for (const level of availableLevels) {
      const levelLines: string[] = [];
      for (let place = 1; place <= 3; place += 1) {
        const names = rows
          .filter((row) => row.normalizedLevel === level && row.levelPlace === place)
          .sort((left, right) => String(left.gender || '').localeCompare(String(right.gender || '')))
          .map((row) => `${row.name}${genderSuffix(row.gender, showGender)}`);
        if (!names.length) continue;
        podiums.push({ level, place, names });
        levelLines.push(`${MEDALS[place - 1]} ${place} место — ${names.join(' · ')}`);
      }
      if (levelLines.length) {
        if (podiumLines.length > 1) podiumLines.push('');
        podiumLines.push(LEVEL_LABELS[level], ...levelLines);
      }
    }
  } else {
    podiumLines.push('🏆 Пьедестал');
    for (let place = 1; place <= 3; place += 1) {
      const names = rows
        .filter((row) => row.place === place)
        .map((row) => `${row.name}${genderSuffix(row.gender, showGender)}`);
      if (!names.length) continue;
      podiums.push({ level: null, place, names });
      podiumLines.push(`${MEDALS[place - 1]} ${place} место — ${names.join(' · ')}`);
    }
  }

  const matchStats = input.matchStats || { matches: 0, totalPoints: 0, closeMatches: 0 };
  const summaryParts = [
    `${rows.length} ${pluralRu(rows.length, 'игрок', 'игрока', 'игроков')}`,
    availableLevels.length > 1
      ? `${availableLevels.length} ${pluralRu(availableLevels.length, 'уровень', 'уровня', 'уровней')}`
      : '',
    matchStats.matches > 0
      ? `${formatNumber(matchStats.matches)} ${pluralRu(matchStats.matches, 'матч', 'матча', 'матчей')}`
      : '',
    matchStats.totalPoints > 0 ? `${formatNumber(matchStats.totalPoints)} разыгранных очков` : '',
  ].filter(Boolean);
  const maxWins = rows.reduce((maximum, row) => Math.max(maximum, row.wins), 0);
  const maxWinPlayers = maxWins > 0
    ? rows.filter((row) => row.wins === maxWins).map((row) => row.name).slice(0, 3)
    : [];
  const statLines = [`⚡ Турнир в цифрах: ${summaryParts.join(' · ')}`];
  if (matchStats.closeMatches > 0) {
    statLines.push(
      `🤏 ${matchStats.closeMatches} ${pluralRu(matchStats.closeMatches, 'матч завершился', 'матча завершились', 'матчей завершились')} с разницей всего в 1–2 очка`,
    );
  }
  if (maxWinPlayers.length) {
    statLines.push(
      `🔥 Серия дня: ${joinNames(maxWinPlayers)} — ${maxWinPlayers.length > 1 ? 'по ' : ''}${maxWins} ${pluralRu(maxWins, 'победа', 'победы', 'побед')}`,
    );
  }

  const header = [
    `🔥 Итоги турнира «${input.tournamentName}»`,
    `📅 ${input.date}${input.location ? ` · 📍 ${input.location}` : ''}`,
  ].join('\n');
  const quotes = (input.quotes || []).map((quote) => String(quote || '').trim()).filter(Boolean).slice(0, 2);
  const sections = [
    header,
    podiumLines.join('\n'),
    statLines.join('\n'),
    quotes.length ? quotes.map((quote) => `💬 «${quote}»`).join('\n') : '',
    `👀 Все места, очки и расклад по раундам — смотрите на сайте:\n${input.resultsUrl}`,
    input.mediaUrl ? `📸 Фото и видео турнира:\n${input.mediaUrl}` : '',
    '#лютыепляжники #lpvolley #пляжныйволейбол',
  ].filter(Boolean);

  return {
    text: sections.join('\n\n'),
    podiums,
    stats: {
      participantCount: rows.length,
      levelCount: availableLevels.length,
      matches: matchStats.matches,
      totalPoints: matchStats.totalPoints,
      closeMatches: matchStats.closeMatches,
      maxWins,
      maxWinPlayers,
    },
  };
}
