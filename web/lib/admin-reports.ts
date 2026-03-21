import type { AdminPlayer, AdminTournament } from './admin-queries';

function csvEscape(value: string | number): string {
  const raw = String(value ?? '');
  const escaped = raw.replaceAll('"', '""');
  return `"${escaped}"`;
}

export function buildTournamentsCsv(rows: AdminTournament[]): string {
  const header = [
    'id',
    'name',
    'date',
    'time',
    'location',
    'format',
    'division',
    'level',
    'capacity',
    'status',
    'participantCount',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.name,
        row.date,
        row.time,
        row.location,
        row.format,
        row.division,
        row.level,
        row.capacity,
        row.status,
        row.participantCount,
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  return lines.join('\n');
}

export function buildPlayersCsv(rows: AdminPlayer[]): string {
  const header = [
    'id',
    'name',
    'gender',
    'status',
    'ratingM',
    'ratingW',
    'ratingMix',
    'wins',
    'totalPts',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.name,
        row.gender,
        row.status,
        row.ratingM,
        row.ratingW,
        row.ratingMix,
        row.wins,
        row.totalPts,
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  return lines.join('\n');
}

export function buildTelegramReport(args: {
  tournaments: AdminTournament[];
  players: AdminPlayer[];
}): string {
  const now = new Date().toLocaleString('ru-RU');
  const activeTournaments = args.tournaments.filter((t) => t.status === 'open' || t.status === 'full').length;
  const finishedTournaments = args.tournaments.filter((t) => t.status === 'finished').length;
  const activePlayers = args.players.filter((p) => p.status === 'active').length;
  const temporaryPlayers = args.players.filter((p) => p.status === 'temporary').length;

  const topByRating = [...args.players]
    .sort((a, b) => b.ratingMix - a.ratingMix)
    .slice(0, 5);

  const lines = [
    'ADMIN REPORT',
    `Дата: ${now}`,
    '',
    `Турниры: всего ${args.tournaments.length}, активные ${activeTournaments}, завершенные ${finishedTournaments}`,
    `Игроки: всего ${args.players.length}, active ${activePlayers}, temporary ${temporaryPlayers}`,
    '',
    'ТОП-5 Mix рейтинга:',
  ];

  topByRating.forEach((p, idx) => {
    lines.push(`${idx + 1}. ${p.name} (${p.id}) — ${p.ratingMix}`);
  });

  if (topByRating.length === 0) {
    lines.push('Нет данных');
  }

  return lines.join('\n');
}
