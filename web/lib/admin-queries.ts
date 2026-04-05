import * as pgQueries from './admin-queries-pg';
import * as remoteQueries from './admin-postgrest';
import { hasAdminPostgrestConfig } from './admin-postgrest';

export type {
  AdminTournament,
  AdminTournamentParticipantInput,
  ArchiveResult,
  ArchiveTournament,
  AdminPlayer,
  RosterParticipant,
  PlayerRequest,
  TempPlayer,
} from './admin-queries-pg';

function useRemote() {
  return hasAdminPostgrestConfig();
}

export async function listTournaments(query = '') {
  return useRemote() ? remoteQueries.listTournaments(query) : pgQueries.listTournaments(query);
}

export async function createTournament(input: Parameters<typeof pgQueries.createTournament>[0]) {
  return useRemote() ? remoteQueries.createTournament(input) : pgQueries.createTournament(input);
}

export async function updateTournament(
  id: string,
  input: Parameters<typeof pgQueries.updateTournament>[1]
) {
  return useRemote() ? remoteQueries.updateTournament(id, input) : pgQueries.updateTournament(id, input);
}

export async function deleteTournament(id: string) {
  return useRemote() ? remoteQueries.deleteTournament(id) : pgQueries.deleteTournament(id);
}

export async function getTournamentById(id: string) {
  return useRemote() ? remoteQueries.getTournamentById(id) : pgQueries.getTournamentById(id);
}

export async function getTournamentLegacyGameStateById(id: string) {
  return useRemote()
    ? remoteQueries.getTournamentLegacyGameStateById(id)
    : pgQueries.getTournamentLegacyGameStateById(id);
}

export async function listPlayers(query = '') {
  return useRemote() ? remoteQueries.listPlayers(query) : pgQueries.listPlayers(query);
}

export async function getPlayerById(id: string) {
  return useRemote() ? remoteQueries.getPlayerById(id) : pgQueries.getPlayerById(id);
}

export async function getPlayersByIds(ids: string[]) {
  return useRemote() ? remoteQueries.getPlayersByIds(ids) : pgQueries.getPlayersByIds(ids);
}

export async function createPlayer(input: Parameters<typeof pgQueries.createPlayer>[0]) {
  return useRemote() ? remoteQueries.createPlayer(input) : pgQueries.createPlayer(input);
}

export async function updatePlayer(id: string, input: Parameters<typeof pgQueries.updatePlayer>[1]) {
  return useRemote() ? remoteQueries.updatePlayer(id, input) : pgQueries.updatePlayer(id, input);
}

export async function deletePlayer(id: string) {
  return useRemote() ? remoteQueries.deletePlayer(id) : pgQueries.deletePlayer(id);
}

export async function applyTournamentStatusOverride(
  input: Parameters<typeof pgQueries.applyTournamentStatusOverride>[0]
) {
  return useRemote()
    ? remoteQueries.applyTournamentStatusOverride(input)
    : pgQueries.applyTournamentStatusOverride(input);
}

export async function applyPlayerRecalcOverride(
  input: Parameters<typeof pgQueries.applyPlayerRecalcOverride>[0]
) {
  return useRemote()
    ? remoteQueries.applyPlayerRecalcOverride(input)
    : pgQueries.applyPlayerRecalcOverride(input);
}

export async function applyPlayerRatingOverride(
  input: Parameters<typeof pgQueries.applyPlayerRatingOverride>[0]
) {
  return useRemote()
    ? remoteQueries.applyPlayerRatingOverride(input)
    : pgQueries.applyPlayerRatingOverride(input);
}

export async function listRosterParticipants(tournamentId: string) {
  return useRemote()
    ? remoteQueries.listRosterParticipants(tournamentId)
    : pgQueries.listRosterParticipants(tournamentId);
}

export async function addParticipant(tournamentId: string, playerId: string) {
  return useRemote()
    ? remoteQueries.addParticipant(tournamentId, playerId)
    : pgQueries.addParticipant(tournamentId, playerId);
}

export async function removeParticipant(tournamentId: string, playerId: string) {
  return useRemote()
    ? remoteQueries.removeParticipant(tournamentId, playerId)
    : pgQueries.removeParticipant(tournamentId, playerId);
}

export async function promoteFromWaitlist(tournamentId: string, playerId: string) {
  return useRemote()
    ? remoteQueries.promoteFromWaitlist(tournamentId, playerId)
    : pgQueries.promoteFromWaitlist(tournamentId, playerId);
}

export async function listPendingRequests(tournamentId?: string) {
  return useRemote()
    ? remoteQueries.listPendingRequests(tournamentId)
    : pgQueries.listPendingRequests(tournamentId);
}

export async function approveRequest(requestId: string) {
  if (process.env.DATABASE_URL) {
    return pgQueries.approveRequest(requestId);
  }
  return useRemote() ? remoteQueries.approveRequest(requestId) : pgQueries.approveRequest(requestId);
}

export async function rejectRequest(requestId: string) {
  return useRemote() ? remoteQueries.rejectRequest(requestId) : pgQueries.rejectRequest(requestId);
}

export async function listTempPlayers() {
  return useRemote() ? remoteQueries.listTempPlayers() : pgQueries.listTempPlayers();
}

export async function mergeTempPlayer(tempId: string, realId: string) {
  return useRemote()
    ? remoteQueries.mergeTempPlayer(tempId, realId)
    : pgQueries.mergeTempPlayer(tempId, realId);
}

export async function getArchiveTournaments() {
  return useRemote() ? remoteQueries.getArchiveTournaments() : pgQueries.getArchiveTournaments();
}

export async function setTournamentPhotoUrl(id: string, photoUrl: string) {
  return useRemote()
    ? remoteQueries.setTournamentPhotoUrl(id, photoUrl)
    : pgQueries.setTournamentPhotoUrl(id, photoUrl);
}

export async function upsertTournamentResults(
  tournamentId: string,
  results: Parameters<typeof pgQueries.upsertTournamentResults>[1]
) {
  return useRemote()
    ? remoteQueries.upsertTournamentResults(tournamentId, results)
    : pgQueries.upsertTournamentResults(tournamentId, results);
}
