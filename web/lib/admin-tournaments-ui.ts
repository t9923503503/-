import { buildSudyamLaunchUrl, getSudyamFormatForTournament } from './sudyam-launch';
import {
  INDIVIDUAL_MIX_SERIES_LABEL,
  isSixPairIndividualMixVariant,
} from './individual-mix/admin';

export type TournamentListTab = 'all' | 'upcoming' | 'active' | 'draft' | 'finished' | 'cancelled';
export type GoPreset = 'olympic' | 'all_places';

export type TournamentListFilters = {
  query: string;
  format: string;
  division: string;
  dateFrom: string;
  dateTo: string;
};

export type TournamentListItem = {
  id: string;
  name: string;
  date: string;
  location?: string;
  format: string;
  division: string;
  capacity: number;
  status: string;
  participantCount: number;
  settings?: Record<string, unknown>;
  goEngineVersion?: 1 | 2;
};

export function formatTournamentDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '—';
}

export function getLocalIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTournamentListTab(
  row: Pick<TournamentListItem, 'date' | 'status'>,
  today = getLocalIsoDate(),
): TournamentListTab {
  const status = String(row.status || '').toLowerCase();
  if (status === 'draft') return 'draft';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'finished' || row.date < today) return 'finished';
  if ((status === 'open' || status === 'full') && row.date === today) return 'active';
  if ((status === 'open' || status === 'full') && row.date > today) return 'upcoming';
  return 'all';
}

export function getGoPreset(settings?: Record<string, unknown>): GoPreset {
  const leagues = Array.isArray(settings?.goEnabledPlayoffLeagues)
    ? settings.goEnabledPlayoffLeagues.map(String)
    : [];
  return leagues.length === 1 && leagues[0] === 'hard' ? 'olympic' : 'all_places';
}

export function getTournamentFormatLabel(
  row: Pick<TournamentListItem, 'format' | 'settings' | 'goEngineVersion'>,
): string {
  const format = String(row.format).toLowerCase();
  if (format === 'groups + olympic') {
    if (row.goEngineVersion === 2) {
      return 'Группы + сетки · Engine V2';
    }
    return getGoPreset(row.settings) === 'olympic'
      ? 'Группы + олимпийская система'
      : 'Группы + все места';
  }
  if (format === 'round robin') return 'Круговой';
  if (format === 'individual mix') {
    return isSixPairIndividualMixVariant(row.settings?.individualMixVariant)
      ? `${INDIVIDUAL_MIX_SERIES_LABEL} · 6 пар`
      : 'Личный микст';
  }
  if (format === 'thai') return 'Тайский';
  if (format === 'king of the court' || format === 'kotc') return 'KOTC';
  return row.format;
}

export function getTournamentStatusLabel(status: string): string {
  return ({
    draft: 'Черновик',
    open: 'Открыт',
    full: 'Мест нет',
    finished: 'Завершён',
    cancelled: 'Отменён',
  } as Record<string, string>)[String(status).toLowerCase()] ?? status;
}

export function filterTournamentRows<T extends TournamentListItem>(
  rows: T[],
  tab: TournamentListTab,
  filters: TournamentListFilters,
  today = getLocalIsoDate(),
): T[] {
  const query = filters.query.trim().toLocaleLowerCase('ru');
  return rows.filter((row) => {
    const rowTab = getTournamentListTab(row, today);
    if (tab !== 'all' && rowTab !== tab) return false;
    if (query && !`${row.name} ${row.location ?? ''}`.toLocaleLowerCase('ru').includes(query)) return false;
    if (filters.format && getTournamentFormatLabel(row) !== filters.format) return false;
    if (filters.division && row.division !== filters.division) return false;
    if (filters.dateFrom && row.date < filters.dateFrom) return false;
    if (filters.dateTo && row.date > filters.dateTo) return false;
    return true;
  });
}

export function calculateTournamentCapacity(input: {
  format: string;
  settings?: Record<string, unknown>;
  goEngineVersion?: 1 | 2;
}): number {
  const settings = input.settings ?? {};
  const courts = Math.max(1, Math.floor(Number(settings.courts ?? settings.goCourts ?? 1)));
  if (String(input.format).toLowerCase() === 'individual mix') {
    if (isSixPairIndividualMixVariant(settings.individualMixVariant)) return 12;
    const poolSize = Math.max(4, Math.min(6, Math.floor(Number(settings.individualMixPoolSize ?? 5))));
    return Math.min(4, courts) * poolSize * 2;
  }
  if (String(input.format).toLowerCase() === 'round robin') {
    const teams = Math.max(6, Math.min(32, Math.floor(Number(settings.rrTeamCount ?? 6))));
    return teams * 2;
  }
  if (String(input.format).toLowerCase() === 'groups + olympic') {
    if (input.goEngineVersion === 2) {
      const teams = Math.max(3, Math.min(48, Math.floor(Number(settings.goDeclaredTeamCount ?? 12))));
      return teams * 2;
    }
    const groups = Math.max(1, Math.floor(Number(settings.goGroupCount ?? 1)));
    const teams = Math.max(1, Math.floor(Number(settings.goTeamsPerGroup ?? 4)));
    return groups * teams * 2;
  }
  if (/kotc|king of the court/i.test(String(input.format))) {
    const pairs = Math.max(2, Math.floor(Number(settings.kotcPpc ?? 3)));
    return courts * pairs * 2;
  }
  const storedPlayersPerCourt = Number(settings.playersPerCourt ?? 0);
  const pairs = Math.max(
    1,
    Math.floor(Number(settings.pairsPerCourt ?? (storedPlayersPerCourt > 0 ? storedPlayersPerCourt / 2 : 2))),
  );
  return courts * pairs * 2;
}

export function getTournamentLaunchHref(row: TournamentListItem): string {
  const format = String(row.format).toLowerCase();
  if (format === 'thai') {
    return `/admin/tournaments/${encodeURIComponent(row.id)}/thai-live`;
  }
  if (format.includes('kotc') || format.includes('king of the court')) {
    return `/admin/tournaments/${encodeURIComponent(row.id)}/kotcn-live`;
  }
  if (format === 'groups + olympic') {
    if (row.goEngineVersion === 2) {
      return `/admin/tournaments/${encodeURIComponent(row.id)}/engine-v2`;
    }
    return `/admin/tournaments/${encodeURIComponent(row.id)}/go-live`;
  }
  if (format === 'individual mix') {
    return `/admin/tournaments/${encodeURIComponent(row.id)}/individual-mix`;
  }
  return getTournamentJudgeHref(row);
}

export function getTournamentJudgeHref(row: TournamentListItem): string {
  const format = getSudyamFormatForTournament(row.format);
  return format ? buildSudyamLaunchUrl({ tournamentId: row.id, format }) : '';
}

export function stripTournamentForDuplicate<T extends TournamentListItem>(row: T) {
  const settings = { ...(row.settings ?? {}) };
  for (const key of Object.keys(settings)) {
    if (/signature|draftowner|bootstrap/i.test(key)) delete settings[key];
  }
  return {
    ...row,
    id: '',
    name: `${row.name} (копия)`,
    status: 'draft',
    participantCount: 0,
    settings,
  };
}
