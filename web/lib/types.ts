export interface Player {
  id: string;
  name: string;
  gender: 'M' | 'W';
  status: 'active' | 'temporary';
  ratingM: number;
  ratingW: number;
  ratingMix: number;
  tournamentsM: number;
  tournamentsW: number;
  tournamentsMix: number;
  wins: number;
  totalPts: number;
  lastSeen: string;
  photoUrl: string;
  city: string;
  level: string;
  bio: string;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  name: string;
  gender: 'M' | 'W';
  rating: number;
  tournaments: number;
  wins: number;
  gold: number;
  silver: number;
  bronze: number;
  lastSeen: string;
  photoUrl: string;
  topLevel: string;
}

export interface MedalEntry {
  rank: number;
  playerId: string;
  name: string;
  photoUrl: string;
  gender: 'M' | 'W';
  gold: number;
  silver: number;
  bronze: number;
  hardWins: number;
  advancedWins: number;
  mediumWins: number;
  lightWins: number;
  kotcWins: number;
  thaiWins: number;
  iptWins: number;
}

export interface Tournament {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  format: string;
  division: string;
  level: string;
  capacity: number;
  status: 'open' | 'full' | 'finished' | 'cancelled';
  participantCount: number;
  waitlistCount?: number;
  partnerRequestCount?: number;
  prize: string;
  photoUrl: string;
  formatCode: string;
  registrationClosed?: boolean;
  spotsLeft?: number | null;
  description?: string;
  participantListText?: string;
}

export interface TournamentResult {
  playerId: string;
  playerName: string;
  place: number;
  gamePts: number;
  ratingPts: number;
  gender: 'M' | 'W';

  // Optional fields used by personal cabinet UI
  tournamentId?: string;
  tournamentName?: string;
  tournamentDate?: string;
  ratingType?: 'M' | 'W' | 'Mix';
  wins?: number;
  diff?: number;
  coef?: number | string;
  balls?: number;
  /** Thai Next: ссылка на зрительское табло (архивный снимок на той же странице). */
  thaiSpectatorBoardUrl?: string | null;
  /** Уровень турнира: hard, advanced, medium, light и т.д. */
  level?: string | null;
  /** Формат турнира: KOTC, Thai, IPT и т.д. */
  format?: string | null;
}

export type RatingType = 'M' | 'W' | 'Mix';
export type TournamentFormatFilter = 'all' | 'kotc' | 'dt' | 'thai';

export type TeamStatus = 'looking_for_partner' | 'confirmed' | 'waitlist' | 'withdrawn';

export interface Team {
  id: string;
  tournamentId: string;
  player1Id: string;
  player1Name: string;
  player2Id: string | null;
  player2Name: string | null;
  status: TeamStatus;
  seed: number | null;
  createdAt: string;
}

export interface RatingHistoryEntry {
  id: string;
  playerId: string;
  tournamentId: string;
  tournamentName: string;
  formatCode: string;
  pointsChanged: number;
  newTotalRating: number;
  place: number | null;
  createdAt: string;
}
