import type { Pool } from 'pg';

import { getPool } from './db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Relation = 'together' | 'against';
type Outcome = 'win' | 'loss' | 'draw';

type MatchRow = {
  match_id: string;
  tournament_id: string;
  tournament_name: string;
  tournament_date: string | Date;
  round_type: string;
  court_no: number;
  court_label: string;
  tour_no: number;
  match_no: number;
  team1_score: number;
  team2_score: number;
  primary_id: string;
  primary_name: string;
  primary_photo_url: string | null;
  primary_side: number;
  other_id: string;
  other_name: string;
  other_photo_url: string | null;
  other_side: number;
};

type Streak = {
  outcome: Outcome;
  count: number;
};

type PlayerSummary = {
  id: string;
  name: string;
  photoUrl: string;
  totalMeetings: number;
  togetherMeetings: number;
  togetherWins: number;
  togetherLosses: number;
  togetherWinRate: number;
  againstMeetings: number;
  againstWins: number;
  againstLosses: number;
  againstWinRate: number;
  totalWins: number;
  totalDraws: number;
  winRate: number;
  lastMeetingDate: string;
  recentForm: Outcome[];
  currentStreak: Streak | null;
};

type MeetingPlayer = {
  id: string;
  name: string;
  photoUrl: string;
  isPrimary: boolean;
  isSelected: boolean;
};

type Meeting = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  format: 'THAI';
  relation: Relation;
  outcome: Outcome;
  scoreLabel: string;
  stageLabel: string;
  team1: MeetingPlayer[];
  team2: MeetingPlayer[];
};

type RelationStats = {
  meetings: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
};

const RECENT_FORM_LIMIT = 5;
const CLOSE_MATCH_POINT_GAP = 2;

function isoDate(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

function percent(wins: number, meetings: number): number {
  return meetings ? Math.round((wins / meetings) * 100) : 0;
}

function outcomeStats(meetings: Meeting[]): RelationStats {
  const wins = meetings.filter((meeting) => meeting.outcome === 'win').length;
  const losses = meetings.filter((meeting) => meeting.outcome === 'loss').length;
  const draws = meetings.length - wins - losses;
  return { meetings: meetings.length, wins, losses, draws, winRate: percent(wins, meetings.length) };
}

function recentForm(meetings: Meeting[]): Outcome[] {
  return meetings.slice(0, RECENT_FORM_LIMIT).map((meeting) => meeting.outcome);
}

function currentStreak(meetings: Meeting[]): Streak | null {
  const outcome = meetings[0]?.outcome;
  if (!outcome) return null;
  let count = 0;
  for (const meeting of meetings) {
    if (meeting.outcome !== outcome) break;
    count += 1;
  }
  return { outcome, count };
}

function longestWinStreak(meetings: Meeting[]): number {
  let longest = 0;
  let current = 0;
  for (const meeting of meetings) {
    current = meeting.outcome === 'win' ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function meetingPointGap(meeting: Meeting): number {
  const [own, opponent] = meeting.scoreLabel.split(':').map(Number);
  return Math.abs((Number.isFinite(own) ? own : 0) - (Number.isFinite(opponent) ? opponent : 0));
}

function relationStats(meetings: Meeting[], relation: Relation): RelationStats {
  const selected = meetings.filter((meeting) => meeting.relation === relation);
  const wins = selected.filter((meeting) => meeting.outcome === 'win').length;
  const losses = selected.filter((meeting) => meeting.outcome === 'loss').length;
  const draws = selected.length - wins - losses;
  return { meetings: selected.length, wins, losses, draws, winRate: percent(wins, selected.length) };
}

async function loadRows(pool: Pool, playerId: string): Promise<MatchRow[]> {
  const { rows } = await pool.query<MatchRow>(
    `
      WITH player_matches AS (
        SELECT
          m.id AS match_id,
          t.id AS tournament_id,
          COALESCE(t.name, '') AS tournament_name,
          t.date AS tournament_date,
          tr.round_type,
          tc.court_no,
          tc.label AS court_label,
          tt.tour_no,
          m.match_no,
          m.team1_score,
          m.team2_score,
          self.player_id AS primary_id,
          COALESCE(primary_player.name, '') AS primary_name,
          primary_player.photo_url AS primary_photo_url,
          self.team_side AS primary_side
        FROM thai_match m
        JOIN thai_tour tt ON tt.id = m.tour_id
        JOIN thai_court tc ON tc.id = tt.court_id
        JOIN thai_round tr ON tr.id = tc.round_id
        JOIN tournaments t ON t.id = tr.tournament_id
        JOIN thai_match_player self ON self.match_id = m.id AND self.player_id = $1::uuid
        JOIN players primary_player ON primary_player.id = self.player_id
        WHERE m.status = 'confirmed'
          AND m.team1_score IS NOT NULL
          AND m.team2_score IS NOT NULL
          AND COALESCE(t.settings->>'kotcNextDemoEnabled', 'false') <> 'true'
      )
      SELECT
        pm.*,
        other.player_id AS other_id,
        COALESCE(p.name, '') AS other_name,
        p.photo_url AS other_photo_url,
        other.team_side AS other_side
      FROM player_matches pm
      JOIN thai_match_player other ON other.match_id = pm.match_id AND other.player_id <> $1::uuid
      JOIN players p ON p.id = other.player_id
      ORDER BY pm.tournament_date DESC, pm.round_type DESC, pm.tour_no DESC, pm.match_no DESC
    `,
    [playerId],
  );
  return rows;
}

function rowOutcome(row: MatchRow): Outcome {
  const own = Number(row.primary_side) === 2 ? Number(row.team2_score) : Number(row.team1_score);
  const opponent = Number(row.primary_side) === 2 ? Number(row.team1_score) : Number(row.team2_score);
  return own === opponent ? 'draw' : own > opponent ? 'win' : 'loss';
}

function meetingTeams(rows: MatchRow[], selectedOtherId: string) {
  const first = rows[0];
  const players = new Map<string, MeetingPlayer & { side: number }>();
  players.set(String(first.primary_id), {
    id: String(first.primary_id),
    name: String(first.primary_name || ''),
    photoUrl: String(first.primary_photo_url || ''),
    isPrimary: true,
    isSelected: false,
    side: Number(first.primary_side),
  });
  for (const row of rows) {
    players.set(String(row.other_id), {
      id: String(row.other_id),
      name: String(row.other_name || ''),
      photoUrl: String(row.other_photo_url || ''),
      isPrimary: false,
      isSelected: String(row.other_id) === selectedOtherId,
      side: Number(row.other_side),
    });
  }
  const team = (side: number): MeetingPlayer[] =>
    [...players.values()]
      .filter((player) => player.side === side)
      .sort(
        (left, right) =>
          Number(right.isPrimary) - Number(left.isPrimary) ||
          Number(right.isSelected) - Number(left.isSelected) ||
          left.name.localeCompare(right.name, 'ru'),
      )
      .map((player) => ({
        id: player.id,
        name: player.name,
        photoUrl: player.photoUrl,
        isPrimary: player.isPrimary,
        isSelected: player.isSelected,
      }));
  return { team1: team(1), team2: team(2) };
}

function rowMeeting(row: MatchRow, matchRows: MatchRow[] = [row]): Meeting {
  const round = String(row.round_type || '').toLowerCase() === 'r2' ? 'R2' : 'R1';
  const court = Number(row.court_no) || String(row.court_label || '').replace(/\D+/g, '') || 1;
  const teams = meetingTeams(matchRows, String(row.other_id));
  return {
    id: `${row.match_id}:${row.other_id}`,
    tournamentId: String(row.tournament_id),
    tournamentName: String(row.tournament_name || ''),
    tournamentDate: isoDate(row.tournament_date),
    format: 'THAI',
    relation: Number(row.primary_side) === Number(row.other_side) ? 'together' : 'against',
    outcome: rowOutcome(row),
    // The score sits between team1 and team2 in the UI, so its order must
    // always match the teams shown on the left and right. The outcome itself
    // is still calculated from the primary player's side in rowOutcome().
    scoreLabel: `${Number(row.team1_score)}:${Number(row.team2_score)}`,
    stageLabel: `${round} · К${court} · Т${Number(row.tour_no) || 1} · Матч ${Number(row.match_no) || 1}`,
    ...teams,
  };
}

function buildMeetings(rows: MatchRow[], selectedOtherId?: string): Meeting[] {
  const grouped = new Map<string, MatchRow[]>();
  for (const row of rows) grouped.set(row.match_id, [...(grouped.get(row.match_id) ?? []), row]);
  const meetings: Meeting[] = [];
  for (const matchRows of grouped.values()) {
    const selectedRow = selectedOtherId
      ? matchRows.find((row) => String(row.other_id) === selectedOtherId)
      : matchRows[0];
    if (selectedRow) meetings.push(rowMeeting(selectedRow, matchRows));
  }
  return meetings.sort((left, right) => right.tournamentDate.localeCompare(left.tournamentDate));
}

function summarizePlayer(rows: MatchRow[]): PlayerSummary {
  const meetings = buildMeetings(rows, String(rows[0].other_id));
  const together = relationStats(meetings, 'together');
  const against = relationStats(meetings, 'against');
  const totalWins = together.wins + against.wins;
  const totalDraws = together.draws + against.draws;
  return {
    id: String(rows[0].other_id),
    name: String(rows[0].other_name || ''),
    photoUrl: String(rows[0].other_photo_url || ''),
    totalMeetings: meetings.length,
    togetherMeetings: together.meetings,
    togetherWins: together.wins,
    togetherLosses: together.losses,
    togetherWinRate: together.winRate,
    againstMeetings: against.meetings,
    againstWins: against.wins,
    againstLosses: against.losses,
    againstWinRate: against.winRate,
    totalWins,
    totalDraws,
    winRate: percent(totalWins, meetings.length),
    lastMeetingDate: meetings[0]?.tournamentDate ?? '',
    recentForm: recentForm(meetings),
    currentStreak: currentStreak(meetings),
  };
}

function compareCandidates(sort: string) {
  const metric: keyof PlayerSummary =
    sort === 'together'
      ? 'togetherMeetings'
      : sort === 'against'
        ? 'againstMeetings'
        : sort === 'wins'
          ? 'totalWins'
          : sort === 'winRate'
            ? 'winRate'
            : 'totalMeetings';
  return (left: PlayerSummary, right: PlayerSummary) =>
    Number(right[metric]) - Number(left[metric]) ||
    right.totalMeetings - left.totalMeetings ||
    left.name.localeCompare(right.name, 'ru');
}

function pickMax(players: PlayerSummary[], metric: keyof PlayerSummary): PlayerSummary | null {
  const first = [...players].sort((left, right) =>
    Number(right[metric]) - Number(left[metric]) || right.totalMeetings - left.totalMeetings,
  )[0];
  return first && Number(first[metric]) > 0 ? first : null;
}

export async function fetchHeadToHeadCandidates(options: {
  playerId: string;
  query?: string;
  limit?: number;
  sort?: string;
}) {
  if (!UUID_RE.test(options.playerId)) throw new Error('INVALID_PLAYER_ID');
  const rows = await loadRows(getPool(), options.playerId);
  const grouped = new Map<string, MatchRow[]>();
  for (const row of rows) grouped.set(row.other_id, [...(grouped.get(row.other_id) ?? []), row]);
  const allPlayers = [...grouped.values()].map(summarizePlayer);
  const query = String(options.query || '').trim().toLocaleLowerCase('ru');
  const players = allPlayers
    .filter((player) => !query || player.name.toLocaleLowerCase('ru').includes(query))
    .sort(compareCandidates(options.sort || 'total'))
    .slice(0, Math.max(1, Math.min(options.limit ?? 12, 50)));
  const eligiblePartners = allPlayers.filter((player) => player.togetherMeetings >= 3);
  const eligibleRivals = allPlayers.filter((player) => player.againstMeetings >= 3);
  const allMeetings = buildMeetings(rows);
  const totals = outcomeStats(allMeetings);

  return {
    summary: {
      opponents: allPlayers.length,
      uniqueMatches: allMeetings.length,
      tournaments: new Set(allMeetings.map((meeting) => meeting.tournamentId)).size,
      wins: totals.wins,
      losses: totals.losses,
      draws: totals.draws,
      winRate: totals.winRate,
      firstDate: allMeetings.at(-1)?.tournamentDate ?? '',
      lastDate: allMeetings[0]?.tournamentDate ?? '',
      recentForm: recentForm(allMeetings),
      currentStreak: currentStreak(allMeetings),
    },
    players,
    highlights: {
      frequentPartner: pickMax(allPlayers, 'togetherMeetings'),
      mainRival: pickMax(allPlayers, 'againstMeetings'),
      bestPartner: [...eligiblePartners].sort(
        (left, right) => right.togetherWinRate - left.togetherWinRate || right.togetherMeetings - left.togetherMeetings,
      )[0] ?? null,
      toughestRival: [...eligibleRivals].sort(
        (left, right) => left.againstWinRate - right.againstWinRate || right.againstMeetings - left.againstMeetings,
      )[0] ?? null,
    },
  };
}

export async function fetchHeadToHeadDetails(playerId: string, otherId: string) {
  if (!UUID_RE.test(playerId) || !UUID_RE.test(otherId) || playerId === otherId) {
    throw new Error('INVALID_PLAYER_ID');
  }
  const allRows = await loadRows(getPool(), playerId);
  const selectedMatchIds = new Set(
    allRows.filter((row) => String(row.other_id) === otherId).map((row) => String(row.match_id)),
  );
  const rows = allRows.filter((row) => selectedMatchIds.has(String(row.match_id)));
  const meetings = buildMeetings(rows, otherId);
  const together = relationStats(meetings, 'together');
  const against = relationStats(meetings, 'against');
  const total = outcomeStats(meetings);
  const tournamentGroups = new Map<string, Meeting[]>();
  for (const meeting of meetings) {
    tournamentGroups.set(meeting.tournamentId, [
      ...(tournamentGroups.get(meeting.tournamentId) ?? []),
      meeting,
    ]);
  }
  const tournaments = [...tournamentGroups.values()].map((items) => {
    const stats = outcomeStats(items);
    return {
      id: items[0].tournamentId,
      name: items[0].tournamentName,
      date: items[0].tournamentDate,
      meetings: stats.meetings,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      together: relationStats(items, 'together'),
      against: relationStats(items, 'against'),
      items,
    };
  });
  const biggestWin = meetings
    .filter((meeting) => meeting.outcome === 'win')
    .sort((left, right) => meetingPointGap(right) - meetingPointGap(left))[0] ?? null;
  const closestMatch = [...meetings].sort(
    (left, right) => meetingPointGap(left) - meetingPointGap(right),
  )[0] ?? null;

  return {
    together,
    against,
    total,
    recentForm: recentForm(meetings),
    currentStreak: currentStreak(meetings),
    longestWinStreak: longestWinStreak(meetings),
    closeMatches: meetings.filter((meeting) => meetingPointGap(meeting) <= CLOSE_MATCH_POINT_GAP).length,
    standout: {
      biggestWin,
      closestMatch,
    },
    byFormat: meetings.length ? [{ format: 'THAI', together, against }] : [],
    meetings,
    tournaments,
    coverage: {
      firstDate: meetings.at(-1)?.tournamentDate ?? '',
      lastDate: meetings[0]?.tournamentDate ?? '',
      formats: meetings.length ? ['THAI'] : [],
      tournamentCount: tournaments.length,
    },
  };
}
