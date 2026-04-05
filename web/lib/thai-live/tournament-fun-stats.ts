import type { Pool } from 'pg';
import { getPool } from '@/lib/db';

export type ThaiFunPoolKey = 'primary' | 'secondary' | 'all';

export interface ThaiFunWinLeader {
  playerId: string;
  playerName: string;
  wins: number;
  matchesPlayed: number;
}

export interface ThaiFunAbsoluteBlock {
  poolKey: ThaiFunPoolKey;
  poolLabel: string;
  leaders: ThaiFunWinLeader[];
}

export interface ThaiFunNamedValueLeader {
  playerId: string;
  playerName: string;
  value: number;
}

export interface ThaiFunBlowoutMatch {
  matchId: string;
  margin: number;
  team1Score: number;
  team2Score: number;
  roundType: 'r1' | 'r2';
  courtNo: number;
  courtLabel: string;
  tourNo: number;
  team1Labels: string;
  team2Labels: string;
}

export interface ThaiFunPairHighlight {
  playerAId: string;
  playerAName: string;
  playerBId: string;
  playerBName: string;
  teamScore: number;
  margin: number;
  roundType: 'r1' | 'r2';
  courtNo: number;
  courtLabel: string;
  tourNo: number;
}

export interface ThaiFunStats {
  absoluteLeaders: ThaiFunAbsoluteBlock[];
  universalSoldiers: ThaiFunNamedValueLeader[];
  closersKings: ThaiFunNamedValueLeader[];
  steamrollers: ThaiFunNamedValueLeader[];
  ironDefense: ThaiFunNamedValueLeader[];
  blowouts: ThaiFunBlowoutMatch[];
  idealMatches: ThaiFunPairHighlight[];
}

export interface ThaiFunMatchPlayer {
  playerId: string;
  playerName: string;
  teamSide: 1 | 2;
  playerRole: 'primary' | 'secondary';
}

export interface ThaiFunConfirmedMatch {
  matchId: string;
  matchNo: number;
  team1Score: number;
  team2Score: number;
  roundType: 'r1' | 'r2';
  courtNo: number;
  courtLabel: string;
  tourNo: number;
  players: ThaiFunMatchPlayer[];
}

function poolLabelForVariant(variant: string, poolKey: ThaiFunPoolKey): string {
  const v = String(variant || '').trim().toUpperCase();
  if (poolKey === 'all') return 'Общий зачёт';
  if (v === 'MF') return poolKey === 'primary' ? 'Мужчины' : 'Женщины';
  if (v === 'MN') return poolKey === 'primary' ? 'Профи' : 'Новички';
  return poolKey === 'primary' ? 'Пул A' : 'Пул B';
}

function sortedPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface PlayerAgg {
  playerId: string;
  playerName: string;
  role: 'primary' | 'secondary';
  matchesPlayed: number;
  wins: number;
  totalDiff: number;
  totalConceded: number;
  closeWins: number;
  partnerIds: Set<string>;
}

function ensureAgg(map: Map<string, PlayerAgg>, player: ThaiFunMatchPlayer): PlayerAgg {
  let row = map.get(player.playerId);
  if (!row) {
    row = {
      playerId: player.playerId,
      playerName: player.playerName,
      role: player.playerRole,
      matchesPlayed: 0,
      wins: 0,
      totalDiff: 0,
      totalConceded: 0,
      closeWins: 0,
      partnerIds: new Set(),
    };
    map.set(player.playerId, row);
  }
  return row;
}

/** Pure aggregation for unit tests and server. */
export function computeThaiFunStats(matches: ThaiFunConfirmedMatch[], variant: string): ThaiFunStats {
  const variantUpper = String(variant || '').trim().toUpperCase();
  const splitPools = variantUpper === 'MF' || variantUpper === 'MN';

  const byPlayer = new Map<string, PlayerAgg>();
  type PartnershipOnce = {
    a: ThaiFunMatchPlayer;
    b: ThaiFunMatchPlayer;
    teamScore: number;
    margin: number;
    match: ThaiFunConfirmedMatch;
  };
  const partnershipMeta = new Map<string, { count: number; record: PartnershipOnce | null }>();

  for (const match of matches) {
    const t1 = match.players.filter((p) => p.teamSide === 1);
    const t2 = match.players.filter((p) => p.teamSide === 2);
    const s1 = match.team1Score;
    const s2 = match.team2Score;
    const diff = s1 - s2;

    const win1 = diff > 0;
    const win2 = diff < 0;
    const marginWin1 = win1 ? diff : 0;
    const marginWin2 = win2 ? -diff : 0;

    const applyTeam = (team: ThaiFunMatchPlayer[], win: boolean, delta: number, conceded: number, marginIfWin: number) => {
      for (const p of team) {
        const agg = ensureAgg(byPlayer, p);
        agg.matchesPlayed += 1;
        agg.totalDiff += delta;
        agg.totalConceded += conceded;
        if (win) {
          agg.wins += 1;
          if (marginIfWin >= 1 && marginIfWin <= 2) {
            agg.closeWins += 1;
          }
        }
      }
      if (team.length >= 2) {
        const x = team[0]!;
        const y = team[1]!;
        const k = sortedPairKey(x.playerId, y.playerId);
        const prev = partnershipMeta.get(k);
        const newCount = (prev?.count ?? 0) + 1;
        const teamScore = team === t1 ? s1 : s2;
        const margin = team === t1 ? diff : -diff;
        const record: PartnershipOnce = { a: x, b: y, teamScore, margin, match };
        partnershipMeta.set(k, {
          count: newCount,
          record: newCount === 1 ? record : null,
        });
      }
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          const a = team[i]!;
          const b = team[j]!;
          ensureAgg(byPlayer, a).partnerIds.add(b.playerId);
          ensureAgg(byPlayer, b).partnerIds.add(a.playerId);
        }
      }
    };

    applyTeam(t1, win1, diff, s2, marginWin1);
    applyTeam(t2, win2, -diff, s1, marginWin2);
  }

  const aggs = [...byPlayer.values()];

  const winLeadersIn = (pred: (a: PlayerAgg) => boolean): ThaiFunWinLeader[] => {
    const subset = aggs.filter(pred);
    if (!subset.length) return [];
    const maxW = Math.max(...subset.map((a) => a.wins));
    if (maxW < 1) return [];
    return subset
      .filter((a) => a.wins === maxW)
      .map((a) => ({
        playerId: a.playerId,
        playerName: a.playerName,
        wins: a.wins,
        matchesPlayed: a.matchesPlayed,
      }));
  };

  const absoluteLeaders: ThaiFunAbsoluteBlock[] = [];
  if (splitPools) {
    absoluteLeaders.push({
      poolKey: 'primary',
      poolLabel: poolLabelForVariant(variantUpper, 'primary'),
      leaders: winLeadersIn((a) => a.role === 'primary'),
    });
    absoluteLeaders.push({
      poolKey: 'secondary',
      poolLabel: poolLabelForVariant(variantUpper, 'secondary'),
      leaders: winLeadersIn((a) => a.role === 'secondary'),
    });
  } else {
    absoluteLeaders.push({
      poolKey: 'all',
      poolLabel: poolLabelForVariant(variantUpper, 'all'),
      leaders: winLeadersIn(() => true),
    });
  }

  const maxPartners = aggs.length ? Math.max(...aggs.map((a) => a.partnerIds.size)) : 0;
  const universalSoldiers: ThaiFunNamedValueLeader[] = aggs
    .filter((a) => a.partnerIds.size === maxPartners && maxPartners > 0)
    .map((a) => ({ playerId: a.playerId, playerName: a.playerName, value: a.partnerIds.size }));

  const maxClose = aggs.length ? Math.max(...aggs.map((a) => a.closeWins)) : 0;
  const closersKings: ThaiFunNamedValueLeader[] =
    maxClose > 0
      ? aggs.filter((a) => a.closeWins === maxClose).map((a) => ({ playerId: a.playerId, playerName: a.playerName, value: a.closeWins }))
      : [];

  const maxDiff = aggs.length ? Math.max(...aggs.map((a) => a.totalDiff)) : 0;
  const steamrollers: ThaiFunNamedValueLeader[] = aggs
    .filter((a) => a.totalDiff === maxDiff)
    .map((a) => ({ playerId: a.playerId, playerName: a.playerName, value: a.totalDiff }));

  const minConc = aggs.length ? Math.min(...aggs.map((a) => a.totalConceded)) : 0;
  const ironCandidates = aggs.filter((a) => a.totalConceded === minConc);
  const maxMp = ironCandidates.length ? Math.max(...ironCandidates.map((a) => a.matchesPlayed)) : 0;
  const ironTie = ironCandidates.filter((a) => a.matchesPlayed === maxMp);
  const maxDiffAmongIron = ironTie.length ? Math.max(...ironTie.map((a) => a.totalDiff)) : 0;
  const ironDefense: ThaiFunNamedValueLeader[] = ironTie
    .filter((a) => a.totalDiff === maxDiffAmongIron)
    .map((a) => ({ playerId: a.playerId, playerName: a.playerName, value: a.totalConceded }));

  let maxMargin = 0;
  for (const m of matches) {
    const mg = Math.abs(m.team1Score - m.team2Score);
    if (mg > maxMargin) maxMargin = mg;
  }
  const blowouts: ThaiFunBlowoutMatch[] = [];
  for (const m of matches) {
    const mg = Math.abs(m.team1Score - m.team2Score);
    if (mg === maxMargin && maxMargin > 0) {
      const t1 = m.players.filter((p) => p.teamSide === 1);
      const t2 = m.players.filter((p) => p.teamSide === 2);
      blowouts.push({
        matchId: m.matchId,
        margin: mg,
        team1Score: m.team1Score,
        team2Score: m.team2Score,
        roundType: m.roundType,
        courtNo: m.courtNo,
        courtLabel: m.courtLabel,
        tourNo: m.tourNo,
        team1Labels: t1.map((p) => p.playerName).join(' + '),
        team2Labels: t2.map((p) => p.playerName).join(' + '),
      });
    }
  }

  const oncePairs = [...partnershipMeta.values()].filter((m) => m.count === 1 && m.record);
  let bestMargin = -Infinity;
  let bestScore = -Infinity;
  for (const m of oncePairs) {
    const rec = m.record!;
    if (rec.margin > bestMargin || (rec.margin === bestMargin && rec.teamScore > bestScore)) {
      bestMargin = rec.margin;
      bestScore = rec.teamScore;
    }
  }
  const idealMatches: ThaiFunPairHighlight[] = oncePairs
    .filter((m) => m.record!.margin === bestMargin && m.record!.teamScore === bestScore)
    .map((m) => {
      const rec = m.record!;
      return {
        playerAId: rec.a.playerId,
        playerAName: rec.a.playerName,
        playerBId: rec.b.playerId,
        playerBName: rec.b.playerName,
        teamScore: rec.teamScore,
        margin: rec.margin,
        roundType: rec.match.roundType,
        courtNo: rec.match.courtNo,
        courtLabel: rec.match.courtLabel,
        tourNo: rec.match.tourNo,
      };
    });

  return {
    absoluteLeaders,
    universalSoldiers,
    closersKings,
    steamrollers,
    ironDefense,
    blowouts,
    idealMatches,
  };
}

type MatchRow = {
  match_id: string;
  match_no: number;
  team1_score: number;
  team2_score: number;
  round_type: string;
  court_no: number;
  court_label: string;
  tour_no: number;
  player_id: string;
  player_name: string;
  team_side: number;
  player_role: string;
};

export async function loadConfirmedThaiTournamentMatches(
  pool: Pool,
  tournamentId: string,
): Promise<ThaiFunConfirmedMatch[]> {
  const tid = String(tournamentId || '').trim();
  if (!tid) return [];

  const res = await pool.query<MatchRow>(
    `
      SELECT
        m.id AS match_id,
        m.match_no,
        m.team1_score,
        m.team2_score,
        tr.round_type,
        tc.court_no,
        tc.label AS court_label,
        tt.tour_no,
        mp.player_id,
        p.name AS player_name,
        mp.team_side,
        mp.player_role
      FROM thai_match m
      JOIN thai_tour tt ON tt.id = m.tour_id
      JOIN thai_court tc ON tc.id = tt.court_id
      JOIN thai_round tr ON tr.id = tc.round_id
      JOIN thai_match_player mp ON mp.match_id = m.id
      JOIN players p ON p.id = mp.player_id
      WHERE tr.tournament_id = $1::uuid
        AND m.status = 'confirmed'
        AND m.team1_score IS NOT NULL
        AND m.team2_score IS NOT NULL
      ORDER BY tr.round_type, tc.court_no, tt.tour_no, m.match_no, mp.team_side, mp.player_role
    `,
    [tid],
  );

  const byMatch = new Map<string, ThaiFunConfirmedMatch & { players: ThaiFunMatchPlayer[] }>();
  for (const row of res.rows) {
    const mid = String(row.match_id);
    let m = byMatch.get(mid);
    if (!m) {
      const rt = String(row.round_type).toLowerCase() === 'r2' ? 'r2' : 'r1';
      m = {
        matchId: mid,
        matchNo: Number(row.match_no) || 1,
        team1Score: Number(row.team1_score),
        team2Score: Number(row.team2_score),
        roundType: rt,
        courtNo: Number(row.court_no) || 1,
        courtLabel: String(row.court_label || ''),
        tourNo: Number(row.tour_no) || 1,
        players: [],
      };
      byMatch.set(mid, m);
    }
    const role = String(row.player_role).toLowerCase() === 'secondary' ? 'secondary' : 'primary';
    const side = Number(row.team_side) === 2 ? 2 : 1;
    m.players.push({
      playerId: String(row.player_id),
      playerName: String(row.player_name || ''),
      teamSide: side as 1 | 2,
      playerRole: role,
    });
  }

  return [...byMatch.values()].map(({ players, ...rest }) => ({ ...rest, players }));
}

export async function getThaiTournamentFunStats(tournamentId: string, variant: string): Promise<ThaiFunStats> {
  const pool = getPool();
  const matches = await loadConfirmedThaiTournamentMatches(pool, tournamentId);
  return computeThaiFunStats(matches, variant);
}
