'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { adminCommandRequestHash } from '@/lib/go-v2/client-admin-command';
import { localDateTimeValue, zonedDateTimeToIso } from '@/lib/go-v2/client-timezone';

type WorkspaceTab = 'format' | 'draw' | 'bracket' | 'schedule' | 'live' | 'incidents' | 'audit';
type PoolMode = 'round_robin_pool' | 'modified_pool_4';
type MatchRuleCode = 'single_21' | 'best_of_3_15' | 'best_of_3_21_15';
type PlayoffFormat = 'single_elimination' | 'double_elimination' | 'classification';
type FormatMode = 'groups_playoff' | 'standalone_bracket';
type TierMode = 'auto' | 'two' | 'three' | 'manual';
type ExactTierQuotas = { hard: number; medium: number; light: number };
type RefereeMode = 'court_judge' | 'working_team' | 'hybrid' | 'none';
type CourtAvailabilityDraft = {
  start: string;
  end: string;
};
type CourtDraft = {
  courtNo: number;
  label: string;
  availability: CourtAvailabilityDraft[];
};
type LiveEtaOverride = { matchId: string; liveEta: string };
type PauseResolutionDecision = 'defer' | 'resume_same_court' | 'transfer';

type EngineConfig = {
  teamCount: number;
  formatMode: FormatMode;
  templateId: string;
  poolMode: PoolMode;
  groupMatchRule: MatchRuleCode;
  playoffMatchRule: MatchRuleCode;
  playoffFormat: PlayoffFormat;
  tierMode: TierMode;
  tierQuotas: ExactTierQuotas;
  bronzeEnabled: boolean;
  resetFinalEnabled: boolean;
  courtCount: number;
  startTime: string;
  endTime: string;
  timezone: string;
  refereeMode: RefereeMode;
};

type ApiRecord = Record<string, unknown>;

type EngineStructure = ApiRecord & {
  aggregateVersion?: number;
  version?: number;
  lifecycleStatus?: string;
  tournament?: ApiRecord;
  entries?: unknown[];
  stages?: unknown[];
  stageEdges?: unknown[];
  pools?: unknown[];
  matches?: unknown[];
  scheduleSessions?: unknown[];
  scheduleVersions?: unknown[];
  courts?: unknown[];
  attendancePolicy?: ApiRecord;
  attendanceReinstatements?: unknown[];
  activeDisruptions?: unknown[];
  pauseResolutions?: unknown[];
  disruptionResolutions?: unknown[];
  deferOverrides?: unknown[];
  reservePromotions?: unknown[];
  courtSegments?: unknown[];
  activeCourtGrants?: unknown[];
  currentSchedule?: ApiRecord;
  mutations?: unknown[];
};

type PreviewEnvelope = ApiRecord & {
  previewId?: string;
  inputHash?: string;
  aggregateVersion?: number;
  risk?: string;
  groups?: unknown[];
  bracket?: unknown;
  assignments?: unknown[];
  conflicts?: unknown[];
  code?: string;
  details?: unknown;
};

const TIER_LABELS: Record<string, string> = {
  hard: 'Hard',
  medium: 'Medium',
  light: 'Light',
};

const PHASE_LABELS: Record<string, string> = {
  upper: 'Верхняя сетка',
  lower: 'Нижняя сетка',
  grand_final: 'Финал',
  bronze: 'Бронза',
  placement: 'Классификационные раунды',
};

const CONFLICT_LABELS: Record<string, string> = {
  COURT_OVERLAP: 'Два матча попали на один корт в одно время.',
  TEAM_OVERLAP: 'Команда назначена на два матча одновременно.',
  TEAM_REST: 'Между матчами команды не хватает обязательного отдыха.',
  REFEREE_REST: 'После судейства команда не успевает отдохнуть до своей игры.',
  NO_FEASIBLE_PLACEMENT: 'Не нашлось свободного корта и времени с учётом всех ограничений.',
  NO_COURT_WINDOW_FITS_DURATION: 'Ни одно окно корта не вмещает матч целиком.',
  COURT_MINUTES_LOWER_BOUND_EXCEEDED: 'Даже без учёта отдыха и переходов не хватает суммарных минут доступности кортов.',
  CRITICAL_PATH_LOWER_BOUND_EXCEEDED: 'Зависимая цепочка матчей не успевает завершиться в окне турнира.',
  DEPENDENCY_ORDER: 'Матч поставлен раньше матча, от которого зависят его участники.',
  COURT_FULLY_CLOSED: 'Корт закрыт на всё окно сессии и исключён из расчёта.',
  NO_ACTIVE_COURTS: 'В сессии не осталось ни одного доступного корта.',
  TIER_COURT_CAPACITY_DEFICIT: 'Закреплённых за этим тиром кортов не хватает для завершения матчей в окне дня.',
  TIER_COURT_FALLBACK_USED: 'Использовано подтверждённое директором временное исключение по кортам.',
  TIER_COURT_POLICY_VIOLATION: 'Назначение нарушает строгое закрепление тира или выходит за период разрешённого исключения.',
  LOCKED_COURT_CLOSED: 'Опубликованный или заблокированный матч назначен на закрытый корт; требуется решение директора.',
  REFEREE_OVERLAP: 'Судейская команда одновременно занята другой игрой или судейством.',
  PLAYER_OVERLAP: 'Один игрок назначен на пересекающиеся матчи общей сессии.',
  TIMEOUT_OPERATION_BUDGET: 'Солвер исчерпал лимит вариантов; preview нельзя публиковать.',
  TIMEOUT_WALL_CLOCK: 'Солвер достиг лимита времени; preview нельзя публиковать.',
};

const MATCH_RULES: Array<{ code: MatchRuleCode; label: string; hint: string; minutes: number }> = [
  { code: 'single_21', label: '1 партия до 21', hint: 'Быстрый групповой формат', minutes: 20 },
  { code: 'best_of_3_15', label: 'До 2 побед, партии до 15', hint: 'Третья партия только при 1:1', minutes: 40 },
  { code: 'best_of_3_21_15', label: '21 / 21 / 15', hint: 'Классический полный матч', minutes: 50 },
];

const FORMAT_PRESETS = [
  { id: 'lpv_groups_hl_se_v1', label: 'Группы → Hard/Light → SE', mode: 'groups_playoff', pool: 'round_robin_pool', tiers: 'two', playoff: 'single_elimination' },
  { id: 'lpv_groups_hml_se_v1', label: 'Группы → Hard/Medium/Light → SE', mode: 'groups_playoff', pool: 'round_robin_pool', tiers: 'three', playoff: 'single_elimination' },
  { id: 'lpv_groups_tiers_de_v1', label: 'Группы → тиры → True DE', mode: 'groups_playoff', pool: 'round_robin_pool', tiers: 'auto', playoff: 'double_elimination' },
  { id: 'lpv_modified4_se_v1', label: 'Modified Pool 4 → SE', mode: 'groups_playoff', pool: 'modified_pool_4', tiers: 'auto', playoff: 'single_elimination' },
  { id: 'lpv_modified4_de_v1', label: 'Modified Pool 4 → True DE', mode: 'groups_playoff', pool: 'modified_pool_4', tiers: 'auto', playoff: 'double_elimination' },
  { id: 'lpv_standalone_se_v1', label: 'Standalone SE', mode: 'standalone_bracket', pool: 'round_robin_pool', tiers: 'auto', playoff: 'single_elimination' },
  { id: 'lpv_standalone_de_v1', label: 'Standalone True DE', mode: 'standalone_bracket', pool: 'round_robin_pool', tiers: 'auto', playoff: 'double_elimination' },
  { id: 'lpv_classification_v1', label: 'Классификационные раунды · ≥3 игр', mode: 'standalone_bracket', pool: 'round_robin_pool', tiers: 'auto', playoff: 'classification' },
] as const;

const TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'format', label: 'Формат' },
  { id: 'draw', label: 'Группы' },
  { id: 'bracket', label: 'Сетки' },
  { id: 'schedule', label: 'Расписание' },
  { id: 'live', label: 'Live-день' },
  { id: 'incidents', label: 'Инциденты' },
  { id: 'audit', label: 'Аудит' },
];

const DEFAULT_CONFIG: EngineConfig = {
  teamCount: 22,
  formatMode: 'groups_playoff',
  templateId: 'lpv_groups_hl_se_v1',
  poolMode: 'round_robin_pool',
  groupMatchRule: 'single_21',
  playoffMatchRule: 'best_of_3_21_15',
  playoffFormat: 'single_elimination',
  tierMode: 'auto',
  tierQuotas: { hard: 12, medium: 0, light: 10 },
  bronzeEnabled: true,
  resetFinalEnabled: true,
  courtCount: 4,
  startTime: '09:00',
  endTime: '21:00',
  timezone: 'Asia/Yekaterinburg',
  refereeMode: 'hybrid',
};

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function asRecord(value: unknown): ApiRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as ApiRecord) : {};
}

function persistedMatchRule(value: unknown, fallback: MatchRuleCode): MatchRuleCode {
  const preset = String(asRecord(value).preset ?? value ?? '');
  return MATCH_RULES.some((rule) => rule.code === preset) ? preset as MatchRuleCode : fallback;
}

function getGroupSizes(teamCount: number): number[] | null {
  if (!Number.isInteger(teamCount) || teamCount < 3 || teamCount > 48 || teamCount === 5) return null;
  let best: { threes: number; fours: number } | null = null;
  for (let threes = 0; threes <= Math.floor(teamCount / 3); threes += 1) {
    const remainder = teamCount - threes * 3;
    if (remainder < 0 || remainder % 4 !== 0) continue;
    const candidate = { threes, fours: remainder / 4 };
    if (!best || candidate.threes < best.threes) best = candidate;
  }
  if (!best) return null;
  return [...Array.from({ length: best.fours }, () => 4), ...Array.from({ length: best.threes }, () => 3)];
}

function calculateTierSizes(
  teamCount: number,
  groupCount: number,
  tierMode: TierMode,
  tierQuotas: ExactTierQuotas,
) {
  if (tierMode === 'manual') {
    return { ...tierQuotas, mode: tierQuotas.medium > 0 ? 'three' : 'two' };
  }
  const resolvedMode = tierMode === 'auto' ? (teamCount >= 31 ? 'three' : 'two') : tierMode;
  const hard = groupCount <= 8 ? Math.min(16, groupCount * 2) : 16;
  const remainder = Math.max(0, teamCount - hard);
  if (resolvedMode === 'two') return { hard, medium: 0, light: remainder, mode: resolvedMode };
  return {
    hard,
    medium: Math.ceil(remainder / 2),
    light: Math.floor(remainder / 2),
    mode: resolvedMode,
  };
}

function estimateMatches(config: EngineConfig, groupSizes: number[]) {
  const groupMatches = config.poolMode === 'modified_pool_4'
    ? groupSizes.length * 4
    : groupSizes.reduce((sum, size) => sum + (size * (size - 1)) / 2, 0);
  const tiers = calculateTierSizes(config.teamCount, groupSizes.length, config.tierMode, config.tierQuotas);
  const tierCounts = [tiers.hard, tiers.medium, tiers.light].filter((count) => count >= 2);
  const playoffMatches = tierCounts.reduce((sum, count) => {
    if (config.playoffFormat === 'double_elimination') return sum + (config.resetFinalEnabled ? 2 * count - 1 : 2 * count - 2);
    return sum + count - 1 + (config.bronzeEnabled && count >= 4 ? 1 : 0);
  }, 0);
  const groupMinutes = MATCH_RULES.find((rule) => rule.code === config.groupMatchRule)?.minutes ?? 20;
  const playoffMinutes = MATCH_RULES.find((rule) => rule.code === config.playoffMatchRule)?.minutes ?? 50;
  const courtMinutes = groupMatches * groupMinutes + playoffMatches * playoffMinutes;
  return { groupMatches, playoffMatches, totalMatches: groupMatches + playoffMatches, courtMinutes, tiers };
}

function classificationRealMatchCount(teamCount: number): number | null {
  if (!Number.isSafeInteger(teamCount) || teamCount < 3 || teamCount > 48) return null;
  if (teamCount === 3) return 6;
  return teamCount % 2 === 0 ? (teamCount * 3) / 2 : 2 * (teamCount - 1);
}

function manualTierQuotaIssue(
  teamCount: number,
  groupCount: number,
  tierMode: TierMode,
  quotas: ExactTierQuotas,
): string | null {
  if (tierMode !== 'manual') return null;
  const values = [quotas.hard, quotas.medium, quotas.light];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    return 'Квоты должны быть целыми неотрицательными числами.';
  }
  if (values.reduce((sum, value) => sum + value, 0) !== teamCount) {
    return `Сумма квот должна быть равна числу команд: ${teamCount}.`;
  }
  const requiredHard = groupCount <= 8 ? groupCount * 2 : groupCount;
  if (quotas.hard > 16) return 'В Hard допускается не более 16 команд.';
  if (groupCount <= 8 && quotas.hard !== requiredHard) {
    return `При ${groupCount} группах в Hard должны пройти все первые и вторые места: ${requiredHard} команд.`;
  }
  if (groupCount > 8 && quotas.hard < requiredHard) {
    return `В Hard должны пройти как минимум все ${requiredHard} победителей групп.`;
  }
  if (values.includes(1)) {
    return 'Тир из одной команды нельзя превратить в сетку: измените квоты или используйте placement-правило.';
  }
  return null;
}

function createCourtDrafts(count: number, startTime: string, endTime: string): CourtDraft[] {
  return Array.from({ length: count }, (_, index) => ({
    courtNo: index + 1,
    label: `Корт ${index + 1}`,
    availability: [{ start: startTime, end: endTime }],
  }));
}

function courtRoleLabel(courtNo: number, courtCount: number, hasMediumTier: boolean): string {
  if (courtCount === 1) return 'Общий корт';
  if (courtNo === 2) return 'Light · строго';
  if (courtNo === 3 || courtNo === 4) return 'Hard · строго';
  if (courtNo === 1 && hasMediumTier) return 'Medium · строго';
  if (courtNo === 1) return 'Hard';
  return 'Overflow · только с подтверждением';
}

function previewResult(preview: PreviewEnvelope | null): ApiRecord {
  return asRecord(preview?.result);
}

function previewCandidate(preview: PreviewEnvelope | null): ApiRecord {
  return asRecord(previewResult(preview).candidate);
}

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function operationList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function compactOperationValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(compactOperationValue).join(', ') || '—';
  return formatJson(value);
}

function OperationImpactSummary({
  value,
  title,
}: {
  value: PreviewEnvelope | null;
  title: string;
}) {
  if (!value) return null;
  const result = asRecord(value.result);
  const candidate = asRecord(result.candidate);
  const impact = asRecord(result.impact);
  const validation = asRecord(candidate.independentValidation);
  const solver = asRecord(candidate.solverResult);
  const scheduleDiff = asRecord(candidate.scheduleDiff ?? result.scheduleDiff);
  const conflicts = operationList(result.conflicts ?? solver.conflicts ?? validation.conflicts).map(asRecord);
  const warnings = operationList(result.warnings ?? solver.warnings).map((item) => (
    typeof item === 'string' ? item : String(asRecord(item).message ?? asRecord(item).code ?? 'Предупреждение')
  ));
  const affectedMatchIds = operationList(
    impact.affectedMatchIds
      ?? candidate.affectedMatchIds
      ?? impact.pausedMatchIds
      ?? candidate.pausedMatchIds,
  ).map(String);
  const nextActions = operationList(impact.nextActions ?? candidate.nextActions ?? result.nextActions).map(String);
  const scheduleHash = String(
    validation.scheduleHash
      ?? impact.successorScheduleHash
      ?? candidate.scheduleHash
      ?? result.scheduleHash
      ?? '',
  );
  const risk = String(value.risk ?? result.risk ?? 'зелёный');
  const diffEntries = Object.entries(scheduleDiff).filter(([, item]) => item != null && item !== '');

  return (
    <div className={cx(
      'mt-3 space-y-3 rounded-xl border p-3',
      risk === 'red'
        ? 'border-red-400/35 bg-red-500/10'
        : risk === 'amber'
          ? 'border-amber-300/30 bg-amber-400/[0.07]'
          : 'border-emerald-300/25 bg-emerald-500/[0.06]',
    )}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-white">{title}</p>
        <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
          risk: {risk}
        </span>
      </div>
      {scheduleHash ? (
        <div className="rounded-lg border border-emerald-300/20 bg-black/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/65">Итоговый scheduleHash</p>
          <code className="mt-1 block break-all text-xs text-emerald-100">{scheduleHash}</code>
        </div>
      ) : null}
      {diffEntries.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Изменения</p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {diffEntries.map(([key, item]) => (
              <div key={key} className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-2.5">
                <dt className="break-words text-[11px] font-semibold uppercase tracking-wide text-white/40">{key}</dt>
                <dd className="mt-1 break-words text-sm text-white/75">{compactOperationValue(item)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      {affectedMatchIds.length ? (
        <p className="text-sm text-white/65">Затронуты матчи: <span className="font-semibold text-white">{affectedMatchIds.length}</span></p>
      ) : null}
      {conflicts.length ? (
        <div className="rounded-lg border border-red-300/25 bg-red-500/10 p-3">
          <p className="text-sm font-bold text-red-50">Конфликты: {conflicts.length}</p>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-red-100/80">
            {conflicts.slice(0, 8).map((conflict, index) => (
              <li key={`${String(conflict.code ?? 'conflict')}-${index}`}>• {String(conflict.message ?? CONFLICT_LABELS[String(conflict.code ?? '')] ?? conflict.code ?? 'Конфликт')}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs font-semibold text-emerald-100/75">Валидатор не вернул конфликтов.</p>
      )}
      {warnings.length ? <ul className="space-y-1 text-xs leading-5 text-amber-100/75">{warnings.map((warning, index) => <li key={`${warning}-${index}`}>• {warning}</li>)}</ul> : null}
      {nextActions.length ? <p className="text-xs text-white/55">Следующие шаги: {nextActions.join(' → ')}</p> : null}
      <details className="rounded-lg border border-white/10 bg-black/20 p-2.5">
        <summary className="cursor-pointer text-xs font-semibold text-white/45">Отладка: raw JSON</summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-white/60">{formatJson(value)}</pre>
      </details>
    </div>
  );
}

function lifecycleLabel(value: string | undefined): string {
  if (!value) return 'Черновик V2';
  const labels: Record<string, string> = {
    draft: 'Черновик',
    registration_locked: 'Регистрация закрыта',
    draw_preview: 'Жеребьёвка: preview',
    draw_locked: 'Жеребьёвка зафиксирована',
    stages_ready: 'Стадии созданы',
    bracket_preview: 'Сетки: preview',
    bracket_locked: 'Сетки зафиксированы',
    schedule_draft: 'Расписание: черновик',
    schedule_published: 'Расписание опубликовано',
    live: 'LIVE',
    finished: 'Завершён',
    complete: 'Завершён',
  };
  return labels[value] ?? value;
}

function getV2DeviceId(): string {
  if (typeof window === 'undefined') return 'admin-server-render';
  const key = 'lpvolley:go-v2:admin-device-id';
  const current = window.localStorage.getItem(key);
  if (current) return current;
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const created = `admin-web-${suffix}`;
  window.localStorage.setItem(key, created);
  return created;
}

function withdrawalReasonCode(cause: string): string {
  if (cause === 'injury_before_match' || cause === 'medical_withdrawal') return 'injury_retirement';
  if (cause === 'game_disqualification_future' || cause === 'anti_doping_disqualification') return 'disqualification';
  if (cause === 'administrative_withdrawal') return 'admin_override';
  return 'no_show';
}

function attendanceReasonCode(state: string, fromState?: string): string {
  if (fromState === 'no_show' && (state === 'checked_in' || state === 'late_hold')) return 'attendance_reinstated';
  if (state === 'confirmed') return 'attendance_confirmed';
  if (state === 'checked_in') return 'attendance_checked_in';
  if (state === 'late_hold') return 'attendance_late_hold';
  return 'attendance_no_show';
}

function pauseResolutionReasonCode(decision: PauseResolutionDecision): string {
  if (decision === 'transfer') return 'live_match_transfer';
  if (decision === 'defer') return 'match_pause_deferred';
  return 'match_pause_resume_authorized';
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wide text-white/55">{children}</span>;
}

function SelectCard({
  active,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'min-h-20 rounded-xl border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-orange-400/70',
        active ? 'border-orange-400/70 bg-orange-500/15' : 'border-white/10 bg-white/[0.035] hover:border-white/25',
      )}
    >
      <span className="block text-sm font-bold text-white">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-white/60">{hint}</span>
    </button>
  );
}

export function TournamentEngineV2Workspace({ tournamentId }: { tournamentId: string }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('format');
  const [config, setConfig] = useState<EngineConfig>(DEFAULT_CONFIG);
  const [structure, setStructure] = useState<EngineStructure | null>(null);
  const [drawPreview, setDrawPreview] = useState<PreviewEnvelope | null>(null);
  const [drawUnlockPreview, setDrawUnlockPreview] = useState<PreviewEnvelope | null>(null);
  const [drawUnlockReseed, setDrawUnlockReseed] = useState(false);
  const [bracketPreview, setBracketPreview] = useState<PreviewEnvelope | null>(null);
  const [schedulePreview, setSchedulePreview] = useState<PreviewEnvelope | null>(null);
  const [linkedTournamentIdsInput, setLinkedTournamentIdsInput] = useState('');
  const [incidentPreview, setIncidentPreview] = useState<PreviewEnvelope | null>(null);
  const [replacementPreview, setReplacementPreview] = useState<PreviewEnvelope | null>(null);
  const [withdrawalPreview, setWithdrawalPreview] = useState<PreviewEnvelope | null>(null);
  const [pendingAction, setPendingAction] = useState('');
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState<ApiRecord | null>(null);
  const [notice, setNotice] = useState('');
  const [matchId, setMatchId] = useState('');
  const [incidentEntryId, setIncidentEntryId] = useState('');
  const [incidentKind, setIncidentKind] = useState('walkover');
  const [incidentReason, setIncidentReason] = useState('admin_override');
  const [technicalStandingProfile, setTechnicalStandingProfile] = useState('LPV_DECLARED_SCORE');
  const [replacementEntryId, setReplacementEntryId] = useState('');
  const [replaceMemberOrder, setReplaceMemberOrder] = useState(1);
  const [replacementPlayerId, setReplacementPlayerId] = useState('');
  const [replacementPlayerName, setReplacementPlayerName] = useState('');
  const [replacementRating, setReplacementRating] = useState('0');
  const [replacementPolicy, setReplacementPolicy] = useState('LPV_LOCAL_ONE_PLAYER');
  const [replacementNote, setReplacementNote] = useState('');
  const [withdrawalEntryId, setWithdrawalEntryId] = useState('');
  const [withdrawalPolicy, setWithdrawalPolicy] = useState('LPV_PRESERVE_PLAYED_FORFEIT_FUTURE');
  const [withdrawalCause, setWithdrawalCause] = useState('no_show');
  const [withdrawalNote, setWithdrawalNote] = useState('');
  const [confirmRedWithdrawal, setConfirmRedWithdrawal] = useState(false);
  const [incidentNote, setIncidentNote] = useState('');
  const [incidentResolution, setIncidentResolution] = useState('cascade_void_and_replay');
  const [confirmRedIncident, setConfirmRedIncident] = useState(false);
  const [setScores, setSetScores] = useState<Array<{ a: string; b: string }>>([
    { a: '', b: '' },
    { a: '', b: '' },
    { a: '', b: '' },
  ]);
  const [mutationBatchId, setMutationBatchId] = useState('');
  const [undoPreview, setUndoPreview] = useState<PreviewEnvelope | null>(null);
  const [swapEntryA, setSwapEntryA] = useState('');
  const [swapEntryB, setSwapEntryB] = useState('');
  const [manualSwaps, setManualSwaps] = useState<Array<{ entryA: string; entryB: string }>>([]);
  const [draggedEntryId, setDraggedEntryId] = useState('');
  const [courts, setCourts] = useState<CourtDraft[]>(() => (
    createCourtDrafts(DEFAULT_CONFIG.courtCount, DEFAULT_CONFIG.startTime, DEFAULT_CONFIG.endTime)
  ));
  const [liveEtaMatchId, setLiveEtaMatchId] = useState('');
  const [liveEtaValue, setLiveEtaValue] = useState('');
  const [liveEtaOverrides, setLiveEtaOverrides] = useState<LiveEtaOverride[]>([]);
  const [attendanceEntryId, setAttendanceEntryId] = useState('');
  const [attendanceState, setAttendanceState] = useState('checked_in');
  const [attendanceEffectiveAt, setAttendanceEffectiveAt] = useState(() => localDateTimeValue());
  const [attendanceNote, setAttendanceNote] = useState('');
  const [attendancePreview, setAttendancePreview] = useState<PreviewEnvelope | null>(null);
  const [reinstatementEntryId, setReinstatementEntryId] = useState('');
  const [reinstatementDecision, setReinstatementDecision] = useState<'keep_awarded_result' | 'overturn_and_cascade'>('keep_awarded_result');
  const [reinstatementTargetState, setReinstatementTargetState] = useState<'checked_in' | 'late_hold'>('checked_in');
  const [reinstatementNote, setReinstatementNote] = useState('Команда прибыла после зафиксированной неявки; решение принято директором');
  const [reinstatementPreview, setReinstatementPreview] = useState<PreviewEnvelope | null>(null);
  const [reserveEntryId, setReserveEntryId] = useState('');
  const [reserveTargetEntryId, setReserveTargetEntryId] = useState('');
  const [reservePromotionNote, setReservePromotionNote] = useState('Освободившийся слот передан резервной команде по решению директора');
  const [reservePromotionPreview, setReservePromotionPreview] = useState<PreviewEnvelope | null>(null);
  const [disruptionKind, setDisruptionKind] = useState('court_close');
  const [disruptionCourtId, setDisruptionCourtId] = useState('');
  const [disruptionMatchId, setDisruptionMatchId] = useState('');
  const [disruptionStartsAt, setDisruptionStartsAt] = useState(() => localDateTimeValue());
  const [disruptionExpectedEndAt, setDisruptionExpectedEndAt] = useState('');
  const [disruptionNote, setDisruptionNote] = useState('');
  const [disruptionPreview, setDisruptionPreview] = useState<PreviewEnvelope | null>(null);
  const [disruptionResolutionId, setDisruptionResolutionId] = useState('');
  const [disruptionResolution, setDisruptionResolution] = useState<'resolved' | 'cancelled'>('resolved');
  const [disruptionResolutionNote, setDisruptionResolutionNote] = useState('');
  const [disruptionResolutionPreview, setDisruptionResolutionPreview] = useState<PreviewEnvelope | null>(null);
  const [disruptionResolutionReceipt, setDisruptionResolutionReceipt] = useState<PreviewEnvelope | null>(null);
  const [pauseMatchId, setPauseMatchId] = useState('');
  const [pauseDecision, setPauseDecision] = useState<PauseResolutionDecision>('resume_same_court');
  const [pauseDisruptionId, setPauseDisruptionId] = useState('');
  const [pauseTargetCourtId, setPauseTargetCourtId] = useState('');
  const [pauseResumeNotBefore, setPauseResumeNotBefore] = useState('');
  const [pauseDeferMode, setPauseDeferMode] = useState<'not_before' | 'end_of_queue'>('not_before');
  const [pauseNote, setPauseNote] = useState('');
  const [pauseResolutionPreview, setPauseResolutionPreview] = useState<PreviewEnvelope | null>(null);
  const [pauseResolutionReceipt, setPauseResolutionReceipt] = useState<PreviewEnvelope | null>(null);
  const [paperMatchId, setPaperMatchId] = useState('');
  const [paperActualStartedAt, setPaperActualStartedAt] = useState(() => localDateTimeValue(new Date(Date.now() - 40 * 60_000)));
  const [paperActualEndedAt, setPaperActualEndedAt] = useState(() => localDateTimeValue());
  const [paperEvidenceRef, setPaperEvidenceRef] = useState('');
  const [paperNote, setPaperNote] = useState('');
  const [paperSetScores, setPaperSetScores] = useState<Array<{ a: string; b: string }>>([
    { a: '', b: '' },
    { a: '', b: '' },
    { a: '', b: '' },
  ]);
  const [paperImportPreview, setPaperImportPreview] = useState<PreviewEnvelope | null>(null);
  const [paperImportReceipt, setPaperImportReceipt] = useState<PreviewEnvelope | null>(null);
  const [grantCourtId, setGrantCourtId] = useState('');
  const [grantDeviceId, setGrantDeviceId] = useState('');
  const [grantTtlMinutes, setGrantTtlMinutes] = useState('480');
  const [issuedGrant, setIssuedGrant] = useState<ApiRecord | null>(null);
  const [approvalPreviewId, setApprovalPreviewId] = useState('');
  const [redApprovalId, setRedApprovalId] = useState('');
  const [approvalReview, setApprovalReview] = useState<ApiRecord | null>(null);
  const [confirmApprovalReview, setConfirmApprovalReview] = useState(false);
  const [approvalResult, setApprovalResult] = useState<ApiRecord | null>(null);
  const [finishReviewNotes, setFinishReviewNotes] = useState<Record<string, string>>({});
  const [publicationTarget, setPublicationTarget] = useState<'published' | 'unpublished'>('published');
  const [publicationNote, setPublicationNote] = useState('Решение директора после проверки расписания и публичных данных');
  const [publicationPreview, setPublicationPreview] = useState<PreviewEnvelope | null>(null);
  const [publicationReceipt, setPublicationReceipt] = useState<PreviewEnvelope | null>(null);
  const [courtPolicyTier, setCourtPolicyTier] = useState<'hard' | 'medium' | 'light'>('light');
  const [courtPolicyStageId, setCourtPolicyStageId] = useState('');
  const [courtPolicyAllowedCourtIds, setCourtPolicyAllowedCourtIds] = useState<string[]>([]);
  const [courtPolicyEffectiveFrom, setCourtPolicyEffectiveFrom] = useState(() => localDateTimeValue());
  const [courtPolicyEffectiveUntil, setCourtPolicyEffectiveUntil] = useState(() => localDateTimeValue(new Date(Date.now() + 2 * 60 * 60_000)));
  const [courtPolicyNote, setCourtPolicyNote] = useState('Временное отклонение от строгого закрепления кортов');
  const [courtPolicyPreview, setCourtPolicyPreview] = useState<PreviewEnvelope | null>(null);
  const [scheduleDeferMatchId, setScheduleDeferMatchId] = useState('');
  const [scheduleDeferMode, setScheduleDeferMode] = useState<'not_before' | 'end_of_queue'>('not_before');
  const [scheduleDeferNotBefore, setScheduleDeferNotBefore] = useState(() => localDateTimeValue(new Date(Date.now() + 60 * 60_000)));
  const [scheduleDeferNote, setScheduleDeferNote] = useState('Оперативная задержка матча без спортивного результата');
  const [scheduleDeferPreview, setScheduleDeferPreview] = useState<PreviewEnvelope | null>(null);
  const [scheduleDeferReleaseMatchId, setScheduleDeferReleaseMatchId] = useState('');
  const [scheduleDeferReleaseNote, setScheduleDeferReleaseNote] = useState('Причина defer устранена; вернуть матч в общий расчёт');
  const [scheduleDeferReleasePreview, setScheduleDeferReleasePreview] = useState<PreviewEnvelope | null>(null);
  const [stageRuleStageId, setStageRuleStageId] = useState('');
  const [stageRuleEffectiveRound, setStageRuleEffectiveRound] = useState('1');
  const [stageRulePreset, setStageRulePreset] = useState<MatchRuleCode>('single_21');
  const [stageRuleNote, setStageRuleNote] = useState('Единое изменение формата со следующего полного раунда');
  const [stageRulePreview, setStageRulePreview] = useState<PreviewEnvelope | null>(null);

  const baseUrl = `/api/admin/go-v2/tournaments/${encodeURIComponent(tournamentId)}`;
  const standaloneBracket = config.formatMode === 'standalone_bracket';
  const groupSizes = useMemo(
    () => standaloneBracket ? null : getGroupSizes(config.teamCount),
    [config.teamCount, standaloneBracket],
  );
  const modifiedAllowed = Boolean(groupSizes?.length && groupSizes.every((size) => size === 4));
  const estimate = useMemo(() => {
    if (standaloneBracket) {
      const minimum = config.playoffFormat === 'single_elimination' ? 2 : 3;
      if (!Number.isSafeInteger(config.teamCount) || config.teamCount < minimum || config.teamCount > 48) return null;
      const playoffMatches = config.playoffFormat === 'classification'
        ? classificationRealMatchCount(config.teamCount) as number
        : config.playoffFormat === 'double_elimination'
          ? (config.resetFinalEnabled ? 2 * config.teamCount - 1 : 2 * config.teamCount - 2)
          : config.teamCount - 1 + (config.bronzeEnabled && config.teamCount >= 4 ? 1 : 0);
      const minutes = MATCH_RULES.find((rule) => rule.code === config.playoffMatchRule)?.minutes ?? 50;
      return { groupMatches: 0, playoffMatches, totalMatches: playoffMatches, courtMinutes: playoffMatches * minutes, tiers: { hard: config.teamCount, medium: 0, light: 0, mode: 'standalone' } };
    }
    return groupSizes ? estimateMatches(config, groupSizes) : null;
  }, [config, groupSizes, standaloneBracket]);
  const tierQuotaIssue = !standaloneBracket && groupSizes
    ? manualTierQuotaIssue(config.teamCount, groupSizes.length, config.tierMode, config.tierQuotas)
    : null;
  const courtConfigurationIssue = useMemo(() => {
    const courtNumbers = courts.map((court) => court.courtNo);
    if (new Set(courtNumbers).size !== courtNumbers.length) return 'Номера кортов не должны повторяться.';
    if (courts.some((court) => !court.label.trim())) return 'У каждого корта должно быть название.';
    if (courts.some((court) => court.availability.length < 1 || court.availability.length > 12)) {
      return 'У каждого корта должно быть от 1 до 12 окон доступности.';
    }
    if (courts.some((court) => court.availability.some((window) => !window.start || !window.end || window.start >= window.end))) {
      return 'Окно доступности корта должно иметь положительную длительность.';
    }
    if (courts.some((court) => {
      const ordered = [...court.availability].sort((left, right) => left.start.localeCompare(right.start));
      return ordered.some((window, index) => index > 0 && ordered[index - 1].end > window.start);
    })) return 'Окна одного корта не должны пересекаться.';
    return null;
  }, [courts]);
  const formatReady = Boolean(estimate) && !tierQuotaIssue;
  const aggregateVersion = Number(
    structure?.aggregateVersion
      ?? structure?.version
      ?? asRecord(structure?.tournament).aggregateVersion
      ?? 0,
  );
  const tournamentProjection = asRecord(structure?.tournament);
  const currentLifecycle = String(
    structure?.lifecycleStatus
      ?? tournamentProjection.lifecycleState
      ?? tournamentProjection.lifecycleStatus
      ?? tournamentProjection.status
      ?? 'draft',
  );
  const publicationState = String(tournamentProjection.publicationState ?? 'shadow');
  const publicKillSwitchEnabled = tournamentProjection.publicKillSwitchEnabled === true;
  const entries = useMemo(
    () => (Array.isArray(structure?.entries) ? structure.entries.map(asRecord) : []),
    [structure?.entries],
  );
  const entryById = useMemo(
    () => new Map(entries.map((entry) => [String(entry.id ?? entry.entryId ?? ''), entry])),
    [entries],
  );
  const waitlistEntries = useMemo(
    () => entries.filter((entry) => String(entry.registrationState ?? '') === 'waitlist'),
    [entries],
  );
  const noShowEntries = useMemo(
    () => entries.filter((entry) => (
      String(entry.registrationState ?? '') === 'confirmed'
      && String(entry.attendanceState ?? '') === 'no_show'
    )),
    [entries],
  );
  const reserveTargetEntries = useMemo(
    () => entries.filter((entry) => {
      const entryId = String(entry.id ?? entry.entryId ?? '');
      const registrationState = String(entry.registrationState ?? '');
      const attendanceState = String(entry.attendanceState ?? '');
      return entryId !== reserveEntryId && (
        registrationState === 'withdrawn'
        || (registrationState === 'confirmed' && attendanceState === 'no_show')
      );
    }),
    [entries, reserveEntryId],
  );
  const reserveNeedsTarget = currentLifecycle !== 'registration_locked';
  const reservePromotions = useMemo(
    () => (Array.isArray(structure?.reservePromotions) ? structure.reservePromotions.map(asRecord) : []),
    [structure?.reservePromotions],
  );
  const attendanceReinstatements = useMemo(
    () => (Array.isArray(structure?.attendanceReinstatements) ? structure.attendanceReinstatements.map(asRecord) : []),
    [structure?.attendanceReinstatements],
  );
  const stagesById = useMemo(() => new Map(
    (Array.isArray(structure?.stages) ? structure.stages : []).map((value) => {
      const stage = asRecord(value);
      return [String(stage.id ?? ''), stage] as const;
    }),
  ), [structure?.stages]);
  const matches = useMemo(
    () => (Array.isArray(structure?.matches) ? structure.matches.map(asRecord) : []),
    [structure?.matches],
  );
  const pausedMatches = useMemo(
    () => matches.filter((match) => String(match.playState ?? '') === 'paused'),
    [matches],
  );
  const paperImportMatches = useMemo(
    () => matches.filter((match) => (
      ['pending', 'ready', 'live', 'paused'].includes(String(match.playState ?? ''))
      && ['scheduled', 'locked'].includes(String(match.scheduleState ?? ''))
    )),
    [matches],
  );
  const finishReviewMatches = useMemo(
    () => matches.filter((match) => (
      match.finishReviewRequired === true
      && ['live', 'paused'].includes(String(match.playState ?? ''))
    )),
    [matches],
  );
  const persistedCourts = useMemo(
    () => (Array.isArray(structure?.courts) ? structure.courts.map(asRecord) : []),
    [structure?.courts],
  );
  const activeDisruptions = useMemo(
    () => (Array.isArray(structure?.activeDisruptions) ? structure.activeDisruptions.map(asRecord) : []),
    [structure?.activeDisruptions],
  );
  const activeCourtGrants = useMemo(
    () => (Array.isArray(structure?.activeCourtGrants) ? structure.activeCourtGrants.map(asRecord) : []),
    [structure?.activeCourtGrants],
  );
  const courtPolicyExceptions = useMemo(
    () => (Array.isArray(structure?.courtPolicyExceptions) ? structure.courtPolicyExceptions.map(asRecord) : []),
    [structure?.courtPolicyExceptions],
  );
  const playoffStages = useMemo(
    () => (Array.isArray(structure?.stages) ? structure.stages.map(asRecord) : []).filter((stage) => (
      !['round_robin_pool', 'modified_pool_4', 'tier_split'].includes(String(stage.stageType ?? ''))
    )),
    [structure?.stages],
  );
  const deferrableMatches = useMemo(
    () => matches.filter((match) => ['pending', 'ready'].includes(String(match.playState ?? ''))),
    [matches],
  );
  const activeGenericDefers = useMemo(
    () => (Array.isArray(structure?.deferOverrides) ? structure.deferOverrides.map(asRecord) : []).filter((item) => item.isActive === true && item.isGeneric === true),
    [structure?.deferOverrides],
  );
  const ruleEditableStages = useMemo(
    () => (Array.isArray(structure?.stages) ? structure.stages.map(asRecord) : []).filter((stage) => (
      ['round_robin_pool', 'modified_pool_4', 'single_elimination', 'double_elimination', 'placement_match'].includes(String(stage.stageType ?? ''))
    )),
    [structure?.stages],
  );
  const stageRuleSuggestedRound = useMemo(() => {
    const stage = ruleEditableStages.find((item) => String(item.id ?? '') === stageRuleStageId);
    if (!stage) return 1;
    if (['round_robin_pool', 'modified_pool_4'].includes(String(stage.stageType ?? ''))) return 1;
    const rounds = new Map<number, ApiRecord[]>();
    for (const match of matches.filter((item) => String(item.stageId ?? '') === stageRuleStageId)) {
      const round = Number(match.roundNo ?? 0);
      if (round > 0) rounds.set(round, [...(rounds.get(round) ?? []), match]);
    }
    return [...rounds.entries()]
      .sort(([left], [right]) => left - right)
      .find(([, roundMatches]) => roundMatches.length > 0 && roundMatches.every((match) => (
        String(match.playState ?? '') === 'pending' && Number(match.currentResultRevisionNo ?? 0) === 0
      )))?.[0] ?? 1;
  }, [matches, ruleEditableStages, stageRuleStageId]);
  const attendancePolicy = asRecord(structure?.attendancePolicy);
  const incidentEntryOptions = useMemo(() => {
    const selected = matches.find((match) => String(match.id ?? '') === matchId);
    if (!selected) return entries;
    const participantIds = new Set((Array.isArray(selected.slotSources) ? selected.slotSources : [])
      .map((value) => {
        const source = asRecord(value);
        return String(source.resolvedEntryId ?? source.sourceEntryId ?? '');
      })
      .filter(Boolean));
    return participantIds.size
      ? entries.filter((entry) => participantIds.has(String(entry.id ?? entry.entryId ?? '')))
      : entries;
  }, [entries, matchId, matches]);
  const drawGroups = useMemo(() => {
    const groups = previewCandidate(drawPreview).groups;
    return Array.isArray(groups) ? groups.map(asRecord) : [];
  }, [drawPreview]);
  const drawEntries = useMemo(() => drawGroups.flatMap((group) => (
    (Array.isArray(group.slots) ? group.slots : []).map((rawSlot) => {
      const slot = asRecord(rawSlot);
      return asRecord(slot.entry);
    })
  )), [drawGroups]);
  const bracketTiers = useMemo(() => {
    const candidate = previewCandidate(bracketPreview);
    const tierBrackets = Array.isArray(candidate.tierBrackets) ? candidate.tierBrackets.map(asRecord) : [];
    if (tierBrackets.length) return tierBrackets;
    const topology = asRecord(candidate.topology);
    return Array.isArray(topology.matches)
      ? [{ tier: candidate.tier ?? 'hard', bracketType: candidate.bracketType, topology }]
      : [];
  }, [bracketPreview]);
  const bracketWarnings = useMemo(() => {
    const warnings = previewResult(bracketPreview).warnings;
    return Array.isArray(warnings) ? warnings : [];
  }, [bracketPreview]);
  const activeSchedule = useMemo(() => {
    const versions = Array.isArray(structure?.scheduleVersions) ? structure.scheduleVersions.map(asRecord) : [];
    const activeId = String(asRecord(structure?.tournament).activeScheduleVersionId ?? '');
    return versions.find((version) => String(version.id ?? '') === activeId)
      ?? versions.find((version) => String(version.status ?? '') === 'published')
      ?? null;
  }, [structure?.scheduleVersions, structure?.tournament]);
  const scheduleModel = useMemo(() => {
    const result = previewResult(schedulePreview);
    const candidate = asRecord(result.candidate);
    const solver = asRecord(candidate.solverResult ?? result.solverResult);
    const previewAssignments = Array.isArray(solver.assignments) ? solver.assignments.map(asRecord) : [];
    const storedAssignments = Array.isArray(activeSchedule?.assignments)
      ? activeSchedule.assignments.map(asRecord)
      : [];
    const conflicts = Array.isArray(result.conflicts)
      ? result.conflicts.map(asRecord)
      : Array.isArray(solver.conflicts)
        ? solver.conflicts.map(asRecord)
        : Array.isArray(activeSchedule?.conflicts)
          ? activeSchedule.conflicts.map(asRecord)
          : [];
    const warnings = Array.isArray(result.warnings)
      ? result.warnings.map((value) => typeof value === 'string' ? { message: value, severity: 'warning' } : asRecord(value))
      : Array.isArray(solver.warnings)
        ? solver.warnings.map(asRecord)
        : [];
    return {
      assignments: previewAssignments.length ? previewAssignments : storedAssignments,
      conflicts,
      warnings,
      status: String(solver.status ?? activeSchedule?.solverStatus ?? result.status ?? schedulePreview?.status ?? 'preview'),
      metrics: asRecord(solver.metrics),
      objective: asRecord(solver.objective ?? activeSchedule?.objective),
      diagnostics: asRecord(solver.diagnostics ?? result.diagnostics ?? activeSchedule?.diagnostics),
    };
  }, [activeSchedule, schedulePreview]);
  const pauseSourceCourtId = useMemo(() => String(
    scheduleModel.assignments.find((assignment) => String(assignment.matchId ?? '') === pauseMatchId)?.courtId ?? '',
  ), [pauseMatchId, scheduleModel.assignments]);
  const scheduleCourtLanes = useMemo(() => {
    const lanes = new Map<string, { courtNo: number; label: string; assignments: ApiRecord[] }>();
    for (const assignment of scheduleModel.assignments) {
      const courtNo = Number(assignment.courtNo ?? String(assignment.courtId ?? '').replace(/^court-/, ''));
      const court = courts.find((item) => item.courtNo === courtNo);
      const key = String(assignment.courtId ?? (Number.isFinite(courtNo) ? `court-${courtNo}` : 'court-unknown'));
      const lane = lanes.get(key) ?? {
        courtNo: Number.isFinite(courtNo) ? courtNo : 999,
        label: String(assignment.courtLabel ?? court?.label ?? (Number.isFinite(courtNo) ? `Корт ${courtNo}` : 'Корт')),
        assignments: [],
      };
      lane.assignments.push(assignment);
      lanes.set(key, lane);
    }
    return [...lanes.values()]
      .map((lane) => ({
        ...lane,
        assignments: lane.assignments.sort((left, right) => Date.parse(String(left.liveEta ?? left.start ?? left.plannedStart ?? '')) - Date.parse(String(right.liveEta ?? right.start ?? right.plannedStart ?? ''))),
      }))
      .sort((left, right) => left.courtNo - right.courtNo);
  }, [courts, scheduleModel.assignments]);
  const scheduleDiagnosticsModel = useMemo(() => {
    const diagnostics = scheduleModel.diagnostics;
    const courtRows = Array.isArray(diagnostics.courts) ? diagnostics.courts.map(asRecord) : [];
    const tierRows = Array.isArray(diagnostics.tiers) ? diagnostics.tiers.map(asRecord) : [];
    const teamRows = Array.isArray(diagnostics.teamTimelines) ? diagnostics.teamTimelines.map(asRecord) : [];
    const refereeBalance = asRecord(diagnostics.refereeBalance);
    return {
      courts: courtRows.sort((left, right) => String(left.courtId ?? '').localeCompare(String(right.courtId ?? ''))),
      tiers: tierRows.filter((row) => Number(row.assignmentCount ?? 0) > 0),
      pressureTeams: teamRows
        .filter((row) => Number(row.games ?? 0) > 1)
        .sort((left, right) => (
          Number(right.softRestDeficitMinutes ?? 0) - Number(left.softRestDeficitMinutes ?? 0)
          || Number(right.maxWaitMinutes ?? 0) - Number(left.maxWaitMinutes ?? 0)
          || String(left.teamId ?? '').localeCompare(String(right.teamId ?? ''))
        ))
        .slice(0, 6),
      refereeBalance,
    };
  }, [scheduleModel.diagnostics]);
  const incidentQualificationModel = useMemo(() => {
    const impact = asRecord(previewResult(incidentPreview).impact);
    const correction = asRecord(impact.qualificationCorrection);
    const capabilities = asRecord(correction.capabilities);
    const cascade = asRecord(capabilities.cascadeVoidAndReplay);
    const retain = asRecord(capabilities.retainProgressionOverride);
    const blockers = Array.isArray(correction.blockers) ? correction.blockers.map(asRecord) : [];
    return {
      active: Boolean(correction.qualificationSnapshotId),
      cascadeAvailable: cascade.available !== false,
      retainAvailable: retain.available === true,
      retainRole: String(retain.requiredRole ?? 'admin'),
      blockers,
      changes: Array.isArray(correction.changes) ? correction.changes.map(asRecord) : [],
    };
  }, [incidentPreview]);

  useEffect(() => {
    if (config.poolMode === 'modified_pool_4' && !modifiedAllowed) {
      setConfig((current) => ({ ...current, poolMode: 'round_robin_pool' }));
    }
  }, [config.poolMode, modifiedAllowed]);

  useEffect(() => {
    setDrawPreview(null);
    setBracketPreview(null);
    setSchedulePreview(null);
  }, [config]);

  useEffect(() => {
    if (incidentQualificationModel.active && !incidentQualificationModel.cascadeAvailable) {
      setIncidentResolution('retain_progression_override');
    }
  }, [incidentQualificationModel.active, incidentQualificationModel.cascadeAvailable]);

  useEffect(() => {
    setDrawPreview(null);
    setBracketPreview(null);
    setSchedulePreview(null);
  }, [manualSwaps]);

  useEffect(() => {
    setDrawUnlockPreview(null);
  }, [drawUnlockReseed]);

  useEffect(() => {
    setSchedulePreview(null);
  }, [linkedTournamentIdsInput]);

  useEffect(() => {
    setCourts((current) => {
      if (current.length === config.courtCount) return current;
      if (current.length > config.courtCount) return current.slice(0, config.courtCount);
      const next = [...current];
      const used = new Set(next.map((court) => court.courtNo));
      while (next.length < config.courtCount) {
        const courtNo = [1, 2, 3, 4, 5, 6].find((value) => !used.has(value)) ?? next.length + 1;
        used.add(courtNo);
        next.push({
          courtNo,
          label: `Корт ${courtNo}`,
          availability: [{ start: config.startTime, end: config.endTime }],
        });
      }
      return next;
    });
  }, [config.courtCount, config.endTime, config.startTime]);

  useEffect(() => {
    setSchedulePreview(null);
  }, [courts, liveEtaOverrides]);

  useEffect(() => {
    setIncidentPreview(null);
    setConfirmRedIncident(false);
  }, [matchId, incidentEntryId, incidentKind, incidentReason, technicalStandingProfile, incidentNote, setScores]);

  useEffect(() => {
    setAttendancePreview(null);
  }, [attendanceEffectiveAt, attendanceEntryId, attendanceNote, attendanceState]);

  useEffect(() => {
    setReinstatementPreview(null);
  }, [reinstatementDecision, reinstatementEntryId, reinstatementNote, reinstatementTargetState]);

  useEffect(() => {
    setReservePromotionPreview(null);
  }, [reserveEntryId, reservePromotionNote, reserveTargetEntryId]);

  useEffect(() => {
    if (!reserveNeedsTarget) setReserveTargetEntryId('');
    setReservePromotionPreview(null);
  }, [reserveNeedsTarget]);

  useEffect(() => {
    setDisruptionPreview(null);
  }, [disruptionCourtId, disruptionExpectedEndAt, disruptionKind, disruptionMatchId, disruptionNote, disruptionStartsAt]);

  useEffect(() => {
    setDisruptionResolutionPreview(null);
  }, [disruptionResolution, disruptionResolutionId, disruptionResolutionNote]);

  useEffect(() => {
    setPauseResolutionPreview(null);
  }, [pauseDecision, pauseDeferMode, pauseDisruptionId, pauseMatchId, pauseNote, pauseResumeNotBefore, pauseTargetCourtId]);

  useEffect(() => {
    setPauseTargetCourtId('');
  }, [pauseMatchId]);

  useEffect(() => {
    setPaperImportPreview(null);
  }, [paperActualEndedAt, paperActualStartedAt, paperEvidenceRef, paperMatchId, paperNote, paperSetScores]);

  useEffect(() => {
    setPublicationTarget(publicationState === 'published' ? 'unpublished' : 'published');
    setPublicationPreview(null);
  }, [publicationState]);

  useEffect(() => {
    setPublicationPreview(null);
  }, [publicationNote, publicationTarget]);

  useEffect(() => {
    setCourtPolicyPreview(null);
  }, [courtPolicyAllowedCourtIds, courtPolicyEffectiveFrom, courtPolicyEffectiveUntil, courtPolicyNote, courtPolicyStageId, courtPolicyTier]);

  useEffect(() => {
    setScheduleDeferPreview(null);
  }, [scheduleDeferMatchId, scheduleDeferMode, scheduleDeferNotBefore, scheduleDeferNote]);

  useEffect(() => {
    setScheduleDeferReleasePreview(null);
  }, [scheduleDeferReleaseMatchId, scheduleDeferReleaseNote]);

  useEffect(() => {
    setStageRuleEffectiveRound(String(stageRuleSuggestedRound));
  }, [stageRuleStageId, stageRuleSuggestedRound]);

  useEffect(() => {
    setStageRulePreview(null);
  }, [stageRuleEffectiveRound, stageRuleNote, stageRulePreset, stageRuleStageId]);

  useEffect(() => {
    if (!pauseMatchId && pausedMatches[0]?.id) setPauseMatchId(String(pausedMatches[0].id));
  }, [pauseMatchId, pausedMatches]);

  useEffect(() => {
    if (!paperMatchId && paperImportMatches[0]?.id) setPaperMatchId(String(paperImportMatches[0].id));
  }, [paperImportMatches, paperMatchId]);

  useEffect(() => {
    if (!grantCourtId && persistedCourts[0]?.id) setGrantCourtId(String(persistedCourts[0].id));
  }, [grantCourtId, persistedCourts]);

  useEffect(() => {
    if (linkedTournamentIdsInput.trim()) return;
    const sessions = Array.isArray(structure?.scheduleSessions) ? structure.scheduleSessions : [];
    const sharedIds = sessions
      .flatMap((value) => {
        const tournamentIds = asRecord(value).tournamentIds;
        return Array.isArray(tournamentIds) ? tournamentIds.map(String) : [];
      })
      .filter((id) => id.toLowerCase() !== tournamentId.toLowerCase());
    if (sharedIds.length) setLinkedTournamentIdsInput([...new Set(sharedIds)].join(', '));
  }, [linkedTournamentIdsInput, structure?.scheduleSessions, tournamentId]);

  const loadStructure = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/structure`, { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as EngineStructure & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить состояние V2');
      setStructure(payload);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить состояние V2');
    }
  }, [baseUrl]);

  useEffect(() => {
    void loadStructure();
  }, [loadStructure]);

  useEffect(() => {
    const persistedCount = Array.isArray(structure?.entries) ? structure.entries.length : 0;
    const persistedStages = Array.isArray(structure?.stages) ? structure.stages.map(asRecord) : [];
    const groupStage = persistedStages.find((stage) => (
      stage.stageType === 'round_robin_pool' || stage.stageType === 'modified_pool_4'
    ));
    const tierSplitStage = persistedStages.find((stage) => stage.stageType === 'tier_split');
    const playoffStage = persistedStages.find((stage) => (
      stage.stageType === 'single_elimination'
      || stage.stageType === 'double_elimination'
      || (
        stage.stageType === 'placement_match'
        && asRecord(stage.configuration).materializationKind === 'classification_rounds'
      )
    ));
    if (persistedCount < 2 || persistedCount > 48) return;
    setConfig((current) => {
      const tournamentMetadata = asRecord(asRecord(structure?.tournament).metadata);
      const persistedFormatMode = String(tournamentMetadata.formatMode ?? '');
      const tierConfiguration = asRecord(tierSplitStage?.configuration);
      const exactQuotas = asRecord(tierConfiguration.tierQuotas);
      const persistedTiers = asRecord(tierConfiguration.tiers);
      const hasExactQuotas = ['hard', 'medium', 'light'].every((tier) => Number.isSafeInteger(Number(exactQuotas[tier])));
      const inferredTierMode = String(persistedTiers.mode ?? '');
      const nextTierMode: TierMode = hasExactQuotas
        ? 'manual'
        : inferredTierMode === 'two' || inferredTierMode === 'three'
          ? inferredTierMode
          : current.tierMode;
      const playoffConfiguration = asRecord(playoffStage?.configuration);
      return {
        ...current,
        teamCount: persistedCount,
        formatMode: persistedFormatMode === 'standalone_bracket' ? 'standalone_bracket' : current.formatMode,
        templateId: String(tournamentMetadata.formatTemplateId ?? current.templateId),
        poolMode: groupStage?.stageType === 'modified_pool_4'
          ? 'modified_pool_4'
          : groupStage?.stageType === 'round_robin_pool'
            ? 'round_robin_pool'
            : current.poolMode,
        groupMatchRule: persistedMatchRule(groupStage?.matchRule, current.groupMatchRule),
        playoffFormat: playoffStage?.stageType === 'double_elimination'
          ? 'double_elimination'
          : playoffStage?.stageType === 'single_elimination'
            ? 'single_elimination'
            : playoffStage?.stageType === 'placement_match'
              ? 'classification'
            : current.playoffFormat,
        playoffMatchRule: persistedMatchRule(playoffStage?.matchRule, current.playoffMatchRule),
        tierMode: nextTierMode,
        tierQuotas: hasExactQuotas
          ? {
              hard: Number(exactQuotas.hard),
              medium: Number(exactQuotas.medium),
              light: Number(exactQuotas.light),
            }
          : current.tierQuotas,
        bronzeEnabled: playoffConfiguration.bronzeEnabled == null
          ? current.bronzeEnabled
          : playoffConfiguration.bronzeEnabled !== false,
        resetFinalEnabled: playoffConfiguration.resetFinalEnabled == null
          ? current.resetFinalEnabled
          : playoffConfiguration.resetFinalEnabled !== false,
      };
    });
  }, [structure?.entries, structure?.stages, structure?.tournament]);

  function commandMeta(reasonCode: string, reasonNote?: string) {
    const commandId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return {
      expectedVersion: aggregateVersion,
      commandId,
      idempotencyKey: commandId,
      deviceId: getV2DeviceId(),
      reasonCode,
      ...(reasonNote?.trim() ? { reasonNote: reasonNote.trim() } : {}),
    };
  }

  function entryLabel(entryId: string, embedded?: ApiRecord): string {
    const entry = entryById.get(entryId) ?? embedded ?? {};
    return String(entry.displayName ?? entry.name ?? (entryId ? `Команда ${entryId.slice(0, 8)}` : 'Команда не определена'));
  }

  function entryOptionLabel(entryId: string, embedded?: ApiRecord): string {
    const entry = entryById.get(entryId) ?? embedded ?? {};
    const seed = Number(entry.initialSeed ?? entry.seed ?? 0);
    const rating = Number(entry.ratingSnapshotValue ?? entry.rating ?? entry.ratingValue ?? 0);
    return [
      entryLabel(entryId, embedded),
      seed > 0 ? `seed #${seed}` : '',
      Number.isFinite(rating) ? `рейтинг ${rating}` : '',
    ].filter(Boolean).join(' · ');
  }

  function matchParticipantIds(match: ApiRecord): string[] {
    const ids = (Array.isArray(match.slotSources) ? match.slotSources : [])
      .map((value) => {
        const source = asRecord(value);
        return String(source.resolvedEntryId ?? source.sourceEntryId ?? '');
      })
      .filter(Boolean);
    return [...new Set(ids)];
  }

  function matchLabel(match: ApiRecord): string {
    const stage = stagesById.get(String(match.stageId ?? ''));
    const stageName = String(stage?.tier ? TIER_LABELS[String(stage.tier)] ?? stage.tier : stage?.stageKey ?? 'Стадия');
    const participants = matchParticipantIds(match).map((entryId) => entryLabel(entryId));
    const matchup = participants.length ? participants.join(' — ') : 'участники определятся';
    return `${String(match.matchKey ?? `R${Number(match.roundNo ?? 0)}·${Number(match.position ?? 0)}`)} · ${stageName} · ${matchup}`;
  }

  function liveScoreLabel(match: ApiRecord): string {
    const liveScore = asRecord(match.liveScore);
    const sets = Array.isArray(liveScore.sets)
      ? liveScore.sets.map((value) => {
          const set = asRecord(value);
          return `${Number(set.a ?? 0)}:${Number(set.b ?? 0)}`;
        })
      : [];
    const points = asRecord(liveScore.points);
    const currentPoints = Number(points.a ?? 0) || Number(points.b ?? 0)
      ? ` · текущая ${Number(points.a ?? 0)}:${Number(points.b ?? 0)}`
      : '';
    return sets.length ? `${sets.join(', ')}${currentPoints}` : `0:0${currentPoints}`;
  }

  function bracketSourceLabel(value: unknown): string {
    const source = asRecord(value);
    const kind = String(source.kind ?? source.sourceType ?? '');
    if (kind === 'BYE') return 'BYE';
    if (kind === 'ENTRY') return entryLabel(String(source.entryId ?? source.sourceEntryId ?? ''), source);
    const sourceMatchId = String(source.matchId ?? source.sourceMatchId ?? '');
    if (kind === 'MATCH_WINNER') return `Победитель ${sourceMatchId}`;
    if (kind === 'MATCH_LOSER') return `Проигравший ${sourceMatchId}`;
    return sourceMatchId || 'Участник определится';
  }

  function formatScheduleTime(value: unknown): string {
    const parsed = Date.parse(String(value ?? ''));
    if (!Number.isFinite(parsed)) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: config.timezone,
    }).format(new Date(parsed));
  }

  function queueManualSwap(entryA: string, entryB: string) {
    const left = entryA.trim();
    const right = entryB.trim();
    if (!left || !right || left === right) {
      setError('Для обмена выберите две разные команды.');
      return;
    }
    setManualSwaps((current) => [...current, { entryA: left, entryB: right }]);
    setSwapEntryA('');
    setSwapEntryB('');
    setDrawPreview(null);
    setNotice('Обмен добавлен в черновик. Пересчитайте preview.');
  }

  function addLiveEtaOverride() {
    if (!liveEtaMatchId || !liveEtaValue) {
      setError('Выберите матч и новое время Live ETA.');
      return;
    }
    const parsed = zonedDateTimeToIso(liveEtaValue, config.timezone);
    if (!parsed) {
      setError('Укажите корректные дату и время Live ETA.');
      return;
    }
    const override = { matchId: liveEtaMatchId, liveEta: parsed };
    setLiveEtaOverrides((current) => [...current.filter((item) => item.matchId !== liveEtaMatchId), override]);
    setLiveEtaMatchId('');
    setLiveEtaValue('');
    setNotice('Live ETA добавлен в черновик replan.');
  }

  function applyFormatPreset(presetId: string) {
    const preset = FORMAT_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    if (preset.pool === 'modified_pool_4') {
      const partition = getGroupSizes(config.teamCount);
      if (!partition?.length || !partition.every((size) => size === 4)) {
        setError('Modified Pool 4 требует, чтобы текущее число команд делилось только на группы по четыре.');
        return;
      }
    }
    if (preset.mode === 'standalone_bracket' && preset.playoff === 'double_elimination' && config.teamCount < 3) {
      setError('Standalone Double Elimination требует минимум три команды.');
      return;
    }
    if (preset.playoff === 'classification' && config.teamCount < 3) {
      setError('Классификационные раунды требуют от 3 до 48 команд. Для двух команд выберите отдельную серию.');
      return;
    }
    setConfig((current) => ({
      ...current,
      templateId: preset.id,
      formatMode: preset.mode,
      poolMode: preset.pool,
      tierMode: preset.tiers,
      playoffFormat: preset.playoff,
      bronzeEnabled: preset.playoff === 'single_elimination',
      resetFinalEnabled: preset.playoff === 'double_elimination',
    }));
    setError('');
    setNotice(`Пресет «${preset.label}» применён в черновик.`);
  }

  function toIso(value: string, fieldLabel: string): string {
    const parsed = zonedDateTimeToIso(value, config.timezone);
    if (!parsed) throw new Error(`Укажите корректные дату и время: ${fieldLabel}.`);
    return parsed;
  }

  async function runCommand(
    action: string,
    path: string,
    payload: ApiRecord,
  ): Promise<PreviewEnvelope | null> {
    setPendingAction(action);
    setError('');
    setErrorDetails(null);
    setNotice('');
    try {
      const requestHash = await adminCommandRequestHash(tournamentId, path, payload);
      const body = JSON.stringify({ ...payload, requestHash });
      let transportError: unknown = null;
      // A dropped response (including a truncated successful JSON body) is
      // retried once with the exact same body and commandId. The server command
      // journal returns the original receipt instead of applying it twice.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 20_000);
        try {
          const response = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal: controller.signal,
          });
          let result: PreviewEnvelope & { error?: string };
          try {
            result = await response.json() as PreviewEnvelope & { error?: string };
          } catch (reason) {
            if (!response.ok) throw new Error(`HTTP ${response.status}: сервер вернул нечитаемый ответ`);
            transportError = reason;
            if (attempt === 0) continue;
            throw new Error('Ответ сервера потерян после выполнения команды. Повтор с тем же commandId не вернул receipt.');
          }
          if (!response.ok) {
            const details = asRecord(result.details);
            setErrorDetails({
              ...(result.code ? { code: result.code } : {}),
              ...(Object.keys(details).length ? { details } : {}),
            });
            const rejected = new Error(result.error || `Операция ${action} не выполнена`);
            rejected.name = 'GoV2HttpError';
            throw rejected;
          }
          setNotice(action);
          if (!path.endsWith('/preview')) await loadStructure();
          return result;
        } catch (reason) {
          transportError = reason;
          if (reason instanceof Error && (reason.name === 'GoV2HttpError' || /^HTTP \d+:/.test(reason.message))) throw reason;
          if (attempt === 1) throw reason;
        } finally {
          window.clearTimeout(timeout);
        }
      }
      throw transportError ?? new Error('Сервер недоступен');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Операция ${action} не выполнена`);
      return null;
    } finally {
      setPendingAction('');
    }
  }

  async function decideFinishReview(match: ApiRecord, decision: 'accept' | 'reject') {
    const reviewedMatchId = String(match.id ?? '');
    const finishRequestVersion = Number(match.commandVersion);
    if (!reviewedMatchId || !Number.isSafeInteger(finishRequestVersion) || finishRequestVersion < 1) {
      setError('Запрос завершения устарел или не содержит версии судейского журнала. Обновите страницу.');
      return;
    }
    const enteredNote = String(finishReviewNotes[reviewedMatchId] ?? '').trim();
    if (decision === 'reject' && !enteredNote) {
      setError('Для отклонения укажите причину, которую увидит аудит турнира.');
      return;
    }
    const reasonNote = enteredNote || 'Директор сверил серверный счёт и подтвердил завершение матча';
    const result = await runCommand(
      decision === 'accept' ? 'Результат подтверждён директором' : 'Запрос завершения отклонён',
      `/matches/${encodeURIComponent(reviewedMatchId)}/finish/${decision}`,
      {
        ...commandMeta('admin_override', reasonNote),
        finishRequestVersion,
      },
    );
    if (result) {
      setFinishReviewNotes((current) => {
        const next = { ...current };
        delete next[reviewedMatchId];
        return next;
      });
    }
  }

  async function previewAttendance() {
    if (!attendanceEntryId) {
      setError('Выберите команду для изменения присутствия.');
      return;
    }
    const current = entryById.get(attendanceEntryId);
    const reasonCode = attendanceReasonCode(attendanceState, String(current?.attendanceState ?? 'unknown'));
    if (['attendance_late_hold', 'attendance_no_show', 'attendance_reinstated'].includes(reasonCode) && !attendanceNote.trim()) {
      setError('Для опоздания, неявки или восстановления укажите причину.');
      return;
    }
    try {
      const result = await runCommand(
        'Предпросмотр attendance рассчитан',
        `/entries/${encodeURIComponent(attendanceEntryId)}/attendance/preview`,
        {
          ...commandMeta(reasonCode, attendanceNote),
          attendanceState,
          effectiveAt: toIso(attendanceEffectiveAt, 'время статуса'),
        },
      );
      if (result) {
        setAttendancePreview(result);
        if (result.risk === 'red' && result.previewId) setApprovalPreviewId(result.previewId);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось проверить attendance');
    }
  }

  async function commitAttendance() {
    if (!attendanceEntryId || !attendancePreview?.previewId || !attendancePreview.inputHash) {
      setError('Сначала рассчитайте актуальный preview attendance.');
      return;
    }
    if (attendancePreview.risk === 'red' && !redApprovalId.trim()) {
      setError('Восстановление после зафиксированных технических результатов требует approval ID второго администратора.');
      return;
    }
    const current = entryById.get(attendanceEntryId);
    const result = await runCommand(
      'Статус присутствия сохранён',
      `/entries/${encodeURIComponent(attendanceEntryId)}/attendance/commit`,
      {
        ...commandMeta(attendanceReasonCode(attendanceState, String(current?.attendanceState ?? 'unknown')), attendanceNote),
        previewId: attendancePreview.previewId,
        inputHash: attendancePreview.inputHash,
        confirmRed: attendancePreview.risk === 'red' ? true : undefined,
        redApprovalId: attendancePreview.risk === 'red' ? redApprovalId.trim() : undefined,
      },
    );
    if (result) setAttendancePreview(null);
  }

  async function previewDisruption() {
    if (!disruptionNote.trim()) {
      setError('Укажите причину остановки или изменения корта.');
      return;
    }
    const courtScoped = ['court_close', 'court_damage'].includes(disruptionKind);
    if (courtScoped && !disruptionCourtId) {
      setError('Для этого события выберите физический корт.');
      return;
    }
    if (disruptionKind === 'medical_delay' && !disruptionMatchId) {
      setError('Медицинская задержка должна быть привязана к конкретному матчу.');
      return;
    }
    try {
      const result = await runCommand('Impact preview disruption рассчитан', '/schedule/disruptions/preview', {
        ...commandMeta('disruption_recorded', disruptionNote),
        disruptionKind,
        ...(courtScoped ? { courtId: disruptionCourtId } : {}),
        ...(disruptionKind === 'medical_delay' ? { matchId: disruptionMatchId } : {}),
        startsAt: toIso(disruptionStartsAt, 'начало события'),
        ...(disruptionExpectedEndAt ? { expectedEndAt: toIso(disruptionExpectedEndAt, 'ожидаемое окончание') } : {}),
      });
      if (result) {
        setDisruptionPreview(result);
        if (result.risk === 'red' && result.previewId) setApprovalPreviewId(result.previewId);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось проверить disruption');
    }
  }

  async function commitDisruption() {
    if (!disruptionPreview?.previewId || !disruptionPreview.inputHash) {
      setError('Сначала рассчитайте актуальный disruption preview.');
      return;
    }
    if (disruptionPreview.risk === 'red' && !redApprovalId.trim()) {
      setError('Затронут LIVE-матч: нужен approval ID второго администратора.');
      return;
    }
    const result = await runCommand('Событие записано; LIVE-матчи поставлены на паузу', '/schedule/disruptions/commit', {
      ...commandMeta('disruption_recorded', disruptionNote),
      previewId: disruptionPreview.previewId,
      inputHash: disruptionPreview.inputHash,
      confirmRed: disruptionPreview.risk === 'red' ? true : undefined,
      redApprovalId: disruptionPreview.risk === 'red' ? redApprovalId.trim() : undefined,
    });
    if (result) setDisruptionPreview(null);
  }

  async function previewDisruptionResolution() {
    if (!disruptionResolutionId) {
      setError('Выберите активное событие.');
      return;
    }
    if (!disruptionResolutionNote.trim()) {
      setError('Добавьте причину закрытия или отмены disruption.');
      return;
    }
    const result = await runCommand(
      'Проверка закрытия disruption готова',
      `/schedule/disruptions/${encodeURIComponent(disruptionResolutionId)}/resolve/preview`,
      {
        ...commandMeta('disruption_resolved', disruptionResolutionNote),
        resolution: disruptionResolution,
      },
    );
    if (result) {
      setDisruptionResolutionPreview(result);
      setDisruptionResolutionReceipt(null);
    }
  }

  async function commitDisruptionResolution() {
    if (!disruptionResolutionId || !disruptionResolutionPreview?.previewId || !disruptionResolutionPreview.inputHash) {
      setError('Сначала рассчитайте актуальный preview закрытия disruption.');
      return;
    }
    const result = await runCommand(
      disruptionResolution === 'resolved' ? 'Событие закрыто' : 'Событие отменено',
      `/schedule/disruptions/${encodeURIComponent(disruptionResolutionId)}/resolve/commit`,
      {
        ...commandMeta('disruption_resolved', disruptionResolutionNote),
        previewId: disruptionResolutionPreview.previewId,
        inputHash: disruptionResolutionPreview.inputHash,
      },
    );
    if (result) {
      setDisruptionResolutionReceipt(result);
      setDisruptionResolutionPreview(null);
      setDisruptionResolutionId('');
    }
  }

  function pauseResolutionPayload(): ApiRecord | null {
    if (!pauseMatchId) {
      setError('Выберите приостановленный матч.');
      return null;
    }
    if (!pauseNote.trim()) {
      setError('Добавьте решение директора для аудита.');
      return null;
    }
    if (pauseDecision === 'transfer' && (!pauseDisruptionId || !pauseTargetCourtId)) {
      setError('Для переноса нужны disruption и другой физический корт.');
      return null;
    }
    if (pauseDecision === 'defer' && pauseDeferMode === 'not_before' && !pauseResumeNotBefore) {
      setError('Для откладывания укажите время «не раньше» или выберите конец очереди.');
      return null;
    }
    try {
      return {
        decision: pauseDecision,
        ...(pauseDisruptionId ? { disruptionId: pauseDisruptionId } : {}),
        ...(pauseDecision === 'transfer' ? { targetCourtId: pauseTargetCourtId } : {}),
        ...(pauseDecision === 'defer' ? { deferMode: pauseDeferMode } : {}),
        ...(pauseResumeNotBefore && (pauseDecision !== 'defer' || pauseDeferMode === 'not_before')
          ? { [pauseDecision === 'defer' ? 'notBefore' : 'resumeNotBefore']: toIso(pauseResumeNotBefore, 'время решения паузы') }
          : {}),
      };
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Неверное время решения паузы.');
      return null;
    }
  }

  async function previewPauseResolution() {
    const payload = pauseResolutionPayload();
    if (!payload) return;
    const result = await runCommand(
      'Решение по паузе проверено',
      `/matches/${encodeURIComponent(pauseMatchId)}/pause-resolution/preview`,
      {
        ...commandMeta(pauseResolutionReasonCode(pauseDecision), pauseNote),
        ...payload,
      },
    );
    if (result) {
      setPauseResolutionPreview(result);
      setPauseResolutionReceipt(null);
    }
  }

  async function commitPauseResolution() {
    if (!pauseMatchId || !pauseResolutionPreview?.previewId || !pauseResolutionPreview.inputHash) {
      setError('Сначала рассчитайте актуальный preview решения по паузе.');
      return;
    }
    const result = await runCommand(
      'Решение по паузе зафиксировано',
      `/matches/${encodeURIComponent(pauseMatchId)}/pause-resolution/commit`,
      {
        ...commandMeta(pauseResolutionReasonCode(pauseDecision), pauseNote),
        previewId: pauseResolutionPreview.previewId,
        inputHash: pauseResolutionPreview.inputHash,
      },
    );
    if (result) {
      setPauseResolutionReceipt(result);
      setPauseResolutionPreview(null);
    }
  }

  function openIncompleteIncidentForPausedMatch() {
    if (!pauseMatchId) {
      setError('Выберите приостановленный матч.');
      return;
    }
    setMatchId(pauseMatchId);
    setIncidentKind('incomplete');
    setIncidentReason('injury_retirement');
    setIncidentNote(pauseNote);
    setIncidentPreview(null);
    setActiveTab('incidents');
    setNotice('Незавершённый матч оформляется как инцидент: выберите команду, введите фактический счёт и выполните impact preview.');
  }

  function paperImportSets(): Array<{ setNo: number; teamA: number; teamB: number }> | null {
    const sets = paperSetScores
      .filter((set) => set.a !== '' && set.b !== '')
      .map((set, index) => ({ setNo: index + 1, teamA: Number(set.a), teamB: Number(set.b) }));
    if (!sets.length || sets.some((set) => (
      !Number.isInteger(set.teamA) || !Number.isInteger(set.teamB) || set.teamA < 0 || set.teamB < 0
    ))) {
      setError('Введите корректный счёт хотя бы одной партии из бумажного протокола.');
      return null;
    }
    return sets;
  }

  async function previewPaperImport() {
    if (!paperMatchId) {
      setError('Выберите матч из бумажного протокола.');
      return;
    }
    if (!paperNote.trim()) {
      setError('Укажите, кто и почему переносит бумажный протокол.');
      return;
    }
    const sets = paperImportSets();
    if (!sets) return;
    try {
      const result = await runCommand(
        'Бумажный протокол проверен',
        `/matches/${encodeURIComponent(paperMatchId)}/paper-import/preview`,
        {
          ...commandMeta('paper_result_import', paperNote),
          resultMode: 'paper_import',
          resultKind: 'played',
          actualStartedAt: toIso(paperActualStartedAt, 'фактическое начало'),
          actualEndedAt: toIso(paperActualEndedAt, 'фактическое окончание'),
          actualScore: { sets },
          declaredResult: { sets },
          evidence: {
            source: 'paper_result_import',
            ...(paperEvidenceRef.trim() ? { protocolReference: paperEvidenceRef.trim() } : {}),
          },
        },
      );
      if (result) {
        setPaperImportPreview(result);
        setPaperImportReceipt(null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось проверить бумажный протокол.');
    }
  }

  async function commitPaperImport() {
    if (!paperMatchId || !paperImportPreview?.previewId || !paperImportPreview.inputHash) {
      setError('Сначала рассчитайте актуальный preview бумажного протокола.');
      return;
    }
    const result = await runCommand(
      'Бумажный протокол импортирован',
      `/matches/${encodeURIComponent(paperMatchId)}/paper-import/commit`,
      {
        ...commandMeta('paper_result_import', paperNote),
        previewId: paperImportPreview.previewId,
        inputHash: paperImportPreview.inputHash,
      },
    );
    if (result) {
      setPaperImportReceipt(result);
      setPaperImportPreview(null);
    }
  }

  async function issueCourtGrant(rotatedGrant?: ApiRecord) {
    const resolvedCourtId = rotatedGrant ? String(rotatedGrant.courtId ?? '') : grantCourtId;
    const targetDeviceId = grantDeviceId.trim() || String(rotatedGrant?.deviceId ?? '');
    if (!resolvedCourtId || !targetDeviceId) {
      setError('Выберите корт и вставьте код судейского устройства.');
      return;
    }
    const ttlMinutes = Number(grantTtlMinutes);
    if (!Number.isSafeInteger(ttlMinutes) || ttlMinutes < 15 || ttlMinutes > 1440) {
      setError('TTL токена должен быть от 15 до 1440 минут.');
      return;
    }
    const grantId = rotatedGrant ? String(rotatedGrant.grantId ?? rotatedGrant.id ?? '') : '';
    const path = grantId
      ? `/courts/${encodeURIComponent(resolvedCourtId)}/grants/${encodeURIComponent(grantId)}/rotate`
      : `/courts/${encodeURIComponent(resolvedCourtId)}/grants`;
    const result = await runCommand(grantId ? 'Токен корта заменён' : 'Судейское устройство назначено', path, {
      ...commandMeta(
        grantId ? 'court_grant_rotated' : 'court_grant_issued',
        grantId ? 'Плановая ротация токена судейского устройства' : undefined,
      ),
      payload: { targetDeviceId, ttlMinutes },
    });
    if (result) setIssuedGrant(asRecord(result.result));
  }

  async function revokeCourtGrant(grant: ApiRecord) {
    const courtId = String(grant.courtId ?? '');
    const grantId = String(grant.grantId ?? grant.id ?? '');
    if (!courtId || !grantId) return;
    const result = await runCommand('Доступ судейского устройства отозван', `/courts/${encodeURIComponent(courtId)}/grants/${encodeURIComponent(grantId)}/revoke`, {
      ...commandMeta('court_grant_revoked', 'Доступ отозван директором турнира'),
      payload: {},
    });
    if (result && String(issuedGrant?.grantId ?? '') === grantId) setIssuedGrant(null);
  }

  async function approveRedOperation() {
    if (!approvalPreviewId.trim()) {
      setError('Вставьте Preview ID красной операции, созданной другим администратором.');
      return;
    }
    if (!approvalReview || String(approvalReview.previewId ?? approvalReview.id ?? '') !== approvalPreviewId.trim()) {
      setError('Сначала загрузите и проверьте актуальный impact preview.');
      return;
    }
    if (!confirmApprovalReview) {
      setError('Подтвердите, что просмотрели последствия красной операции.');
      return;
    }
    const reviewedInputHash = String(approvalReview.inputHash ?? '');
    const reviewedAggregateVersion = Number(approvalReview.aggregateVersion);
    if (!/^[0-9a-f]{64}$/.test(reviewedInputHash) || !Number.isSafeInteger(reviewedAggregateVersion)) {
      setError('Impact preview не содержит проверяемый input hash и версию. Обновите preview.');
      return;
    }
    const result = await runCommand('Красная операция согласована вторым администратором', `/approvals/${encodeURIComponent(approvalPreviewId.trim())}`, {
      ...commandMeta('red_operation_approved', 'Проверен impact preview и downstream-последствия'),
      payload: { reviewedInputHash, reviewedAggregateVersion },
    });
    if (result) {
      setApprovalResult(result);
      const approvalId = String(result.approvalId ?? asRecord(result.result).approvalId ?? '');
      if (approvalId) setRedApprovalId(approvalId);
      setConfirmApprovalReview(false);
    }
  }

  async function reviewRedOperation() {
    const previewId = approvalPreviewId.trim();
    if (!previewId) {
      setError('Вставьте Preview ID красной операции, созданной другим администратором.');
      return;
    }
    setPendingAction('Загрузка impact preview');
    setError('');
    setErrorDetails(null);
    setApprovalReview(null);
    setConfirmApprovalReview(false);
    try {
      const response = await fetch(`${baseUrl}/approvals/${encodeURIComponent(previewId)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({})) as ApiRecord & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Не удалось загрузить impact preview');
      if (String(result.previewId ?? result.id ?? '') !== previewId || String(result.risk ?? '') !== 'red') {
        throw new Error('Сервер вернул другой или не красный preview; согласование остановлено.');
      }
      setApprovalReview(result);
      setNotice('Impact preview загружен. Проверьте diff и подтвердите ознакомление.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить impact preview');
    } finally {
      setPendingAction('');
    }
  }

  function issuedJudgeUrl(): string {
    const token = String(issuedGrant?.token ?? '');
    const targetDeviceId = String(issuedGrant?.deviceId ?? '');
    if (!token || !targetDeviceId || typeof window === 'undefined') return '';
    return `${window.location.origin}/judge/go-v2/${encodeURIComponent(tournamentId)}#device=${encodeURIComponent(targetDeviceId)}&token=${encodeURIComponent(token)}`;
  }

  const formatPayload = useMemo(
    () => ({
      formatConfig: {
        engineVersion: 2,
        schemaVersion: 2,
        templateVersion: 1,
        templateId: config.templateId,
        formatMode: config.formatMode,
        teamCount: config.teamCount,
        maxTeams: 48,
        poolMode: config.poolMode,
        groupSizes,
        matchRules: {
          groups: config.groupMatchRule,
          playoffs: config.playoffMatchRule,
        },
        tierMode: config.tierMode,
        hardCap: 16,
        ...(config.tierMode === 'manual' ? { tierQuotas: config.tierQuotas } : {}),
        playoffFormat: config.playoffFormat,
        bronzeEnabled: config.playoffFormat === 'single_elimination' && config.bronzeEnabled,
        resetFinalEnabled: config.playoffFormat === 'double_elimination' && config.resetFinalEnabled,
        minimumGamesTarget: standaloneBracket
          ? (config.playoffFormat === 'classification'
              ? 3
              : config.playoffFormat === 'double_elimination' ? 2 : 1)
          : config.poolMode === 'modified_pool_4' && config.playoffFormat === 'single_elimination'
            ? 3
            : config.playoffFormat === 'double_elimination' ? 4 : 3,
      },
      scheduleConfig: {
        courtCount: courts.length,
        courts: courts.map((court) => ({
          id: `court-${court.courtNo}`,
          courtNo: court.courtNo,
          label: court.label.trim(),
          availability: court.availability.map((window) => ({ ...window })),
        })),
        startTime: config.startTime,
        endTime: config.endTime,
        timezone: config.timezone,
        refereeMode: config.refereeMode,
        quantumMinutes: 5,
      },
    }),
    [config, courts, groupSizes, standaloneBracket],
  );

  async function previewDraw() {
    if (standaloneBracket) {
      setActiveTab('bracket');
      await previewBracket();
      return;
    }
    const result = await runCommand('Предпросмотр жеребьёвки готов', '/draw/preview', {
      ...commandMeta('draw_generated'),
      ...formatPayload,
      poolFormat: config.poolMode,
      matchRule: config.groupMatchRule,
      comparisonPolicy: 'equal_two_matches',
      manualSwaps,
      swaps: manualSwaps,
    });
    if (result) {
      setDrawPreview(result);
      setActiveTab('draw');
    }
  }

  function addManualSwap() {
    queueManualSwap(swapEntryA, swapEntryB);
  }

  async function lockRegistration() {
    const existingEntries = Array.isArray(structure?.entries) ? structure.entries.map((value, index) => {
      const entry = asRecord(value);
      return {
        entryId: entry.id ?? entry.entryId,
        entryNo: Number(entry.entryNo ?? index + 1),
        displayName: String(entry.displayName ?? entry.name ?? `Команда ${index + 1}`),
        confirmedAt: entry.confirmedAt,
        ratingSnapshotValue: Number(entry.ratingSnapshotValue ?? entry.ratingValue ?? 0),
        initialSeed: Number(entry.initialSeed ?? index + 1),
        members: Array.isArray(entry.members) ? entry.members : [],
      };
    }) : [];
    await runCommand('Регистрация V2 зафиксирована', '/registration/lock', {
      ...commandMeta('registration_lock'),
      ...(existingEntries.length ? { entries: existingEntries } : {}),
      ratingSnapshot: {
        schemaVersion: 1,
        sourceKind: 'pair_rating_sum',
      },
      policySnapshot: {
        maxTeams: 48,
        withdrawalStandingsPolicy: 'LPV_PRESERVE_PLAYED_FORFEIT_FUTURE',
      },
      formatMode: config.formatMode,
      formatTemplateId: config.templateId,
    });
  }

  async function commitDraw() {
    if (!drawPreview?.previewId || !drawPreview.inputHash) {
      setError('Сначала сформируйте актуальный preview жеребьёвки.');
      return;
    }
    await runCommand('Жеребьёвка зафиксирована', '/draw/commit', {
      ...commandMeta(
        manualSwaps.length ? 'draw_adjusted' : 'draw_generated',
        manualSwaps.length ? `Ручные обмены слотов: ${manualSwaps.length}` : undefined,
      ),
      previewId: drawPreview.previewId,
      inputHash: drawPreview.inputHash,
    });
  }

  async function previewDrawUnlock() {
    const result = await runCommand('Предпросмотр разблокировки жеребьёвки готов', '/draw/unlock/preview', {
      ...commandMeta(
        'admin_override',
        drawUnlockReseed
          ? 'Разблокировка жеребьёвки до старта и пересчёт seed по актуальному рейтингу'
          : 'Разблокировка жеребьёвки до старта с сохранением текущего seed',
      ),
      reseed: drawUnlockReseed,
    });
    if (result) setDrawUnlockPreview(result);
  }

  async function commitDrawUnlock() {
    if (!drawUnlockPreview?.previewId || !drawUnlockPreview.inputHash) {
      setError('Сначала сформируйте актуальный preview разблокировки жеребьёвки.');
      return;
    }
    const result = await runCommand('Жеребьёвка разблокирована', '/draw/unlock/commit', {
      ...commandMeta(
        'admin_override',
        drawUnlockReseed
          ? 'Разблокировка жеребьёвки до старта и пересчёт seed по актуальному рейтингу'
          : 'Разблокировка жеребьёвки до старта с сохранением текущего seed',
      ),
      previewId: drawUnlockPreview.previewId,
      inputHash: drawUnlockPreview.inputHash,
    });
    if (result) {
      setDrawUnlockPreview(null);
      setDrawPreview(null);
      setBracketPreview(null);
      setSchedulePreview(null);
      setManualSwaps([]);
      setActiveTab('format');
    }
  }

  async function materializeStages() {
    if (standaloneBracket) {
      setActiveTab('bracket');
      setError('Standalone-сетка материализуется при Bracket lock; отдельные групповые стадии не нужны.');
      return;
    }
    if (!estimate) {
      setError('Исправьте конфигурацию формата.');
      return;
    }
    const playoffTiers = [
      { tier: 'hard', count: estimate.tiers.hard },
      { tier: 'medium', count: estimate.tiers.medium },
      { tier: 'light', count: estimate.tiers.light },
    ].filter((item) => item.count >= 2);
    const stages = [
      {
        stageKey: 'groups',
        stageOrder: 1,
        stageType: config.poolMode,
        matchRule: config.groupMatchRule,
        configuration: { groupSizes, comparisonPolicy: 'equal_two_matches' },
      },
      {
        stageKey: 'tier_split',
        stageOrder: 2,
        stageType: 'tier_split',
        matchRule: config.groupMatchRule,
        configuration: {
          tiers: estimate.tiers,
          hardCap: 16,
          ...(config.tierMode === 'manual' ? { tierQuotas: config.tierQuotas } : {}),
        },
      },
      ...playoffTiers.map((item, index) => ({
        stageKey: `${item.tier}_playoff`,
        stageOrder: index + 3,
        stageType: config.playoffFormat,
        tier: item.tier,
        matchRule: config.playoffMatchRule,
        configuration: {
          participantCount: item.count,
          bronzeEnabled: config.playoffFormat === 'single_elimination' && config.bronzeEnabled,
          resetFinalEnabled: config.playoffFormat === 'double_elimination' && config.resetFinalEnabled,
          routingTemplateVersion: config.playoffFormat === 'double_elimination' ? 'lpv_de_crossover_v1' : null,
        },
      })),
    ];
    await runCommand('Стадии материализованы', '/stages/materialize', {
      ...commandMeta('stage_materialized'),
      snapshot: {
        schemaVersion: 1,
        seedSnapshot: drawPreview?.result ?? drawPreview ?? {},
        rankingRulesSnapshot: {
          profile: 'LPV_V2',
          crossPool: ['pool_place', 'match_points_per_match', 'set_ratio', 'rally_ratio', 'initial_seed'],
          ratioMode: 'exact_bigint',
        },
        formatSnapshot: formatPayload.formatConfig,
        policySnapshot: {
          withdrawalStandingsPolicy: 'LPV_PRESERVE_PLAYED_FORFEIT_FUTURE',
          noMixedPoolTopologies: true,
        },
      },
      stages,
      edges: [
        { fromStageKey: 'groups', toStageKey: 'tier_split', routingKind: 'pool_rank' },
        ...playoffTiers.map((item) => ({
          fromStageKey: 'tier_split',
          toStageKey: `${item.tier}_playoff`,
          routingKind: 'tier_split',
          routingConfig: { tier: item.tier },
        })),
      ],
    });
  }

  async function previewBracket() {
    const result = await runCommand('Предпросмотр сеток готов', '/bracket/preview', {
      ...commandMeta('bracket_generated'),
      formatConfig: formatPayload.formatConfig,
      playoffFormat: config.playoffFormat,
      bracketType: config.playoffFormat,
      tierMode: config.tierMode,
      ...(config.tierMode === 'manual' ? { tierQuotas: config.tierQuotas } : {}),
      matchRule: config.playoffMatchRule,
      bronzeEnabled: config.bronzeEnabled,
      bronzeMatch: config.bronzeEnabled,
      resetFinalEnabled: config.resetFinalEnabled,
      resetFinal: config.resetFinalEnabled,
    });
    if (result) setBracketPreview(result);
  }

  async function lockBracket() {
    if (!bracketPreview?.previewId || !bracketPreview.inputHash) {
      setError('Сначала сформируйте актуальный preview сетки.');
      return;
    }
    await runCommand('Сетки зафиксированы', '/bracket/lock', {
      ...commandMeta('bracket_locked'),
      previewId: bracketPreview.previewId,
      inputHash: bracketPreview.inputHash,
    });
  }

  async function sharedScheduleFields(): Promise<Record<string, unknown>> {
    const requested = linkedTournamentIdsInput
      .split(/[\s,;]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    if (requested.some((value) => !uuid.test(value))) {
      throw new Error('Связанные турниры указываются UUID через запятую.');
    }
    const tournamentIds = [...new Set([tournamentId.toLowerCase(), ...requested])].sort();
    if (tournamentIds.length === 1) return {};
    const versions: Record<string, number> = { [tournamentId.toLowerCase()]: aggregateVersion };
    await Promise.all(tournamentIds.filter((id) => id !== tournamentId.toLowerCase()).map(async (id) => {
      const response = await fetch(`/api/admin/go-v2/tournaments/${encodeURIComponent(id)}/structure`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(asRecord(payload).error ?? `Не удалось загрузить связанный турнир ${id}`));
      }
      versions[id] = Number(asRecord(asRecord(payload).tournament).aggregateVersion ?? 0);
    }));
    return {
      sessionTournamentIds: tournamentIds,
      sessionTournamentVersions: versions,
      sessionKey: `go-v2-shared-${tournamentIds.join('-')}`,
      sessionLabel: `Общая сессия · ${tournamentIds.length} турнира`,
    };
  }

  async function generateSchedule() {
    if (courtConfigurationIssue) {
      setError(courtConfigurationIssue);
      return;
    }
    try {
      const shared = await sharedScheduleFields();
      const result = await runCommand('Предпросмотр расписания рассчитан', '/schedule/generate', {
        ...commandMeta('schedule_generated'),
        ...formatPayload.scheduleConfig,
        ...shared,
        liveEtaOverrides,
        operationBudget: {
          beamWidth: 64,
          topK: 24,
          maxExpandedStates: 250000,
          repairPasses: 8,
        },
      });
      if (result) setSchedulePreview(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось подготовить общую сессию');
    }
  }

  async function commitGeneratedSchedule() {
    if (
      !schedulePreview?.previewId
      || !schedulePreview.inputHash
      || String(schedulePreview.operation ?? '') !== 'schedule.generate.preview'
    ) {
      setError('Сначала сформируйте актуальный preview первого расписания.');
      return;
    }
    const result = await runCommand('Первая версия расписания опубликована', '/schedule/commit', {
      ...commandMeta('schedule_generated', 'Публикация проверенного preview расписания'),
      previewId: schedulePreview.previewId,
      inputHash: schedulePreview.inputHash,
    });
    if (result) setSchedulePreview(null);
  }

  async function previewScheduleReplan() {
    if (courtConfigurationIssue) {
      setError(courtConfigurationIssue);
      return;
    }
    try {
      const shared = await sharedScheduleFields();
      const result = await runCommand('Live-replan preview рассчитан', '/schedule/replan/preview', {
        ...commandMeta('schedule_replanned', 'Live-replan с горизонтом заморозки 60 минут'),
        ...formatPayload.scheduleConfig,
        ...shared,
        liveEtaOverrides,
        freezeHorizonMinutes: 60,
        preservePublishedAssignments: true,
      });
      if (result) setSchedulePreview(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось подготовить общую сессию');
    }
  }

  async function commitScheduleReplan() {
    if (
      !schedulePreview?.previewId
      || !schedulePreview.inputHash
      || String(schedulePreview.operation ?? '') !== 'schedule.replan.preview'
    ) {
      setError('Сначала рассчитайте replan preview.');
      return;
    }
    const result = await runCommand('Новая версия расписания опубликована', '/schedule/replan/commit', {
      ...commandMeta('schedule_replanned', 'Подтверждение live-replan администратором'),
      previewId: schedulePreview.previewId,
      inputHash: schedulePreview.inputHash,
    });
    if (result) setSchedulePreview(result);
  }

  async function previewIncident() {
    if (!matchId.trim()) {
      setError('Укажите match ID для impact preview.');
      return;
    }
    if (!incidentNote.trim()) {
      setError('Добавьте комментарий к причине инцидента.');
      return;
    }
    if (['walkover', 'forfeit', 'incomplete'].includes(incidentKind) && !incidentEntryId.trim()) {
      setError('Укажите Entry UUID команды, к которой относится неявка, отказ или травма.');
      return;
    }
    const incompleteSets = setScores
      .filter((set) => set.a !== '' && set.b !== '')
      .map((set, index) => ({ setNo: index + 1, teamA: Number(set.a), teamB: Number(set.b) }));
    if (
      incidentKind === 'incomplete'
      && (!incompleteSets.length || incompleteSets.some((set) => (
        !Number.isInteger(set.teamA) || !Number.isInteger(set.teamB) || set.teamA < 0 || set.teamB < 0
      )))
    ) {
      setError('Для травмы укажите фактически сыгранный счёт, включая незавершённую последнюю партию.');
      return;
    }
    const result = await runCommand('Impact preview рассчитан', '/incidents/preview', {
      ...commandMeta(incidentReason, incidentNote),
      triggerMatchId: matchId.trim(),
      matchId: matchId.trim(),
      ...(incidentEntryId.trim() ? {
        entryId: incidentEntryId.trim(),
        absentEntryId: incidentEntryId.trim(),
        retiredEntryId: incidentEntryId.trim(),
      } : {}),
      resultKind: incidentKind,
      cause: incidentReason,
      standingContributionProfile: technicalStandingProfile,
      ...(incidentKind === 'incomplete' ? { actualScore: { sets: incompleteSets } } : {}),
    });
    if (result) {
      setIncidentPreview(result);
      setConfirmRedIncident(false);
      if (result.risk === 'red' && result.previewId) setApprovalPreviewId(result.previewId);
    }
  }

  async function commitIncident() {
    if (!incidentPreview?.previewId || !incidentPreview.inputHash) {
      setError('Сначала рассчитайте impact preview.');
      return;
    }
    if (incidentResolution === 'cascade_void_and_replay' && !incidentQualificationModel.cascadeAvailable) {
      setError('Автоматическая пересборка квалификации и расписания недоступна для этого изменения. Выберите привилегированное сохранение текущей ветки.');
      return;
    }
    if (incidentPreview.risk === 'red' && (!confirmRedIncident || !redApprovalId.trim())) {
      setError('Красный каскад требует подтверждения автора и approval ID второго администратора.');
      return;
    }
    await runCommand('Инцидент применён и записан в аудит', '/incidents/commit', {
      ...commandMeta(incidentReason, incidentNote),
      previewId: incidentPreview.previewId,
      inputHash: incidentPreview.inputHash,
      resolution: incidentResolution,
      confirmRed: incidentPreview.risk === 'red' ? confirmRedIncident : undefined,
      redApprovalId: incidentPreview.risk === 'red' ? redApprovalId.trim() : undefined,
    });
  }

  async function previewRosterReplacement() {
    if (!replacementEntryId || (!replacementPlayerId.trim() && !replacementPlayerName.trim())) {
      setError('Выберите команду и укажите нового игрока.');
      return;
    }
    if (!replacementNote.trim()) {
      setError('Для замены игрока обязательна причина.');
      return;
    }
    const ratingValue = Number(replacementRating);
    if (!Number.isSafeInteger(ratingValue)) {
      setError('Рейтинг нового игрока должен быть целым числом.');
      return;
    }
    const result = await runCommand(
      'Предпросмотр замены рассчитан',
      `/entries/${encodeURIComponent(replacementEntryId)}/replacement/preview`,
      {
        ...commandMeta('late_roster_swap', replacementNote),
        replaceMemberOrder,
        replacementMember: {
          ...(replacementPlayerId.trim() ? { playerId: replacementPlayerId.trim() } : {}),
          ...(replacementPlayerName.trim() ? { displayName: replacementPlayerName.trim() } : {}),
          ratingValue,
        },
        replacementPolicy,
      },
    );
    if (result) setReplacementPreview(result);
  }

  async function commitRosterReplacement() {
    if (!replacementEntryId || !replacementPreview?.previewId || !replacementPreview.inputHash) {
      setError('Сначала рассчитайте актуальный preview замены.');
      return;
    }
    const result = await runCommand(
      'Новая ревизия состава сохранена',
      `/entries/${encodeURIComponent(replacementEntryId)}/replacement/commit`,
      {
        ...commandMeta('late_roster_swap', replacementNote),
        previewId: replacementPreview.previewId,
        inputHash: replacementPreview.inputHash,
      },
    );
    if (result) setReplacementPreview(null);
  }

  async function previewEntryWithdrawal() {
    if (!withdrawalEntryId || !withdrawalNote.trim()) {
      setError('Выберите команду и укажите причину снятия.');
      return;
    }
    const result = await runCommand(
      'Предпросмотр снятия рассчитан',
      `/entries/${encodeURIComponent(withdrawalEntryId)}/withdrawal/preview`,
      {
        ...commandMeta(withdrawalReasonCode(withdrawalCause), withdrawalNote),
        withdrawalStandingsPolicy: withdrawalPolicy,
        withdrawalCause,
      },
    );
    if (result) {
      setWithdrawalPreview(result);
      setConfirmRedWithdrawal(false);
      if (result.risk === 'red' && result.previewId) setApprovalPreviewId(result.previewId);
    }
  }

  async function commitEntryWithdrawal() {
    if (!withdrawalEntryId || !withdrawalPreview?.previewId || !withdrawalPreview.inputHash) {
      setError('Сначала рассчитайте актуальный preview снятия.');
      return;
    }
    if (withdrawalPreview.risk === 'red' && (!confirmRedWithdrawal || !redApprovalId.trim())) {
      setError('Перезапись сыгранных результатов требует подтверждения автора и approval ID второго администратора.');
      return;
    }
    const result = await runCommand(
      'Команда снята, будущие матчи обработаны по политике',
      `/entries/${encodeURIComponent(withdrawalEntryId)}/withdrawal/commit`,
      {
        ...commandMeta(withdrawalReasonCode(withdrawalCause), withdrawalNote),
        previewId: withdrawalPreview.previewId,
        inputHash: withdrawalPreview.inputHash,
        confirmRed: withdrawalPreview.risk === 'red' ? confirmRedWithdrawal : undefined,
        redApprovalId: withdrawalPreview.risk === 'red' ? redApprovalId.trim() : undefined,
      },
    );
    if (result) setWithdrawalPreview(null);
  }

  async function previewReservePromotion() {
    if (!reserveEntryId) {
      setError('Выберите резервную команду.');
      return;
    }
    if (reserveNeedsTarget && !reserveTargetEntryId) {
      setError('После жеребьёвки выберите точный освободившийся слот.');
      return;
    }
    if (!reservePromotionNote.trim()) {
      setError('Укажите основание поднятия резерва.');
      return;
    }
    const result = await runCommand(
      'Preview поднятия резерва и точного расписания рассчитан',
      `/reserves/${encodeURIComponent(reserveEntryId)}/promote/preview`,
      {
        ...commandMeta('reserve_promoted', reservePromotionNote),
        ...(reserveNeedsTarget ? { targetEntryId: reserveTargetEntryId } : {}),
      },
    );
    if (result) {
      setReservePromotionPreview(result);
      if (result.risk === 'red' && result.previewId) setApprovalPreviewId(result.previewId);
    }
  }

  async function commitReservePromotion() {
    if (!reserveEntryId || !reservePromotionPreview?.previewId || !reservePromotionPreview.inputHash) {
      setError('Сначала рассчитайте актуальный preview поднятия резерва.');
      return;
    }
    if (reservePromotionPreview.risk === 'red' && !redApprovalId.trim()) {
      setError('Замена в опубликованном расписании требует approval ID второго администратора.');
      return;
    }
    const result = await runCommand(
      'Резерв поднят; слот и successor schedule зафиксированы',
      `/reserves/${encodeURIComponent(reserveEntryId)}/promote/commit`,
      {
        ...commandMeta('reserve_promoted', reservePromotionNote),
        previewId: reservePromotionPreview.previewId,
        inputHash: reservePromotionPreview.inputHash,
        confirmRed: reservePromotionPreview.risk === 'red' ? true : undefined,
        redApprovalId: reservePromotionPreview.risk === 'red' ? redApprovalId.trim() : undefined,
      },
    );
    if (result) {
      setReservePromotionPreview(null);
      setReserveEntryId('');
      setReserveTargetEntryId('');
    }
  }

  async function previewAttendanceReinstatement() {
    if (!reinstatementEntryId) {
      setError('Выберите команду, вернувшуюся после неявки.');
      return;
    }
    if (!reinstatementNote.trim()) {
      setError('Укажите решение директора по возврату команды.');
      return;
    }
    const result = await runCommand(
      'Preview возврата команды и successor schedule рассчитан',
      '/attendance/reinstate/preview',
      {
        ...commandMeta('attendance_reinstated', reinstatementNote),
        entryId: reinstatementEntryId,
        decision: reinstatementDecision,
        toState: reinstatementTargetState,
      },
    );
    if (result) {
      setReinstatementPreview(result);
      if (result.risk === 'red' && result.previewId) setApprovalPreviewId(result.previewId);
    }
  }

  async function commitAttendanceReinstatement() {
    if (!reinstatementPreview?.previewId || !reinstatementPreview.inputHash) {
      setError('Сначала рассчитайте актуальный preview возврата команды.');
      return;
    }
    if (reinstatementPreview.risk === 'red' && !redApprovalId.trim()) {
      setError('Отмена технического результата требует approval ID второго администратора.');
      return;
    }
    const result = await runCommand(
      reinstatementDecision === 'overturn_and_cascade'
        ? 'Технический результат компенсирован; матчи возвращены в очередь'
        : 'Команда возвращена; ранее присуждённые результаты сохранены',
      '/attendance/reinstate/commit',
      {
        ...commandMeta('attendance_reinstated', reinstatementNote),
        previewId: reinstatementPreview.previewId,
        inputHash: reinstatementPreview.inputHash,
        confirmRed: reinstatementPreview.risk === 'red' ? true : undefined,
        redApprovalId: reinstatementPreview.risk === 'red' ? redApprovalId.trim() : undefined,
      },
    );
    if (result) {
      setReinstatementPreview(null);
      setReinstatementEntryId('');
    }
  }

  async function previewUndo() {
    if (!mutationBatchId.trim()) {
      setError('Укажите mutation batch ID.');
      return;
    }
    const result = await runCommand('Undo impact preview рассчитан', `/mutations/${encodeURIComponent(mutationBatchId.trim())}/undo/preview`, {
      ...commandMeta('undo_mutation', `Предпросмотр отмены mutation batch ${mutationBatchId.trim()}`),
    });
    if (result) {
      setUndoPreview(result);
      if (result.risk === 'red' && result.previewId) setApprovalPreviewId(result.previewId);
    }
  }

  async function commitUndo() {
    if (!mutationBatchId.trim() || !undoPreview?.previewId || !undoPreview.inputHash) {
      setError('Сначала рассчитайте undo preview.');
      return;
    }
    if (undoPreview.risk === 'red' && !redApprovalId.trim()) {
      setError('Красный undo требует approval ID второго администратора.');
      return;
    }
    await runCommand('Компенсирующая mutation применена', `/mutations/${encodeURIComponent(mutationBatchId.trim())}/undo/commit`, {
      ...commandMeta('undo_mutation', `Компенсирующая отмена mutation batch ${mutationBatchId.trim()}`),
      previewId: undoPreview.previewId,
      inputHash: undoPreview.inputHash,
      confirmRed: undoPreview.risk === 'red' ? true : undefined,
      redApprovalId: undoPreview.risk === 'red' ? redApprovalId.trim() : undefined,
    });
  }

  async function previewStageRuleChange() {
    if (!stageRuleStageId) {
      setError('Выберите стадию для изменения правил.');
      return;
    }
    const effectiveFromRoundNo = Number(stageRuleEffectiveRound);
    if (!Number.isSafeInteger(effectiveFromRoundNo) || effectiveFromRoundNo < 1) {
      setError('Укажите корректный номер полного будущего раунда.');
      return;
    }
    if (!stageRuleNote.trim()) {
      setError('Укажите причину изменения правил стадии.');
      return;
    }
    const result = await runCommand('Preview новых правил и successor schedule рассчитан', `/stages/${encodeURIComponent(stageRuleStageId)}/rules/preview`, {
      ...commandMeta('stage_rule_changed', stageRuleNote),
      effectiveFromRoundNo,
      matchRule: stageRulePreset,
    });
    if (result) {
      setStageRulePreview(result);
      if (result.risk === 'red' && result.previewId) setApprovalPreviewId(result.previewId);
    }
  }

  async function commitStageRuleChange() {
    if (!stageRuleStageId || !stageRulePreview?.previewId || !stageRulePreview.inputHash) {
      setError('Сначала рассчитайте актуальный preview изменения правил.');
      return;
    }
    if (stageRulePreview.risk === 'red' && !redApprovalId.trim()) {
      setError('Изменение frozen/locked раунда требует approval ID второго администратора.');
      return;
    }
    const result = await runCommand('Новые правила и точное расписание опубликованы', `/stages/${encodeURIComponent(stageRuleStageId)}/rules/commit`, {
      ...commandMeta('stage_rule_changed', stageRuleNote),
      previewId: stageRulePreview.previewId,
      inputHash: stageRulePreview.inputHash,
      confirmRed: stageRulePreview.risk === 'red' ? true : undefined,
      redApprovalId: stageRulePreview.risk === 'red' ? redApprovalId.trim() : undefined,
    });
    if (result) setStageRulePreview(null);
  }

  async function previewScheduleDefer() {
    if (!scheduleDeferMatchId) {
      setError('Выберите pending/ready матч, который нужно отложить.');
      return;
    }
    if (!scheduleDeferNote.trim()) {
      setError('Укажите причину defer.');
      return;
    }
    let notBefore: string | null = null;
    if (scheduleDeferMode === 'not_before') {
      try {
        notBefore = toIso(scheduleDeferNotBefore, 'не раньше');
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Проверьте время defer.');
        return;
      }
    }
    const result = await runCommand('Preview defer рассчитан для всей общей сессии', '/schedule/defer/preview', {
      ...commandMeta('schedule_deferred', scheduleDeferNote),
      matchId: scheduleDeferMatchId,
      deferMode: scheduleDeferMode,
      ...(notBefore ? { notBefore } : {}),
    });
    if (result) setScheduleDeferPreview(result);
  }

  async function commitScheduleDefer() {
    if (!scheduleDeferPreview?.previewId || !scheduleDeferPreview.inputHash) {
      setError('Сначала рассчитайте актуальный defer preview.');
      return;
    }
    const result = await runCommand('Матч отложен; successor schedule опубликован', '/schedule/defer/commit', {
      ...commandMeta('schedule_deferred', scheduleDeferNote),
      previewId: scheduleDeferPreview.previewId,
      inputHash: scheduleDeferPreview.inputHash,
    });
    if (result) setScheduleDeferPreview(null);
  }

  async function previewScheduleDeferRelease(matchId = scheduleDeferReleaseMatchId) {
    if (!matchId) {
      setError('Выберите активный defer для снятия.');
      return;
    }
    if (!scheduleDeferReleaseNote.trim()) {
      setError('Укажите причину снятия defer.');
      return;
    }
    setScheduleDeferReleaseMatchId(matchId);
    const result = await runCommand('Preview возврата матча в расписание рассчитан', '/schedule/defer/release/preview', {
      ...commandMeta('schedule_defer_released', scheduleDeferReleaseNote),
      matchId,
    });
    if (result) setScheduleDeferReleasePreview(result);
  }

  async function commitScheduleDeferRelease() {
    if (!scheduleDeferReleasePreview?.previewId || !scheduleDeferReleasePreview.inputHash) {
      setError('Сначала рассчитайте актуальный preview снятия defer.');
      return;
    }
    const result = await runCommand('Defer снят; компенсирующая schedule version опубликована', '/schedule/defer/release/commit', {
      ...commandMeta('schedule_defer_released', scheduleDeferReleaseNote),
      previewId: scheduleDeferReleasePreview.previewId,
      inputHash: scheduleDeferReleasePreview.inputHash,
    });
    if (result) {
      setScheduleDeferReleasePreview(null);
      setScheduleDeferReleaseMatchId('');
    }
  }

  async function previewCourtPolicyException() {
    if (!courtPolicyAllowedCourtIds.length) {
      setError('Выберите хотя бы один временно разрешённый корт.');
      return;
    }
    if (!courtPolicyNote.trim()) {
      setError('Укажите причину временного отклонения от закрепления кортов.');
      return;
    }
    let effectiveFrom: string;
    let effectiveUntil: string;
    try {
      effectiveFrom = toIso(courtPolicyEffectiveFrom, 'начало исключения');
      effectiveUntil = toIso(courtPolicyEffectiveUntil, 'окончание исключения');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Проверьте период исключения.');
      return;
    }
    if (Date.parse(effectiveUntil) <= Date.parse(effectiveFrom)) {
      setError('Окончание исключения должно быть позже начала.');
      return;
    }
    const result = await runCommand('Preview временного исключения по кортам рассчитан', '/schedule/policy/preview', {
      ...commandMeta('court_policy_exception', courtPolicyNote),
      tier: courtPolicyTier,
      stageId: courtPolicyStageId || null,
      allowedCourtIds: [...courtPolicyAllowedCourtIds].sort(),
      effectiveFrom,
      effectiveUntil,
    });
    if (result) setCourtPolicyPreview(result);
  }

  async function commitCourtPolicyException() {
    if (!courtPolicyPreview?.previewId || !courtPolicyPreview.inputHash) {
      setError('Сначала рассчитайте актуальный preview исключения по кортам.');
      return;
    }
    const result = await runCommand('Временное исключение и точная successor-версия расписания опубликованы', '/schedule/policy/commit', {
      ...commandMeta('court_policy_exception', courtPolicyNote),
      previewId: courtPolicyPreview.previewId,
      inputHash: courtPolicyPreview.inputHash,
    });
    if (result) setCourtPolicyPreview(null);
  }

  async function previewPublication() {
    if (!publicationNote.trim()) {
      setError('Укажите основание публикации или снятия с публикации.');
      return;
    }
    const result = await runCommand(
      publicationTarget === 'published'
        ? 'Impact preview публичной публикации рассчитан'
        : 'Impact preview снятия с публикации рассчитан',
      '/publication/preview',
      {
        ...commandMeta('publication_state_changed', publicationNote),
        toState: publicationTarget,
      },
    );
    if (result) {
      setPublicationPreview(result);
      setPublicationReceipt(null);
      if (result.risk === 'red' && result.previewId) setApprovalPreviewId(result.previewId);
    }
  }

  async function commitPublication() {
    if (!publicationPreview?.previewId || !publicationPreview.inputHash) {
      setError('Сначала рассчитайте актуальный preview публикации.');
      return;
    }
    if (publicationPreview.risk === 'red' && !redApprovalId.trim()) {
      setError('Публичное раскрытие команд и расписания требует approval ID второго администратора.');
      return;
    }
    const result = await runCommand(
      publicationTarget === 'published' ? 'V2 опубликован на сайте' : 'Публичный V2 закрыт',
      '/publication/commit',
      {
        ...commandMeta('publication_state_changed', publicationNote),
        toState: publicationTarget,
        previewId: publicationPreview.previewId,
        inputHash: publicationPreview.inputHash,
        confirmRed: publicationPreview.risk === 'red' ? true : undefined,
        redApprovalId: publicationPreview.risk === 'red' ? redApprovalId.trim() : undefined,
      },
    );
    if (result) {
      setPublicationReceipt(result);
      setPublicationPreview(null);
    }
  }

  const lifecycle = currentLifecycle;
  const entriesCount = Array.isArray(structure?.entries) ? structure.entries.length : config.teamCount;
  const pendingRedPreview = [
    incidentPreview,
    withdrawalPreview,
    attendancePreview,
    reinstatementPreview,
    reservePromotionPreview,
    disruptionPreview,
    undoPreview,
    publicationPreview,
    stageRulePreview,
  ]
    .find((preview) => preview?.risk === 'red') ?? null;

  return (
    <div className="go-v2-admin-workspace mx-auto flex w-full max-w-7xl flex-col gap-4 pb-24">
      <header className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.2),transparent_42%),rgba(15,17,25,0.96)] p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-orange-400/40 bg-orange-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-orange-100">
                Engine V2
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/70">
                {lifecycleLabel(lifecycle)}
              </span>
              <span className={cx(
                'rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                publicationState === 'published'
                  ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100'
                  : 'border-amber-300/25 bg-amber-500/10 text-amber-100',
              )}>
                {publicationState === 'published' ? 'Публично' : publicationState === 'unpublished' ? 'Снято с публикации' : 'Shadow'}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold text-white md:text-3xl">Группы, тиры и плей-офф</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
              Сначала preview, затем lock. Любое исправление результата проходит через impact preview и сохраняет историю.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadStructure()}
              className="min-h-11 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:border-orange-400/60"
            >
              Обновить
            </button>
            <Link
              href="/admin/tournaments"
              className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/80"
            >
              К турнирам
            </Link>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Команд', entriesCount],
            ['Групп', groupSizes?.length ?? '—'],
            ['Кортов', config.courtCount],
            ['Версия', aggregateVersion],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-white/45">{label}</p>
              <p className="mt-1 text-xl font-bold text-white">{value}</p>
            </div>
          ))}
        </div>
      </header>

      {error ? (
        <section role="alert" className="rounded-xl border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100">
          {error}
          {errorDetails && Object.keys(errorDetails).length ? (
            <div className="mt-3 rounded-lg border border-red-300/20 bg-black/20 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-red-100/70">Диагностика API / конфликты</p>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-red-50/85">{formatJson(errorDetails)}</pre>
            </div>
          ) : null}
        </section>
      ) : null}
      {notice ? (
        <section role="status" className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {notice}
        </section>
      ) : null}

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#10131d]/95 p-2" aria-label="Этапы Tournament Engine V2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cx(
              'min-h-10 shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
              activeTab === tab.id
                ? 'border-orange-400/70 bg-orange-500/20 text-orange-100'
                : 'border-transparent text-white/60 hover:border-white/15 hover:text-white',
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {pendingRedPreview ? (
        <section className="rounded-xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-50">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div><p className="font-bold">Нужен второй approver</p><p className="mt-1 text-xs leading-5 text-red-100/70">Preview ID: <code className="select-all">{pendingRedPreview.previewId}</code>. Передайте его другому администратору. Сам автор согласовать операцию не может.</p></div>
            <button type="button" onClick={() => { if (pendingRedPreview.previewId) setApprovalPreviewId(pendingRedPreview.previewId); setActiveTab('live'); }} className="min-h-11 shrink-0 rounded-xl border border-red-300/35 px-4 font-semibold">Открыть согласование</button>
          </div>
          <label className="mt-3 block space-y-2"><FieldLabel>Approval ID от второго администратора</FieldLabel><input value={redApprovalId} onChange={(event) => setRedApprovalId(event.target.value)} placeholder="Вставьте UUID перед commit" className="min-h-11 w-full rounded-xl border border-red-300/25 bg-black/25 px-3 font-mono text-xs text-white" /></label>
        </section>
      ) : null}

      {activeTab === 'format' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="space-y-5 rounded-2xl border border-white/10 bg-[#0f131d]/95 p-4 md:p-5">
            <div>
              <h2 className="text-lg font-bold text-white">1. Пресет, состав и группы</h2>
              <p className="mt-1 text-sm text-white/55">Пресет фиксирует версию стратегии, после чего экспертные параметры можно уточнить до lock.</p>
            </div>
            <label className="block space-y-2">
              <FieldLabel>Версионируемый пресет V2</FieldLabel>
              <select value={config.templateId} onChange={(event) => applyFormatPreset(event.target.value)} className="min-h-11 w-full rounded-xl border border-orange-300/25 bg-[#131824] px-3 text-white">
                {FORMAT_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              </select>
              <span className="block text-xs leading-5 text-white/45">Schema 2 · template version 1. Классификационные сетки остаются extension-only до появления проверенной стратегии.</span>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <SelectCard active={!standaloneBracket} title="Группы → тиры" hint="Группы только по 3/4, затем все команды продолжают в Hard/Medium/Light." onClick={() => setConfig((current) => ({ ...current, formatMode: 'groups_playoff', playoffFormat: current.playoffFormat === 'classification' ? 'single_elimination' : current.playoffFormat, templateId: current.templateId.startsWith('lpv_standalone') || current.templateId === 'lpv_classification_v1' ? 'lpv_groups_hl_se_v1' : current.templateId }))} />
              <SelectCard active={standaloneBracket} title="Standalone" hint="Без групп: SE, True DE либо классификационные раунды с гарантией ≥3 игр." onClick={() => setConfig((current) => ({ ...current, formatMode: 'standalone_bracket', templateId: current.playoffFormat === 'classification' ? 'lpv_classification_v1' : current.playoffFormat === 'double_elimination' ? 'lpv_standalone_de_v1' : 'lpv_standalone_se_v1' }))} />
            </div>
            <label className="block space-y-2">
              <FieldLabel>Количество команд</FieldLabel>
              <input
                type="number"
                min={standaloneBracket && config.playoffFormat === 'single_elimination' ? 2 : 3}
                max={48}
                value={config.teamCount}
                onChange={(event) => setConfig((current) => ({ ...current, teamCount: Number(event.target.value) }))}
                className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white outline-none focus:border-orange-400"
              />
            </label>
            {standaloneBracket ? (
              <p className="rounded-lg border border-sky-300/25 bg-sky-500/10 p-3 text-sm text-sky-100">Групповая стадия и tier split не создаются. Посев сразу материализуется в выбранную сетку.</p>
            ) : !groupSizes ? (
              <p className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                Для такого количества нельзя построить группы только по 3–4 команды.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {groupSizes.map((size, index) => (
                  <span key={`${size}-${index}`} className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80">
                    {String.fromCharCode(65 + index)} · {size}
                  </span>
                ))}
              </div>
            )}
            {!standaloneBracket ? <div className="grid gap-3 md:grid-cols-2">
              <SelectCard
                active={config.poolMode === 'round_robin_pool'}
                title="Полный круг"
                hint="Каждая команда играет со всеми в своей группе. Обязателен при смешанных тройках и четвёрках."
                onClick={() => setConfig((current) => ({ ...current, poolMode: 'round_robin_pool' }))}
              />
              <SelectCard
                active={config.poolMode === 'modified_pool_4'}
                title="Modified Pool 4"
                hint={modifiedAllowed ? 'Четыре матча на группу, по два матча каждой команде.' : 'Доступен только когда все группы по четыре.'}
                onClick={() => modifiedAllowed && setConfig((current) => ({ ...current, poolMode: 'modified_pool_4' }))}
              />
            </div> : null}

            <div className="border-t border-white/10 pt-5">
              <h2 className="text-lg font-bold text-white">2. Правила матчей</h2>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {((standaloneBracket ? ['playoffMatchRule'] : ['groupMatchRule', 'playoffMatchRule']) as Array<'groupMatchRule' | 'playoffMatchRule'>).map((key) => (
                  <div key={key} className="space-y-2">
                    <FieldLabel>{key === 'groupMatchRule' ? 'Группы' : config.playoffFormat === 'classification' ? 'Классификационные раунды' : 'Плей-офф'}</FieldLabel>
                    {MATCH_RULES.map((rule) => (
                      <SelectCard
                        key={rule.code}
                        active={config[key] === rule.code}
                        title={rule.label}
                        hint={`${rule.hint} · слот ${rule.minutes} мин`}
                        onClick={() => setConfig((current) => ({ ...current, [key]: rule.code }))}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10 pt-5">
              <h2 className="text-lg font-bold text-white">3. Тиры и финальная стадия</h2>
              {!standaloneBracket ? <><div className="mt-4 grid gap-3 md:grid-cols-3">
                {([
                  ['auto', 'Автоматически', 'До 30: Hard/Light; с 31: Hard/Medium/Light'],
                  ['two', 'Два тира', 'Hard и Light'],
                  ['three', 'Три тира', 'Hard, Medium и Light'],
                ] as Array<[TierMode, string, string]>).map(([value, title, hint]) => (
                  <SelectCard
                    key={value}
                    active={config.tierMode === value}
                    title={title}
                    hint={hint}
                    onClick={() => setConfig((current) => ({ ...current, tierMode: value }))}
                  />
                ))}
              </div>
              <label className="mt-3 flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={config.tierMode === 'manual'}
                  onChange={(event) => setConfig((current) => {
                    if (!event.target.checked) return { ...current, tierMode: 'auto' };
                    const currentTiers = calculateTierSizes(
                      current.teamCount,
                      groupSizes?.length ?? 1,
                      current.tierMode,
                      current.tierQuotas,
                    );
                    return {
                      ...current,
                      tierMode: 'manual',
                      tierQuotas: {
                        hard: currentTiers.hard,
                        medium: currentTiers.medium,
                        light: currentTiers.light,
                      },
                    };
                  })}
                />
                Указать точные квоты Hard / Medium / Light
              </label>
              {config.tierMode === 'manual' ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(['hard', 'medium', 'light'] as const).map((tier) => (
                      <label key={tier} className="space-y-2">
                        <FieldLabel>{tier}</FieldLabel>
                        <input
                          type="number"
                          min={0}
                          max={tier === 'hard' ? 16 : 48}
                          step={1}
                          value={config.tierQuotas[tier]}
                          onChange={(event) => setConfig((current) => ({
                            ...current,
                            tierQuotas: {
                              ...current.tierQuotas,
                              [tier]: Number(event.target.value),
                            },
                          }))}
                          className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"
                        />
                      </label>
                    ))}
                  </div>
                  {tierQuotaIssue ? <p className="mt-3 text-sm text-red-200">{tierQuotaIssue}</p> : null}
                </div>
              ) : null}</> : <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] p-3 text-sm text-white/60">Standalone-формат не создаёт публичные тиры: все участники получают общий seed и полные места 1…N.</p>}
              <div className={cx('mt-4 grid gap-3', standaloneBracket ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
                <SelectCard
                  active={config.playoffFormat === 'single_elimination'}
                  title="Олимпийская сетка"
                  hint="Вылет после одного поражения; бронза включается отдельно."
                  onClick={() => setConfig((current) => ({
                    ...current,
                    playoffFormat: 'single_elimination',
                    templateId: standaloneBracket ? 'lpv_standalone_se_v1' : current.templateId,
                  }))}
                />
                <SelectCard
                  active={config.playoffFormat === 'double_elimination'}
                  title="Double elimination"
                  hint="Вылет после двух поражений; cross-over и условный reset-финал."
                  onClick={() => setConfig((current) => ({
                    ...current,
                    playoffFormat: 'double_elimination',
                    templateId: standaloneBracket ? 'lpv_standalone_de_v1' : current.templateId,
                  }))}
                />
                {standaloneBracket ? <SelectCard
                  active={config.playoffFormat === 'classification'}
                  title="Классификационные раунды"
                  hint="3–48 команд, реальные матчи без BYE; минимум 3 игры каждой команде и полные места 1…N."
                  onClick={() => setConfig((current) => ({
                    ...current,
                    playoffFormat: 'classification',
                    templateId: 'lpv_classification_v1',
                    bronzeEnabled: false,
                    resetFinalEnabled: false,
                  }))}
                /> : null}
              </div>
              {config.playoffFormat !== 'classification' ? <label className="mt-3 flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={config.playoffFormat === 'single_elimination' ? config.bronzeEnabled : config.resetFinalEnabled}
                  onChange={(event) => setConfig((current) => current.playoffFormat === 'single_elimination'
                    ? { ...current, bronzeEnabled: event.target.checked }
                    : { ...current, resetFinalEnabled: event.target.checked })}
                />
                {config.playoffFormat === 'single_elimination' ? 'Матч за третье место' : 'True reset-финал'}
              </label> : <p className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-500/10 p-3 text-sm leading-6 text-emerald-50/80">Нечётное число команд создаёт четыре раунда с паузами, а не фиктивными BYE-победами. Для трёх команд используется двойной круг: по четыре реальные игры каждой.</p>}
            </div>

            <div className="border-t border-white/10 pt-5">
              <h2 className="text-lg font-bold text-white">4. Расписание</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-2">
                  <FieldLabel>Кортов</FieldLabel>
                  <select value={config.courtCount} onChange={(event) => setConfig((current) => ({ ...current, courtCount: Number(event.target.value) }))} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white">
                    {[1, 2, 3, 4, 5, 6].map((court) => <option key={court} value={court}>{court}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <FieldLabel>Старт</FieldLabel>
                  <input type="time" value={config.startTime} onChange={(event) => setConfig((current) => ({ ...current, startTime: event.target.value }))} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" />
                </label>
                <label className="space-y-2">
                  <FieldLabel>Окончание</FieldLabel>
                  <input type="time" value={config.endTime} onChange={(event) => setConfig((current) => ({ ...current, endTime: event.target.value }))} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" />
                </label>
                <label className="space-y-2">
                  <FieldLabel>Судейство</FieldLabel>
                  <select value={config.refereeMode} onChange={(event) => setConfig((current) => ({ ...current, refereeMode: event.target.value as RefereeMode }))} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white">
                    <option value="hybrid">Гибрид</option>
                    <option value="working_team">Играющая команда</option>
                    <option value="court_judge">Судья корта</option>
                    <option value="none">Без назначения</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">Окна доступности кортов</p>
                    <p className="mt-1 text-xs leading-5 text-white/50">Корт вне своего окна не получит матчи. Номер влияет на affinity тиров.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCourts((current) => current.map((court) => ({
                      ...court,
                      availability: [{ start: config.startTime, end: config.endTime }],
                    })))}
                    className="min-h-10 shrink-0 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/75"
                  >
                    Окно сессии для всех
                  </button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {courts.map((court, index) => (
                    <div key={`${court.courtNo}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/65">
                          {courtRoleLabel(
                            court.courtNo,
                            courts.length,
                            config.tierMode === 'three'
                              || (config.tierMode === 'auto' && config.teamCount > 30)
                              || (config.tierMode === 'manual' && config.tierQuotas.medium > 0),
                          )}
                        </span>
                        <span className="text-[11px] text-white/35">lpv_tier_courts_v1</span>
                      </div>
                      <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                        <label className="space-y-2">
                          <FieldLabel>№ корта</FieldLabel>
                          <select
                            aria-label={`Номер корта ${index + 1}`}
                            value={court.courtNo}
                            onChange={(event) => setCourts((current) => current.map((item, itemIndex) => (
                              itemIndex === index ? { ...item, courtNo: Number(event.target.value) } : item
                            )))}
                            className="min-h-11 w-full rounded-lg border border-white/15 bg-[#131824] px-2 text-white"
                          >
                            {[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}</option>)}
                          </select>
                        </label>
                        <label className="space-y-2">
                          <FieldLabel>Название</FieldLabel>
                          <input
                            value={court.label}
                            onChange={(event) => setCourts((current) => current.map((item, itemIndex) => (
                              itemIndex === index ? { ...item, label: event.target.value } : item
                            )))}
                            className="min-h-11 w-full rounded-lg border border-white/15 bg-black/25 px-3 text-white"
                          />
                        </label>
                      </div>
                      <div className="mt-3 space-y-2">
                        {court.availability.map((window, windowIndex) => (
                          <div key={`${court.courtNo}-window-${windowIndex}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2">
                            <label className="space-y-2">
                              <FieldLabel>{windowIndex === 0 ? 'Доступен с' : `Интервал ${windowIndex + 1} с`}</FieldLabel>
                              <input
                                type="time"
                                value={window.start}
                                onChange={(event) => setCourts((current) => current.map((item, itemIndex) => itemIndex === index
                                  ? { ...item, availability: item.availability.map((candidate, candidateIndex) => candidateIndex === windowIndex ? { ...candidate, start: event.target.value } : candidate) }
                                  : item))}
                                className="min-h-11 w-full rounded-lg border border-white/15 bg-black/25 px-2 text-white"
                              />
                            </label>
                            <label className="space-y-2">
                              <FieldLabel>{windowIndex === 0 ? 'Доступен до' : `Интервал ${windowIndex + 1} до`}</FieldLabel>
                              <input
                                type="time"
                                value={window.end}
                                onChange={(event) => setCourts((current) => current.map((item, itemIndex) => itemIndex === index
                                  ? { ...item, availability: item.availability.map((candidate, candidateIndex) => candidateIndex === windowIndex ? { ...candidate, end: event.target.value } : candidate) }
                                  : item))}
                                className="min-h-11 w-full rounded-lg border border-white/15 bg-black/25 px-2 text-white"
                              />
                            </label>
                            <button
                              type="button"
                              aria-label={`Удалить интервал ${windowIndex + 1} корта ${court.courtNo}`}
                              disabled={court.availability.length === 1}
                              onClick={() => setCourts((current) => current.map((item, itemIndex) => itemIndex === index
                                ? { ...item, availability: item.availability.filter((_, candidateIndex) => candidateIndex !== windowIndex) }
                                : item))}
                              className="mt-6 min-h-11 rounded-lg border border-red-300/20 text-red-100 disabled:cursor-not-allowed disabled:opacity-25"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          disabled={court.availability.length >= 12}
                          onClick={() => setCourts((current) => current.map((item, itemIndex) => itemIndex === index
                            ? { ...item, availability: [...item.availability, { start: config.startTime, end: config.endTime }] }
                            : item))}
                          className="min-h-10 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/70 disabled:opacity-30"
                        >
                          + Добавить интервал
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {courtConfigurationIssue ? <p className="mt-3 text-sm text-red-200">{courtConfigurationIssue}</p> : null}
              </div>
            </div>
          </section>

          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <section className="rounded-2xl border border-orange-400/25 bg-orange-500/10 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-orange-100/70">Расчёт формата</p>
              {estimate ? (
                <>
                  <div className={cx('mt-3 grid gap-2 text-center', config.playoffFormat === 'classification' ? 'grid-cols-1' : 'grid-cols-3')}>
                    {[
                      ...(config.playoffFormat === 'classification'
                        ? [['Общая таблица', config.teamCount] as const]
                        : [
                            ['Hard', estimate.tiers.hard] as const,
                            ['Medium', estimate.tiers.medium] as const,
                            ['Light', estimate.tiers.light] as const,
                          ]),
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg border border-white/10 bg-black/20 p-2">
                        <p className="text-[10px] uppercase text-white/45">{label}</p>
                        <p className="mt-1 text-xl font-bold text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between gap-4"><dt className="text-white/55">Групповые матчи</dt><dd className="font-semibold text-white">{estimate.groupMatches}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-white/55">{config.playoffFormat === 'classification' ? 'Классификационные матчи' : 'Плей-офф'}</dt><dd className="font-semibold text-white">{estimate.playoffMatches}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-white/55">Всего</dt><dd className="font-semibold text-white">{estimate.totalMatches}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-white/55">Нижняя оценка</dt><dd className="font-semibold text-white">≈ {Math.ceil(estimate.courtMinutes / config.courtCount / 60)} ч</dd></div>
                  </dl>
                </>
              ) : standaloneBracket ? (
                <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                  <strong>Формат недоступен для этого числа команд.</strong>
                  <p className="mt-1 text-xs leading-5 text-amber-100/75">
                    SE поддерживает 2–48 команд. True DE и классификационные раунды — 3–48; для двух команд нужна отдельная серия.
                  </p>
                </div>
              ) : <p className="mt-3 text-sm text-red-100">Исправьте количество команд.</p>}
              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  disabled={!formatReady || Boolean(pendingAction)}
                  onClick={() => void lockRegistration()}
                  className="min-h-11 w-full rounded-xl border border-orange-300/35 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Зафиксировать регистрацию
                </button>
                <button
                  type="button"
                  disabled={!formatReady || Boolean(pendingAction)}
                  onClick={() => void previewDraw()}
                  className="min-h-12 w-full rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pendingAction ? 'Выполняется…' : standaloneBracket ? 'Предпросмотр финальной стадии' : 'Предпросмотр жеребьёвки'}
                </button>
              </div>
            </section>
            <section className="rounded-2xl border border-white/10 bg-[#0f131d] p-4 text-xs leading-5 text-white/55">
              <p className="font-semibold text-white/75">Защита от ошибок</p>
              <p className="mt-2">Modified Pool не смешивается с Round Robin. Hard ограничен 16 командами. Ни одна стадия не фиксируется без snapshot и input hash. Если выбранный preset не гарантирует три игры каждой команде, preview обязан показать предупреждение.</p>
            </section>
          </aside>
        </div>
      ) : null}

      {activeTab === 'draw' ? (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-[#0f131d]/95 p-4 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Предпросмотр групп</h2>
              <p className="mt-1 text-sm text-white/55">Проверьте змейку, размеры групп и квоты тиров до блокировки.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void previewDraw()} disabled={lifecycle === 'draw_locked' || Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Пересчитать</button>
              <button type="button" onClick={() => void commitDraw()} disabled={lifecycle === 'draw_locked' || !drawPreview || Boolean(pendingAction)} className="min-h-11 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50">Зафиксировать</button>
              <button type="button" onClick={() => void materializeStages()} disabled={!drawPreview || Boolean(pendingAction)} className="min-h-11 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 disabled:opacity-50">Создать стадии</button>
            </div>
          </div>
          {lifecycle === 'draw_locked' ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-50">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-3xl">
                  <p className="font-bold">Нужно изменить состав или заново посеять команды?</p>
                  <p className="mt-1 leading-5 text-amber-100/75">
                    Разблокировка разрешена только до старта матчей, расписания, квалификации и судейского журнала. Старый snapshot и аудит сохраняются.
                  </p>
                  <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-amber-200/20 bg-black/15 px-3">
                    <input
                      type="checkbox"
                      checked={drawUnlockReseed}
                      onChange={(event) => setDrawUnlockReseed(event.target.checked)}
                      className="size-4 accent-orange-500"
                    />
                    <span>Пересчитать seed по актуальному рейтингу; иначе сохранить текущий seed</span>
                  </label>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void previewDrawUnlock()}
                    disabled={Boolean(pendingAction)}
                    className="min-h-11 rounded-xl border border-amber-200/30 px-4 font-semibold disabled:opacity-50"
                  >
                    Preview unlock
                  </button>
                  <button
                    type="button"
                    onClick={() => void commitDrawUnlock()}
                    disabled={!drawUnlockPreview || Boolean(pendingAction)}
                    className="min-h-11 rounded-xl bg-amber-400 px-4 font-bold text-black disabled:opacity-50"
                  >
                    Разблокировать
                  </button>
                </div>
              </div>
              {drawUnlockPreview ? (
                <details className="mt-3 rounded-lg border border-amber-200/20 bg-black/15 p-3">
                  <summary className="cursor-pointer font-semibold">
                    Проверить impact: {String(asRecord(previewResult(drawUnlockPreview).impact).removedPoolCount ?? 0)} групп ·{' '}
                    {String(asRecord(previewResult(drawUnlockPreview).impact).removedMatchCount ?? 0)} матчей
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-amber-50/70">{formatJson(previewResult(drawUnlockPreview).impact)}</pre>
                </details>
              ) : null}
            </div>
          ) : null}
          {drawPreview ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                Перетащите команду на другую — два слота будут обменены в новом preview. Исходный seed snapshot останется неизменным.
              </div>
              {drawGroups.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {drawGroups.map((group, groupIndex) => {
                    const slots = Array.isArray(group.slots) ? group.slots.map(asRecord) : [];
                    return (
                      <article key={String(group.groupId ?? groupIndex)} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-base font-extrabold text-white">Группа {String(group.label ?? String.fromCharCode(65 + groupIndex))}</h3>
                          <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-white/50">{slots.length}/{String(group.capacity ?? slots.length)}</span>
                        </div>
                        <div className="mt-3 space-y-2">
                          {slots.map((slot, slotIndex) => {
                            const embedded = asRecord(slot.entry);
                            const entryId = String(embedded.entryId ?? embedded.id ?? '');
                            const entry = entryById.get(entryId) ?? embedded;
                            const seed = Number(entry.initialSeed ?? embedded.initialSeed ?? 0);
                            const rating = Number(entry.ratingSnapshotValue ?? embedded.rating ?? 0);
                            return (
                              <button
                                key={entryId || slotIndex}
                                type="button"
                                draggable
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = 'move';
                                  event.dataTransfer.setData('text/plain', entryId);
                                  setDraggedEntryId(entryId);
                                }}
                                onDragEnd={() => setDraggedEntryId('')}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  event.dataTransfer.dropEffect = 'move';
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  const source = event.dataTransfer.getData('text/plain') || draggedEntryId;
                                  setDraggedEntryId('');
                                  queueManualSwap(source, entryId);
                                }}
                                className={cx(
                                  'flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-orange-400/70',
                                  draggedEntryId === entryId
                                    ? 'border-orange-400/60 bg-orange-500/15 opacity-70'
                                    : 'border-white/10 bg-black/20 hover:border-orange-300/40',
                                )}
                                aria-label={`Команда ${entryLabel(entryId, embedded)}, seed ${seed}, рейтинг ${rating}. Перетащите на другую команду для обмена.`}
                              >
                                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5 text-xs font-black text-orange-100">#{seed || slotIndex + 1}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-bold text-white">{entryLabel(entryId, embedded)}</span>
                                  <span className="mt-0.5 block text-xs text-white/45">Слот {Number(slot.slot ?? slotIndex + 1)} · рейтинг {Number.isFinite(rating) ? rating : '—'}</span>
                                </span>
                                <span aria-hidden="true" className="text-white/30">⋮⋮</span>
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">Сервер не вернул группы в candidate preview. Откройте технические данные ниже.</div>
              )}
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-sm font-bold text-white">Обмен без drag-and-drop</p>
                  <p className="mt-1 text-xs text-white/55">Выберите две команды по имени — это удобно на телефоне и с клавиатуры.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <select value={swapEntryA} onChange={(event) => setSwapEntryA(event.target.value)} aria-label="Первая команда для обмена" className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-[#131824] px-3 text-sm text-white">
                      <option value="">Первая команда</option>
                      {drawEntries.map((entry) => { const entryId = String(entry.entryId ?? entry.id ?? ''); return <option key={`a-${entryId}`} value={entryId}>{entryOptionLabel(entryId, entry)}</option>; })}
                    </select>
                    <select value={swapEntryB} onChange={(event) => setSwapEntryB(event.target.value)} aria-label="Вторая команда для обмена" className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-[#131824] px-3 text-sm text-white">
                      <option value="">Вторая команда</option>
                      {drawEntries.map((entry) => { const entryId = String(entry.entryId ?? entry.id ?? ''); return <option key={`b-${entryId}`} value={entryId}>{entryOptionLabel(entryId, entry)}</option>; })}
                    </select>
                    <button type="button" onClick={addManualSwap} className="min-h-11 rounded-lg border border-white/20 px-3 text-sm font-semibold text-white">Добавить</button>
                  </div>
                  {manualSwaps.length ? (
                    <div className="mt-3 space-y-2">
                      {manualSwaps.map((swap, index) => (
                        <div key={`${swap.entryA}-${swap.entryB}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
                          <span className="min-w-0 truncate">{entryLabel(swap.entryA)} ↔ {entryLabel(swap.entryB)}</span>
                          <button type="button" onClick={() => { setManualSwaps((current) => current.filter((_, itemIndex) => itemIndex !== index)); setDrawPreview(null); }} className="min-h-9 shrink-0 px-2 text-red-200">Удалить</button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-xs uppercase tracking-wide text-white/45">Snapshot</p>
                  <p className="mt-2 break-all font-mono text-xs text-white/75">{drawPreview.inputHash || 'hash появится после server preview'}</p>
                  <p className="mt-3 text-xs leading-5 text-white/45">{drawGroups.length} групп · {drawEntries.length} команд · {manualSwaps.length} ручных обменов</p>
                </div>
              </div>
              <details className="rounded-xl border border-white/10 bg-black/20 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-white/65">Технические данные preview</summary>
                <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-white/65">{formatJson(drawPreview)}</pre>
              </details>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/45">Preview ещё не сформирован.</div>
          )}
        </section>
      ) : null}

      {activeTab === 'bracket' ? (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-[#0f131d]/95 p-4 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-lg font-bold text-white">{config.playoffFormat === 'classification' ? 'Классификационные раунды' : 'Сетки тиров'}</h2><p className="mt-1 text-sm text-white/55">Topology hash фиксирует все реальные матчи и зависимости; BYE не считается матчем.</p></div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void previewBracket()} disabled={Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Preview</button>
              <button type="button" onClick={() => void lockBracket()} disabled={!bracketPreview || Boolean(pendingAction)} className="min-h-11 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50">Lock</button>
            </div>
          </div>
          {bracketPreview ? (
            <div className="space-y-4">
              {bracketTiers.length ? bracketTiers.map((tierBracket, tierIndex) => {
                const topology = asRecord(tierBracket.topology);
                const topologyMatches = Array.isArray(topology.matches) ? topology.matches.map(asRecord) : [];
                const isClassification = topology.kind === 'classification_rounds';
                const phaseOrder: Record<string, number> = { placement: 0, upper: 1, lower: 2, grand_final: 3, bronze: 4 };
                const columnMap = new Map<string, ApiRecord[]>();
                topologyMatches.forEach((match) => {
                  const phase = isClassification ? 'placement' : String(match.phase ?? 'upper');
                  const round = Number(match.round ?? 0);
                  const key = `${phase}:${round}`;
                  columnMap.set(key, [...(columnMap.get(key) ?? []), match]);
                });
                const columns = [...columnMap.entries()].sort(([left], [right]) => {
                  const [leftPhase, leftRound] = left.split(':');
                  const [rightPhase, rightRound] = right.split(':');
                  return (phaseOrder[leftPhase] ?? 9) - (phaseOrder[rightPhase] ?? 9)
                    || Number(leftRound) - Number(rightRound);
                });
                const tier = String(tierBracket.tier ?? 'hard');
                return (
                  <article key={`${tier}-${tierIndex}`} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.025]">
                    <header className="flex flex-col gap-2 border-b border-white/10 bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-base font-extrabold text-white">{isClassification ? 'Общая классификация' : TIER_LABELS[tier] ?? tier}</h3>
                        <p className="mt-1 text-xs text-white/45">{String(tierBracket.bracketType ?? topology.kind ?? config.playoffFormat)} · topology {String(topology.templateVersion ?? '—')}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-white/60">
                        <span className="rounded-full border border-white/10 px-2.5 py-1">{Number(topology.participantCount ?? 0)} команд</span>
                        <span className="rounded-full border border-white/10 px-2.5 py-1">{Number(topology.realMatchCount ?? topology.guaranteedMatchCount ?? topologyMatches.length)} реальных матчей</span>
                        {isClassification ? <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-100">минимум {Number(topology.minimumGamesGuaranteed ?? 3)} игр</span> : null}
                      </div>
                    </header>
                    <div className="overflow-x-auto p-3">
                      <div className="flex min-w-max items-start gap-3 pb-2">
                        {columns.map(([key, roundMatches]) => {
                          const [phase, round] = key.split(':');
                          return (
                            <section key={key} className="w-64 shrink-0">
                              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-white/50">{PHASE_LABELS[phase] ?? phase} · R{round}</p>
                              <div className="space-y-2">
                                {roundMatches.sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0)).map((match, matchIndex) => (
                                  <div
                                    key={String(match.matchId ?? matchIndex)}
                                    className={cx(
                                      'rounded-xl border p-3',
                                      match.conditional === true
                                        ? 'border-amber-300/30 bg-[repeating-linear-gradient(135deg,rgba(245,158,11,0.13),rgba(245,158,11,0.13)_8px,rgba(0,0,0,0.13)_8px,rgba(0,0,0,0.13)_16px)]'
                                        : 'border-white/10 bg-black/25',
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="truncate text-[11px] font-semibold text-white/45">{String(match.publicLabel ?? match.matchId ?? `Матч ${matchIndex + 1}`)}</span>
                                      {match.conditional === true ? <span className="shrink-0 rounded-full border border-amber-300/30 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-100">если нужен</span> : null}
                                    </div>
                                    {[match.sourceA, match.sourceB].map((source, sourceIndex) => (
                                      <div key={sourceIndex} className="mt-2 min-h-9 rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs font-semibold text-white/80">
                                        {bracketSourceLabel(source)}
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    </div>
                  </article>
                );
              }) : (
                <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">Сервер не вернул topology сеток. Проверьте raw preview.</div>
              )}
              {bracketWarnings.length ? (
                <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3">
                  <p className="text-sm font-bold text-amber-100">Предупреждения сетки</p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-50/80">
                    {bracketWarnings.map((warning, index) => <li key={index}>• {String(warning)}</li>)}
                  </ul>
                </div>
              ) : null}
              <details className="rounded-xl border border-white/10 bg-black/20 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-white/65">Технические данные preview</summary>
                <pre className="mt-3 max-h-[620px] overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-white/65">{formatJson(bracketPreview)}</pre>
              </details>
            </div>
          ) : <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/45">Сформируйте preview после блокировки жеребьёвки.</div>}
        </section>
      ) : null}

      {activeTab === 'schedule' ? (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-[#0f131d]/95 p-4 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-lg font-bold text-white">Расписание</h2><p className="mt-1 text-sm text-white/55">Время и корт назначаются совместно; hard-ограничения не ослабляются автоматически.</p></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void generateSchedule()} disabled={Boolean(pendingAction) || Boolean(courtConfigurationIssue)} className="min-h-11 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50">Рассчитать preview</button>
              <button type="button" onClick={() => void commitGeneratedSchedule()} disabled={String(schedulePreview?.operation ?? '') !== 'schedule.generate.preview' || !schedulePreview?.previewId || Boolean(pendingAction)} className="min-h-11 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 disabled:opacity-50">Опубликовать</button>
              <button type="button" onClick={() => void previewScheduleReplan()} disabled={Boolean(pendingAction) || Boolean(courtConfigurationIssue)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Replan preview</button>
              <button type="button" onClick={() => void commitScheduleReplan()} disabled={String(schedulePreview?.operation ?? '') !== 'schedule.replan.preview' || !schedulePreview?.previewId || Boolean(pendingAction)} className="min-h-11 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 disabled:opacity-50">Применить replan</button>
            </div>
          </div>
          <label className="block space-y-2"><FieldLabel>Общая сессия с другими турнирами</FieldLabel><input value={linkedTournamentIdsInput} onChange={(event) => setLinkedTournamentIdsInput(event.target.value)} placeholder="UUID женского/мужского турнира через запятую (необязательно)" className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white" /><span className="block text-xs leading-5 text-white/45">Для общего дня движок блокирует версии всех турниров, объединяет их матчи и публикует одну атомарную версию расписания.</span></label>
          <div className="rounded-xl border border-amber-300/20 bg-amber-500/[0.045] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Временное исключение из закрепления кортов</h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-white/55">
                  По умолчанию Light остаётся только на корте 2, Hard — на кортах 3–4. Если корт закрылся или очередь не помещается, директор сначала видит точный successor schedule и только затем разрешает дополнительные корты на ограниченный период.
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-red-300/25 px-2.5 py-1 text-[11px] font-semibold text-red-100">Только director</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <FieldLabel>Тир</FieldLabel>
                <select value={courtPolicyTier} onChange={(event) => setCourtPolicyTier(event.target.value as 'hard' | 'medium' | 'light')} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white">
                  <option value="hard">Hard</option><option value="medium">Medium</option><option value="light">Light</option>
                </select>
              </label>
              <label className="space-y-2">
                <FieldLabel>Стадия</FieldLabel>
                <select value={courtPolicyStageId} onChange={(event) => setCourtPolicyStageId(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white">
                  <option value="">Все будущие стадии этого тира</option>
                  {playoffStages.map((stage) => <option key={String(stage.id)} value={String(stage.id)}>{String(stage.stageKey ?? stage.tier ?? stage.id)}</option>)}
                </select>
              </label>
              <label className="space-y-2"><FieldLabel>Действует с · {config.timezone}</FieldLabel><input type="datetime-local" value={courtPolicyEffectiveFrom} onChange={(event) => setCourtPolicyEffectiveFrom(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
              <label className="space-y-2"><FieldLabel>Действует до · {config.timezone}</FieldLabel><input type="datetime-local" value={courtPolicyEffectiveUntil} onChange={(event) => setCourtPolicyEffectiveUntil(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
            </div>
            <fieldset className="mt-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-white/50">Временно разрешённые корты</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {persistedCourts.map((court) => {
                  const courtId = String(court.id ?? '');
                  const checked = courtPolicyAllowedCourtIds.includes(courtId);
                  return (
                    <label key={courtId} className={cx('flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm', checked ? 'border-amber-300/35 bg-amber-500/10 text-amber-50' : 'border-white/10 bg-black/15 text-white/65')}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => setCourtPolicyAllowedCourtIds((current) => event.target.checked ? [...new Set([...current, courtId])] : current.filter((id) => id !== courtId))}
                        className="size-4 accent-amber-400"
                      />
                      <span>{String(court.label ?? `Корт ${court.courtNo ?? ''}`)}</span>
                    </label>
                  );
                })}
              </div>
              {!persistedCourts.length ? <p className="mt-2 text-xs text-white/45">Сначала опубликуйте исходную ScheduleSession с физическими кортами.</p> : null}
            </fieldset>
            <label className="mt-3 block space-y-2"><FieldLabel>Причина исключения</FieldLabel><input value={courtPolicyNote} onChange={(event) => setCourtPolicyNote(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white" /></label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="button" onClick={() => void previewCourtPolicyException()} disabled={!persistedCourts.length || Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Проверить исключение</button>
              <button type="button" onClick={() => void commitCourtPolicyException()} disabled={!courtPolicyPreview || Boolean(pendingAction)} className="min-h-11 rounded-xl bg-amber-500 px-4 text-sm font-bold text-slate-950 disabled:opacity-50">Подтвердить и опубликовать schedule</button>
            </div>
            <OperationImpactSummary value={courtPolicyPreview} title="Изменения времени, кортов и судейства" />
            {courtPolicyExceptions.length ? (
              <details className="mt-3 rounded-xl border border-white/10 bg-black/15 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-white/65">Журнал исключений ({courtPolicyExceptions.length})</summary>
                <div className="mt-3 space-y-2">
                  {courtPolicyExceptions.slice(0, 8).map((item, index) => (
                    <div key={String(item.id ?? index)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60">
                      <span className="font-bold capitalize text-white/80">{String(item.tier ?? 'tier')}</span> · {formatScheduleTime(item.effectiveFrom)}–{formatScheduleTime(item.effectiveUntil)} · {Array.isArray(item.allowedCourtIds) ? item.allowedCourtIds.length : 0} корт(а)
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
          <div className="rounded-xl border border-violet-300/20 bg-violet-500/[0.045] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Отложить игру без технического результата</h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-white/55">Defer двигает только pending/ready матч и пересчитывает всю shared-session. `skipped`, `void` и победитель не создаются. Снятие defer — отдельная компенсирующая revision.</p>
              </div>
              <span className="shrink-0 rounded-full border border-violet-300/25 px-2.5 py-1 text-[11px] font-semibold text-violet-100">preview → commit</span>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <label className="space-y-2 lg:col-span-2"><FieldLabel>Матч</FieldLabel><select value={scheduleDeferMatchId} onChange={(event) => setScheduleDeferMatchId(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="">Выберите pending/ready матч</option>{deferrableMatches.map((match) => <option key={String(match.id)} value={String(match.id)}>{matchLabel(match)}</option>)}</select></label>
              <label className="space-y-2"><FieldLabel>Режим</FieldLabel><select value={scheduleDeferMode} onChange={(event) => setScheduleDeferMode(event.target.value as 'not_before' | 'end_of_queue')} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="not_before">Не раньше времени</option><option value="end_of_queue">В конец очереди</option></select></label>
              <label className="space-y-2"><FieldLabel>Не раньше · {config.timezone}</FieldLabel><input type="datetime-local" value={scheduleDeferNotBefore} onChange={(event) => setScheduleDeferNotBefore(event.target.value)} disabled={scheduleDeferMode === 'end_of_queue'} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white disabled:opacity-40" /></label>
              <label className="space-y-2 lg:col-span-2"><FieldLabel>Причина</FieldLabel><input value={scheduleDeferNote} onChange={(event) => setScheduleDeferNote(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white" /></label>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap"><button type="button" onClick={() => void previewScheduleDefer()} disabled={!deferrableMatches.length || Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Defer preview</button><button type="button" onClick={() => void commitScheduleDefer()} disabled={!scheduleDeferPreview || Boolean(pendingAction)} className="min-h-11 rounded-xl bg-violet-500 px-4 text-sm font-bold text-white disabled:opacity-50">Отложить и опубликовать schedule</button></div>
            <OperationImpactSummary value={scheduleDeferPreview} title="Точное новое расписание после defer" />

            {activeGenericDefers.length ? (
              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-white/45">Активные defer</p>
                <div className="mt-2 space-y-2">
                  {activeGenericDefers.map((item) => {
                    const deferredMatchId = String(item.matchId ?? '');
                    const deferredMatch = matches.find((match) => String(match.id) === deferredMatchId);
                    return (
                      <div key={String(item.id ?? deferredMatchId)} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 text-xs"><p className="truncate font-semibold text-white/80">{deferredMatch ? matchLabel(deferredMatch) : deferredMatchId}</p><p className="mt-1 text-white/45">{String(item.deferMode ?? 'defer')} · не раньше {formatScheduleTime(item.notBefore)}</p></div>
                        <button type="button" disabled={item.canRelease !== true || Boolean(pendingAction)} onClick={() => void previewScheduleDeferRelease(deferredMatchId)} className="min-h-11 shrink-0 rounded-lg border border-violet-300/30 px-3 text-xs font-semibold text-violet-100 disabled:opacity-40">Preview снятия</button>
                      </div>
                    );
                  })}
                </div>
                {scheduleDeferReleaseMatchId ? <label className="mt-3 block space-y-2"><FieldLabel>Причина снятия defer</FieldLabel><input value={scheduleDeferReleaseNote} onChange={(event) => setScheduleDeferReleaseNote(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white" /></label> : null}
                <OperationImpactSummary value={scheduleDeferReleasePreview} title="Компенсирующее расписание после снятия defer" />
                {scheduleDeferReleasePreview ? <button type="button" onClick={() => void commitScheduleDeferRelease()} disabled={Boolean(pendingAction)} className="mt-3 min-h-11 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white disabled:opacity-50">Снять defer и опубликовать schedule</button> : null}
              </div>
            ) : <p className="mt-4 rounded-lg border border-dashed border-white/15 p-3 text-sm text-white/45">Активных generic defer нет.</p>}
          </div>
          <div className="rounded-xl border border-sky-300/20 bg-sky-500/[0.045] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Изменить формат следующего полного раунда</h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-white/55">Групповые правила неизменяемы после первой игры. В плей-офф новый формат применяется только к ближайшему полностью не начатому раунду и всем следующим; расписание пересчитывается целиком.</p>
              </div>
              <span className="shrink-0 rounded-full border border-red-300/25 px-2.5 py-1 text-[11px] font-semibold text-red-100">Только director</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2 xl:col-span-2"><FieldLabel>Стадия</FieldLabel><select value={stageRuleStageId} onChange={(event) => setStageRuleStageId(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="">Выберите стадию</option>{ruleEditableStages.map((stage) => <option key={String(stage.id)} value={String(stage.id)}>{String(stage.stageKey ?? stage.tier ?? stage.id)} · {String(stage.stageType ?? '')}</option>)}</select></label>
              <label className="space-y-2"><FieldLabel>С полного раунда</FieldLabel><input type="number" min={1} value={stageRuleEffectiveRound} onChange={(event) => setStageRuleEffectiveRound(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /><span className="block text-[11px] text-white/40">Ближайший допустимый: {stageRuleSuggestedRound}</span></label>
              <label className="space-y-2"><FieldLabel>Новый формат</FieldLabel><select value={stageRulePreset} onChange={(event) => setStageRulePreset(event.target.value as MatchRuleCode)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white">{MATCH_RULES.map((rule) => <option key={rule.code} value={rule.code}>{rule.label} · {rule.minutes} мин</option>)}</select></label>
            </div>
            <label className="mt-3 block space-y-2"><FieldLabel>Основание изменения</FieldLabel><input value={stageRuleNote} onChange={(event) => setStageRuleNote(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white" /></label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap"><button type="button" onClick={() => void previewStageRuleChange()} disabled={!ruleEditableStages.length || Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Rules preview</button><button type="button" onClick={() => void commitStageRuleChange()} disabled={!stageRulePreview || Boolean(pendingAction) || (stageRulePreview.risk === 'red' && !redApprovalId.trim())} className="min-h-11 rounded-xl bg-sky-500 px-4 text-sm font-bold text-white disabled:opacity-50">Применить и опубликовать schedule</button></div>
            {stageRulePreview?.risk === 'red' ? <p className="mt-3 rounded-lg border border-red-300/25 bg-red-500/10 px-3 py-2 text-xs text-red-100">В область попал frozen/locked матч. Нужен второй отличающийся администратор для exact preview.</p> : null}
            <OperationImpactSummary value={stageRulePreview} title="Матчи, длительности и новое расписание" />
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <div>
              <h3 className="text-sm font-bold text-white">Live ETA для replan</h3>
              <p className="mt-1 text-xs leading-5 text-white/50">Если матч задерживается, задайте новый ETA в зоне {config.timezone}. Солвер учтёт его вместе с freeze horizon.</p>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_auto]">
              <select value={liveEtaMatchId} onChange={(event) => setLiveEtaMatchId(event.target.value)} aria-label="Матч для Live ETA" className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-[#131824] px-3 text-sm text-white">
                <option value="">Выберите матч</option>
                {matches.map((match) => <option key={String(match.id)} value={String(match.id)}>{matchLabel(match)}</option>)}
              </select>
              <input type="datetime-local" value={liveEtaValue} onChange={(event) => setLiveEtaValue(event.target.value)} aria-label="Новый Live ETA" className="min-h-11 rounded-lg border border-white/15 bg-black/25 px-3 text-sm text-white" />
              <button type="button" onClick={addLiveEtaOverride} className="min-h-11 rounded-lg border border-white/20 px-3 text-sm font-semibold text-white">Добавить ETA</button>
            </div>
            {liveEtaOverrides.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {liveEtaOverrides.map((override) => {
                  const match = matches.find((item) => String(item.id) === override.matchId);
                  return (
                    <span key={override.matchId} className="inline-flex max-w-full items-center gap-2 rounded-full border border-sky-300/25 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-50">
                      <span className="truncate">{match ? matchLabel(match) : override.matchId} → {formatScheduleTime(override.liveEta)}</span>
                      <button type="button" aria-label="Удалить Live ETA" onClick={() => setLiveEtaOverrides((current) => current.filter((item) => item.matchId !== override.matchId))} className="min-h-7 min-w-7 rounded-full text-sky-100/70">×</button>
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>
          {courtConfigurationIssue ? <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{courtConfigurationIssue} Исправьте корты на вкладке «Формат».</div> : null}
          {schedulePreview || scheduleModel.assignments.length ? (
            <>
              <div className="flex flex-wrap gap-2">
                <span className={cx('rounded-full border px-3 py-1 text-xs font-semibold', scheduleModel.conflicts.some((conflict) => String(conflict.severity) === 'error') ? 'border-red-400/30 bg-red-500/10 text-red-100' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100')}>{scheduleModel.status}</span>
                {schedulePreview?.risk ? <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70">Risk: {schedulePreview.risk}</span> : null}
                {scheduleModel.metrics.elapsedMs !== undefined ? <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/60">{Number(scheduleModel.metrics.elapsedMs)} мс · {Number(scheduleModel.metrics.expandedStates ?? 0)} states</span> : null}
              </div>
              {scheduleModel.conflicts.length || scheduleModel.warnings.length ? (
                <div className="space-y-2">
                  {[...scheduleModel.conflicts, ...scheduleModel.warnings].map((conflict, index) => {
                    const code = String(conflict.code ?? 'SCHEDULE_WARNING');
                    const isError = String(conflict.severity ?? (index < scheduleModel.conflicts.length ? 'error' : 'warning')) === 'error';
                    return (
                      <div key={`${code}-${index}`} className={cx('rounded-xl border p-3', isError ? 'border-red-400/30 bg-red-500/10' : 'border-amber-400/25 bg-amber-500/10')}>
                        <p className={cx('text-sm font-bold', isError ? 'text-red-100' : 'text-amber-100')}>{code}</p>
                        <p className="mt-1 text-sm leading-5 text-white/70">{CONFLICT_LABELS[code] ?? String(conflict.message ?? 'Проверьте детали конфликта.')}</p>
                        {Array.isArray(conflict.matchIds) && conflict.matchIds.length ? <p className="mt-1 text-xs text-white/45">Матчи: {conflict.matchIds.map(String).join(', ')}</p> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {scheduleDiagnosticsModel.courts.length ? (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Диагностика загрузки</h3>
                    <p className="mt-1 text-xs text-white/45">Вместимость кортов, соблюдение tier-политики, отдых и судейская нагрузка из независимого validator.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {scheduleDiagnosticsModel.courts.map((row) => {
                      const courtId = String(row.courtId ?? 'court');
                      const utilization = Math.max(0, Number(row.utilizationPermille ?? 0) / 10);
                      const localCourtNo = Number(courtId.replace(/^court-/, ''));
                      const localCourt = courts.find((court) => court.courtNo === localCourtNo);
                      return (
                        <article key={courtId} className={cx('rounded-xl border p-3', row.fullyClosed === true ? 'border-red-300/25 bg-red-500/[0.06]' : 'border-white/10 bg-black/20')}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-white">{localCourt?.label ?? courtId}</p>
                            <span className={cx('text-xs font-bold', utilization > 90 ? 'text-amber-200' : 'text-white/60')}>{utilization.toFixed(1)}%</span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={cx('h-full rounded-full', utilization > 90 ? 'bg-amber-400' : 'bg-emerald-400')} style={{ width: `${Math.min(100, utilization)}%` }} /></div>
                          <p className="mt-2 text-[11px] text-white/45">{Number(row.scheduledMinutes ?? 0)} / {Number(row.availableMinutes ?? 0)} мин · {Number(row.assignmentCount ?? 0)} игр{row.fullyClosed === true ? ' · закрыт' : ''}</p>
                        </article>
                      );
                    })}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-3">
                    <article className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-white/55">Тиры и корты</p>
                      <div className="mt-2 space-y-1.5">
                        {scheduleDiagnosticsModel.tiers.map((row) => (
                          <div key={String(row.tier)} className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-semibold capitalize text-white/75">{String(row.tier)}</span>
                            <span className={Number(row.fallbackAssignments ?? 0) > 0 ? 'text-amber-200' : 'text-white/45'}>{Number(row.assignmentCount ?? 0)} игр · fallback {Number(row.fallbackAssignments ?? 0)}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                    <article className="rounded-xl border border-white/10 bg-black/20 p-3 lg:col-span-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-white/55">Команды под нагрузкой</p>
                        <span className="text-[11px] text-white/40">показываются 6 самых напряжённых</span>
                      </div>
                      {scheduleDiagnosticsModel.pressureTeams.length ? (
                        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          {scheduleDiagnosticsModel.pressureTeams.map((row) => (
                            <div key={String(row.teamId)} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.035] px-2.5 py-2 text-xs">
                              <span className="truncate font-semibold text-white/70">{entryLabel(String(row.teamId ?? ''))}</span>
                              <span className={Number(row.softRestDeficitMinutes ?? 0) > 0 ? 'text-amber-200' : 'text-white/45'}>rest min {row.minRestMinutes == null ? '—' : Number(row.minRestMinutes)} · wait {Number(row.maxWaitMinutes ?? 0)}</span>
                            </div>
                          ))}
                        </div>
                      ) : <p className="mt-2 text-xs text-white/40">Дефицита отдыха не обнаружено.</p>}
                    </article>
                  </div>
                  <p className="text-[11px] text-white/40">Судейская нагрузка: min {Number(scheduleDiagnosticsModel.refereeBalance.minDuties ?? 0)}, max {Number(scheduleDiagnosticsModel.refereeBalance.maxDuties ?? 0)}, разброс {Number(scheduleDiagnosticsModel.refereeBalance.spread ?? 0)}.</p>
                </div>
              ) : null}
              {scheduleCourtLanes.length ? (
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-white">Линии кортов</h3>
                      <p className="mt-1 text-xs text-white/45">Быстрая проверка очереди, тиров и пустых интервалов перед публикацией.</p>
                    </div>
                    <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/55">{scheduleModel.assignments.length} матчей</span>
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {scheduleCourtLanes.map((lane) => (
                      <section key={`${lane.courtNo}-${lane.label}`} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                        <header className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-3 py-2.5">
                          <div>
                            <p className="text-sm font-bold text-white">{lane.label}</p>
                            <p className="text-[11px] text-white/45">{courtRoleLabel(lane.courtNo, courts.length, config.tierMode === 'three' || (config.tierMode === 'auto' && config.teamCount > 30) || (config.tierMode === 'manual' && config.tierQuotas.medium > 0))}</p>
                          </div>
                          <span className="text-xs font-semibold text-white/55">{lane.assignments.length}</span>
                        </header>
                        <div className="max-h-80 divide-y divide-white/10 overflow-y-auto">
                          {lane.assignments.map((assignment, assignmentIndex) => {
                            const assignmentMatchId = String(assignment.matchId ?? '');
                            const match = matches.find((item) => String(item.id) === assignmentMatchId);
                            const tier = String(assignment.tier ?? match?.tier ?? '').toLowerCase();
                            const start = assignment.liveEta ?? assignment.start ?? assignment.plannedStart;
                            return (
                              <div key={`${assignmentMatchId}-${assignmentIndex}`} className={cx('grid grid-cols-[68px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5', assignment.conditional === true || assignment.isConditional === true ? 'bg-amber-500/[0.06]' : '')}>
                                <span className="font-mono text-xs font-bold text-white/75">{formatScheduleTime(start)}</span>
                                <span className="truncate text-xs text-white/80">{match ? matchLabel(match) : assignmentMatchId}</span>
                                {tier ? <span className={cx('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase', tier === 'hard' ? 'border-red-300/25 text-red-100' : tier === 'light' ? 'border-emerald-300/25 text-emerald-100' : 'border-amber-300/25 text-amber-100')}>{tier}</span> : null}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              ) : null}
              {scheduleModel.assignments.length ? (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="min-w-[820px] w-full border-collapse text-left text-sm">
                    <thead className="bg-white/[0.055] text-[11px] uppercase tracking-wide text-white/45">
                      <tr><th className="px-3 py-3">Время</th><th className="px-3 py-3">Корт</th><th className="px-3 py-3">Матч</th><th className="px-3 py-3">Длит.</th><th className="px-3 py-3">Судейство</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {[...scheduleModel.assignments].sort((left, right) => Date.parse(String(left.start ?? left.plannedStart ?? '')) - Date.parse(String(right.start ?? right.plannedStart ?? ''))).map((assignment, index) => {
                        const assignmentMatchId = String(assignment.matchId ?? '');
                        const match = matches.find((item) => String(item.id) === assignmentMatchId);
                        const start = assignment.liveEta ?? assignment.start ?? assignment.plannedStart;
                        const end = assignment.end ?? assignment.plannedEnd;
                        const referee = asRecord(assignment.referee ?? assignment.refereeDuty);
                        const refereeKind = String(referee.kind ?? referee.dutyKind ?? 'none');
                        const refereeEntryId = String(referee.refereeEntryId ?? (Array.isArray(referee.reservedTeamIds) ? referee.reservedTeamIds[0] ?? '' : ''));
                        const courtNo = Number(assignment.courtNo ?? String(assignment.courtId ?? '').replace(/^court-/, ''));
                        const court = courts.find((item) => item.courtNo === courtNo);
                        const refereeLabel = refereeKind === 'staff' || refereeKind === 'court_judge'
                          ? 'Судья корта'
                          : refereeKind === 'entry' || refereeKind === 'fixed_team'
                            ? entryLabel(refereeEntryId)
                            : refereeKind === 'loser_previous_same_court'
                              ? 'Проигравший предыдущий матч'
                              : '—';
                        return (
                          <tr key={`${assignmentMatchId}-${index}`} className={assignment.conditional === true || assignment.isConditional === true ? 'bg-amber-500/[0.055]' : 'bg-black/10'}>
                            <td className="whitespace-nowrap px-3 py-3 font-bold text-white">{formatScheduleTime(start)}<span className="block text-xs font-normal text-white/35">до {formatScheduleTime(end)}</span></td>
                            <td className="whitespace-nowrap px-3 py-3 text-white/75">{String(assignment.courtLabel ?? court?.label ?? (Number.isFinite(courtNo) ? `Корт ${courtNo}` : assignment.courtId ?? '—'))}</td>
                            <td className="max-w-md px-3 py-3"><span className="block font-semibold text-white">{match ? matchLabel(match) : assignmentMatchId}</span>{assignment.conditional === true || assignment.isConditional === true ? <span className="mt-1 inline-block text-xs text-amber-200">Условный reset-финал</span> : null}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-white/60">{Number(assignment.durationMinutes ?? Math.max(0, (Date.parse(String(end)) - Date.parse(String(start))) / 60_000))} мин</td>
                            <td className="px-3 py-3 text-white/60">{refereeLabel}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <div className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-white/45">Солвер не вернул назначений.</div>}
              <details className="rounded-xl border border-white/10 bg-black/20 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-white/65">Технические данные расписания</summary>
                <pre className="mt-3 max-h-[620px] overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-white/65">{formatJson(schedulePreview ?? activeSchedule)}</pre>
              </details>
            </>
          ) : <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/45">Расписание ещё не рассчитано.</div>}
        </section>
      ) : null}

      {activeTab === 'live' ? (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-[#0f131d]/95 p-4 md:p-5">
          <div>
            <h2 className="text-lg font-bold text-white">Управление турнирным днём</h2>
            <p className="mt-1 text-sm leading-6 text-white/55">Присутствие не создаёт технический результат автоматически. Погода и закрытие корта сначала дают impact preview; LIVE-матч ставится на паузу, но не завершается без решения директора.</p>
          </div>

          <div className={cx(
            'rounded-xl border p-4',
            finishReviewMatches.length
              ? 'border-emerald-300/30 bg-emerald-500/[0.075]'
              : 'border-white/10 bg-white/[0.025]',
          )}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">Запросы судей на завершение</h3>
                <p className="mt-1 text-xs leading-5 text-white/55">Директор подтверждает только серверный счёт. Победитель, результат и маршруты сетки вычисляются повторно на сервере.</p>
              </div>
              <span className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70">
                Ожидают: {finishReviewMatches.length}
              </span>
            </div>
            {finishReviewMatches.length ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {finishReviewMatches.map((match) => {
                  const reviewedMatchId = String(match.id ?? '');
                  return (
                    <article key={reviewedMatchId} className="rounded-xl border border-emerald-300/25 bg-black/25 p-3">
                      <p className="text-sm font-bold text-white">{matchLabel(match)}</p>
                      <p className="mt-2 text-lg font-black text-emerald-100">{liveScoreLabel(match)}</p>
                      <p className="mt-1 text-xs text-white/45">Состояние: {String(match.playState)} · judge version {Number(match.commandVersion)}</p>
                      <label className="mt-3 block space-y-2">
                        <FieldLabel>Комментарий директора</FieldLabel>
                        <input
                          value={finishReviewNotes[reviewedMatchId] ?? ''}
                          onChange={(event) => setFinishReviewNotes((current) => ({
                            ...current,
                            [reviewedMatchId]: event.target.value,
                          }))}
                          placeholder="Обязателен при отклонении"
                          className="min-h-11 w-full rounded-lg border border-white/15 bg-black/25 px-3 text-sm text-white"
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void decideFinishReview(match, 'accept')}
                          disabled={Boolean(pendingAction)}
                          className="min-h-11 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-white disabled:opacity-50"
                        >
                          Подтвердить результат
                        </button>
                        <button
                          type="button"
                          onClick={() => void decideFinishReview(match, 'reject')}
                          disabled={Boolean(pendingAction)}
                          className="min-h-11 rounded-lg border border-red-300/35 bg-red-500/10 px-4 text-sm font-semibold text-red-100 disabled:opacity-50"
                        >
                          Отклонить
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 rounded-lg border border-dashed border-white/15 p-3 text-sm text-white/45">Новых запросов нет.</p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-base font-bold text-white">Check-in и опоздания</h3><p className="mt-1 text-xs leading-5 text-white/50">Открытие: за {Number(attendancePolicy.checkInOpenMinutesBefore ?? 60)} мин · дедлайн: за {Number(attendancePolicy.checkInDeadlineMinutesBefore ?? 15)} мин · grace: {Number(attendancePolicy.gracePeriodMinutes ?? 5)} мин.</p></div>
              <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100">Технический результат — только через инцидент</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2"><FieldLabel>Команда</FieldLabel><select value={attendanceEntryId} onChange={(event) => setAttendanceEntryId(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="">Выберите команду</option>{entries.map((entry) => { const entryId = String(entry.id ?? entry.entryId ?? ''); return <option key={entryId} value={entryId}>{entryOptionLabel(entryId, entry)} · {String(entry.attendanceState ?? 'unknown')}</option>; })}</select></label>
              <label className="space-y-2"><FieldLabel>Новый статус</FieldLabel><select value={attendanceState} onChange={(event) => setAttendanceState(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="confirmed">Подтвердил участие</option><option value="checked_in">Прибыл / checked-in</option><option value="late_hold">Опаздывает, слот удерживать</option><option value="no_show">Неявка после grace</option></select></label>
              <label className="space-y-2"><FieldLabel>Фактическое время · {config.timezone}</FieldLabel><input type="datetime-local" value={attendanceEffectiveAt} onChange={(event) => setAttendanceEffectiveAt(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
              <label className="space-y-2"><FieldLabel>Причина / комментарий</FieldLabel><input value={attendanceNote} onChange={(event) => setAttendanceNote(event.target.value)} placeholder="Обязательно для late/no-show" className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void previewAttendance()} disabled={Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Attendance preview</button><button type="button" onClick={() => void commitAttendance()} disabled={!attendancePreview || Boolean(pendingAction)} className="min-h-11 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50">Сохранить статус</button></div>
            {attendancePreview ? <pre className={`mt-3 max-h-72 overflow-auto rounded-xl border p-3 text-xs text-white/70 ${attendancePreview.risk === 'red' ? 'border-red-400/35 bg-red-500/10' : 'border-white/10 bg-black/25'}`}>{formatJson(attendancePreview)}</pre> : null}
          </div>

          <div className="rounded-xl border border-amber-300/20 bg-amber-500/[0.045] p-4">
            <h3 className="text-base font-bold text-white">Паузы, погода и недоступность корта</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2"><FieldLabel>Событие</FieldLabel><select value={disruptionKind} onChange={(event) => setDisruptionKind(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="court_close">Закрыть корт</option><option value="court_damage">Повреждение корта</option><option value="rain_hold">Дождь</option><option value="lightning_hold">Гроза / молния</option><option value="medical_delay">Медицинская задержка</option><option value="security_pause">Пауза безопасности</option><option value="global_pause">Общая пауза</option></select></label>
              <label className="space-y-2"><FieldLabel>Физический корт</FieldLabel><select value={disruptionCourtId} onChange={(event) => setDisruptionCourtId(event.target.value)} disabled={!['court_close', 'court_damage'].includes(disruptionKind)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white disabled:opacity-40"><option value="">Выберите корт</option>{persistedCourts.map((court) => <option key={String(court.id)} value={String(court.id)}>{String(court.label ?? `Корт ${court.courtNo ?? ''}`)}</option>)}</select></label>
              <label className="space-y-2"><FieldLabel>Матч для medical delay</FieldLabel><select value={disruptionMatchId} onChange={(event) => setDisruptionMatchId(event.target.value)} disabled={disruptionKind !== 'medical_delay'} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white disabled:opacity-40"><option value="">Выберите матч</option>{matches.filter((match) => ['ready', 'live', 'paused'].includes(String(match.playState ?? ''))).map((match) => <option key={String(match.id)} value={String(match.id)}>{matchLabel(match)}</option>)}</select></label>
              <label className="space-y-2"><FieldLabel>Начало · {config.timezone}</FieldLabel><input type="datetime-local" value={disruptionStartsAt} onChange={(event) => setDisruptionStartsAt(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
              <label className="space-y-2"><FieldLabel>Ожидаемое окончание · {config.timezone}</FieldLabel><input type="datetime-local" value={disruptionExpectedEndAt} onChange={(event) => setDisruptionExpectedEndAt(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
            </div>
            <label className="mt-3 block space-y-2"><FieldLabel>Причина и решение на месте</FieldLabel><textarea value={disruptionNote} onChange={(event) => setDisruptionNote(event.target.value)} rows={2} placeholder="Что произошло; кто подтвердил; перенос или ожидание" className="w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" /></label>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void previewDisruption()} disabled={Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Impact preview</button><button type="button" onClick={() => void commitDisruption()} disabled={!disruptionPreview || Boolean(pendingAction)} className="min-h-11 rounded-xl bg-amber-500 px-4 text-sm font-bold text-slate-950 disabled:opacity-50">Записать событие</button></div>
            <OperationImpactSummary value={disruptionPreview} title="Impact preview нового события" />
            {activeDisruptions.length ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-white/45">Активные события</p>
                {activeDisruptions.map((item, index) => {
                  const disruptionId = String(item.id ?? index);
                  return (
                    <div key={disruptionId} className="flex flex-col gap-2 rounded-xl border border-amber-300/20 bg-black/20 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-amber-50">{String(item.disruptionKind ?? item.kind ?? 'disruption')}</p>
                        <p className="mt-1 break-words text-xs text-white/50">{String(item.courtLabel ?? item.courtId ?? 'все корты')} · {formatScheduleTime(item.startsAt)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setDisruptionResolutionId(disruptionId); setDisruptionResolutionPreview(null); }}
                        className="min-h-11 rounded-lg border border-amber-300/30 px-3 text-xs font-semibold text-amber-100"
                      >
                        Закрыть / отменить
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : <p className="mt-4 rounded-lg border border-dashed border-white/15 p-3 text-sm text-white/45">Активных disruption нет.</p>}
            {disruptionResolutionId ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-white">Разрешить disruption</h4>
                    <p className="mt-1 text-xs leading-5 text-white/50">Закрытие не возобновляет матчи автоматически. Каждая пауза решается отдельно.</p>
                  </div>
                  <span className="rounded-full border border-red-300/25 px-2.5 py-1 text-[11px] font-semibold text-red-100">Только director</span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="space-y-2"><FieldLabel>Решение</FieldLabel><select value={disruptionResolution} onChange={(event) => setDisruptionResolution(event.target.value as 'resolved' | 'cancelled')} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="resolved">Условия нормализовались</option><option value="cancelled">Событие создано ошибочно</option></select></label>
                  <label className="space-y-2"><FieldLabel>Основание</FieldLabel><input value={disruptionResolutionNote} onChange={(event) => setDisruptionResolutionNote(event.target.value)} placeholder="Кто проверил корт / погоду" className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => void previewDisruptionResolution()} disabled={Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Preview закрытия</button><button type="button" onClick={() => void commitDisruptionResolution()} disabled={!disruptionResolutionPreview || Boolean(pendingAction)} className="min-h-11 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white disabled:opacity-50">Подтвердить</button></div>
                <OperationImpactSummary value={disruptionResolutionPreview} title="Что изменится при закрытии" />
              </div>
            ) : null}
            <OperationImpactSummary value={disruptionResolutionReceipt} title="Disruption закрыт: серверная receipt" />
          </div>

          <div className="rounded-xl border border-violet-300/20 bg-violet-500/[0.045] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-base font-bold text-white">Решение по приостановленному матчу</h3><p className="mt-1 text-xs leading-5 text-white/50">Возврат на тот же корт, перенос или defer всегда проходят preview общей ScheduleSession.</p></div>
              <span className="rounded-full border border-red-300/25 px-2.5 py-1 text-[11px] font-semibold text-red-100">Только director</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2"><FieldLabel>Матч на паузе</FieldLabel><select value={pauseMatchId} onChange={(event) => setPauseMatchId(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="">Выберите матч</option>{pausedMatches.map((match) => <option key={String(match.id)} value={String(match.id)}>{matchLabel(match)}</option>)}</select></label>
              <label className="space-y-2"><FieldLabel>Решение</FieldLabel><select value={pauseDecision} onChange={(event) => setPauseDecision(event.target.value as PauseResolutionDecision)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="resume_same_court">Возобновить на том же корте</option><option value="transfer">Перенести на другой корт</option><option value="defer">Отложить матч</option></select></label>
              <label className="space-y-2"><FieldLabel>Связанный disruption</FieldLabel><select value={pauseDisruptionId} onChange={(event) => setPauseDisruptionId(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="">Без связи</option>{activeDisruptions.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.disruptionKind ?? item.kind ?? item.id)}</option>)}</select></label>
              <label className="space-y-2"><FieldLabel>Новый корт</FieldLabel><select value={pauseTargetCourtId} onChange={(event) => setPauseTargetCourtId(event.target.value)} disabled={pauseDecision !== 'transfer'} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white disabled:opacity-40"><option value="">Выберите корт</option>{persistedCourts.filter((court) => String(court.id) !== pauseSourceCourtId).map((court) => <option key={String(court.id)} value={String(court.id)}>{String(court.label ?? `Корт ${court.courtNo ?? ''}`)}</option>)}</select>{pauseSourceCourtId ? <span className="block text-xs text-white/40">Текущий корт исключён из списка переноса.</span> : null}</label>
            </div>
            {pauseDecision === 'defer' ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="space-y-2"><FieldLabel>Куда отложить</FieldLabel><select value={pauseDeferMode} onChange={(event) => setPauseDeferMode(event.target.value as 'not_before' | 'end_of_queue')} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="not_before">Не раньше указанного времени</option><option value="end_of_queue">В конец очереди</option></select></label>
                <label className="space-y-2"><FieldLabel>Не раньше · {config.timezone}</FieldLabel><input type="datetime-local" value={pauseResumeNotBefore} onChange={(event) => setPauseResumeNotBefore(event.target.value)} disabled={pauseDeferMode === 'end_of_queue'} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white disabled:opacity-40" /></label>
              </div>
            ) : pauseDecision === 'transfer' ? <label className="mt-3 block max-w-xl space-y-2"><FieldLabel>Не раньше · {config.timezone}</FieldLabel><input type="datetime-local" value={pauseResumeNotBefore} onChange={(event) => setPauseResumeNotBefore(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label> : null}
            <label className="mt-3 block space-y-2"><FieldLabel>Решение директора</FieldLabel><textarea value={pauseNote} onChange={(event) => setPauseNote(event.target.value)} rows={2} placeholder="Что случилось и почему выбрано это действие" className="w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" /></label>
            {!pausedMatches.length ? <p className="mt-3 rounded-lg border border-dashed border-white/15 p-3 text-sm text-white/45">Приостановленных матчей нет.</p> : null}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap"><button type="button" onClick={() => void previewPauseResolution()} disabled={!pausedMatches.length || Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Preview решения</button><button type="button" onClick={() => void commitPauseResolution()} disabled={!pauseResolutionPreview || Boolean(pendingAction)} className="min-h-11 rounded-xl bg-violet-500 px-4 text-sm font-bold text-white disabled:opacity-50">Применить</button><button type="button" onClick={openIncompleteIncidentForPausedMatch} disabled={!pauseMatchId || Boolean(pendingAction)} className="min-h-11 rounded-xl border border-amber-300/30 px-4 text-sm font-semibold text-amber-100 disabled:opacity-50">Завершить как incomplete…</button></div>
            <p className="mt-2 text-xs leading-5 text-white/45">Incomplete — это спортивный исход, поэтому он оформляется через каскадный incident preview, а не как простое возобновление.</p>
            <OperationImpactSummary value={pauseResolutionPreview} title="Итоговое расписание до commit" />
            <OperationImpactSummary value={pauseResolutionReceipt} title="Решение применено: серверная receipt" />
          </div>

          <div className="rounded-xl border border-sky-300/20 bg-sky-500/[0.045] p-4">
            <div><h3 className="text-base font-bold text-white">Судейские устройства</h3><p className="mt-1 text-xs leading-5 text-white/50">На корте ровно один активный writer. Токен показывается только один раз, хранится на сервере только его хэш и автоматически истекает.</p></div>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_150px_auto]">
              <label className="space-y-2"><FieldLabel>Корт</FieldLabel><select value={grantCourtId} onChange={(event) => setGrantCourtId(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="">Выберите корт</option>{persistedCourts.map((court) => <option key={String(court.id)} value={String(court.id)}>{String(court.label ?? `Корт ${court.courtNo ?? ''}`)}</option>)}</select></label>
              <label className="space-y-2"><FieldLabel>Код устройства судьи</FieldLabel><input value={grantDeviceId} onChange={(event) => setGrantDeviceId(event.target.value)} placeholder="judge-web-… с экрана судьи" className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 font-mono text-xs text-white" /></label>
              <label className="space-y-2"><FieldLabel>TTL, минут</FieldLabel><input inputMode="numeric" value={grantTtlMinutes} onChange={(event) => setGrantTtlMinutes(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
              <button type="button" onClick={() => void issueCourtGrant()} disabled={Boolean(pendingAction) || !persistedCourts.length} className="min-h-11 self-end rounded-xl bg-sky-500 px-4 text-sm font-bold text-white disabled:opacity-50">Назначить</button>
            </div>
            {!persistedCourts.length ? <p className="mt-3 rounded-xl border border-dashed border-white/15 p-3 text-sm text-white/45">Сначала опубликуйте расписание: физические court ID создаются вместе с ScheduleSession.</p> : null}
            {issuedGrant?.token ? (
              <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-4">
                <p className="font-bold text-emerald-50">Скопируйте сейчас — повторно токен не показывается</p>
                <code className="mt-2 block break-all rounded-lg bg-black/25 p-3 text-xs text-emerald-100">{String(issuedGrant.token)}</code>
                <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void navigator.clipboard.writeText(String(issuedGrant.token))} className="min-h-11 rounded-xl border border-emerald-300/30 px-4 text-sm font-semibold">Копировать токен</button><button type="button" onClick={() => void navigator.clipboard.writeText(issuedJudgeUrl())} className="min-h-11 rounded-xl bg-emerald-500 px-4 text-sm font-bold">Копировать защищённую ссылку</button></div>
              </div>
            ) : null}
            {activeCourtGrants.length ? <div className="mt-4 grid gap-2 md:grid-cols-2">{activeCourtGrants.map((grant) => <div key={String(grant.grantId ?? grant.id)} className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-sm font-bold text-white">{String(persistedCourts.find((court) => String(court.id) === String(grant.courtId))?.label ?? grant.courtId)}</p><p className="mt-1 break-all text-xs text-white/50">{String(grant.deviceId)} · token {String(grant.tokenPrefix ?? '')}… · до {grant.expiresAt ? new Date(String(grant.expiresAt)).toLocaleString('ru-RU') : '—'}</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => void issueCourtGrant(grant)} disabled={Boolean(pendingAction)} className="min-h-10 rounded-lg border border-sky-300/30 px-3 text-xs font-semibold text-sky-100 disabled:opacity-50">Rotate</button><button type="button" onClick={() => void revokeCourtGrant(grant)} disabled={Boolean(pendingAction)} className="min-h-10 rounded-lg border border-red-300/30 px-3 text-xs font-semibold text-red-100 disabled:opacity-50">Отозвать</button></div></div>)}</div> : null}
          </div>

          <div className="rounded-xl border border-red-400/25 bg-red-500/[0.055] p-4">
            <h3 className="text-base font-bold text-white">Второй approver для red-risk</h3>
            <p className="mt-1 text-xs leading-5 text-white/55">Автор preview передаёт Preview ID другому пользователю роли admin. Второй пользователь сначала загружает payload, diff и downstream impact, затем отдельно подтверждает согласование. Самосогласование сервер блокирует.</p>
            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <input value={approvalPreviewId} onChange={(event) => { setApprovalPreviewId(event.target.value); setApprovalReview(null); setConfirmApprovalReview(false); }} placeholder="Preview UUID от другого администратора" className="min-h-11 rounded-xl border border-white/15 bg-black/25 px-3 font-mono text-xs text-white" />
              <button type="button" onClick={() => void reviewRedOperation()} disabled={Boolean(pendingAction)} className="min-h-11 rounded-xl border border-red-300/35 px-4 text-sm font-semibold text-red-100 disabled:opacity-50">Проверить impact</button>
              <button type="button" onClick={() => void approveRedOperation()} disabled={Boolean(pendingAction) || !approvalReview || !confirmApprovalReview} className="min-h-11 rounded-xl bg-red-500 px-4 text-sm font-bold text-white disabled:opacity-50">Согласовать</button>
            </div>
            {approvalReview ? <div className="mt-3 space-y-3"><pre className="max-h-80 overflow-auto rounded-lg border border-red-300/20 bg-black/25 p-3 text-xs text-white/75">{formatJson(approvalReview)}</pre><label className="flex min-h-11 items-center gap-3 rounded-xl border border-red-300/25 bg-red-500/10 px-3 text-sm font-semibold text-red-50"><input type="checkbox" checked={confirmApprovalReview} onChange={(event) => setConfirmApprovalReview(event.target.checked)} />Я проверил изменения участников, маршрутов, расписания и уже начатых матчей</label></div> : null}
            <label className="mt-3 block space-y-2"><FieldLabel>Approval ID для commit</FieldLabel><div className="flex gap-2"><input value={redApprovalId} onChange={(event) => setRedApprovalId(event.target.value)} placeholder="UUID согласования" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/25 px-3 font-mono text-xs text-white" /><button type="button" onClick={() => void navigator.clipboard.writeText(redApprovalId)} disabled={!redApprovalId} className="min-h-11 rounded-xl border border-white/20 px-3 text-xs font-semibold disabled:opacity-40">Копировать</button></div></label>
            {approvalResult ? <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-white/70">{formatJson(approvalResult)}</pre> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'incidents' ? (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-[#0f131d]/95 p-4 md:p-5">
          <div className="rounded-xl border border-violet-300/20 bg-violet-500/[0.055] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">Поднять команду из резерва</h3>
                <p className="mt-1 max-w-3xl text-sm leading-5 text-white/55">
                  До жеребьёвки резерв занимает свободную квоту и пересчитывает seed. После lock он получает только выбранный освободившийся слот; опубликованное расписание меняется исключительно по замороженному preview.
                </p>
              </div>
              <span className="rounded-full border border-red-300/25 px-2.5 py-1 text-[11px] font-semibold text-red-100">Только director</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-2">
                <FieldLabel>Резервная команда</FieldLabel>
                <select value={reserveEntryId} onChange={(event) => setReserveEntryId(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white">
                  <option value="">Выберите waitlist-команду</option>
                  {waitlistEntries.map((entry) => { const entryId = String(entry.id ?? entry.entryId ?? ''); return <option key={entryId} value={entryId}>{entryOptionLabel(entryId, entry)}</option>; })}
                </select>
              </label>
              {reserveNeedsTarget ? (
                <label className="space-y-2">
                  <FieldLabel>Освободившийся слот</FieldLabel>
                  <select value={reserveTargetEntryId} onChange={(event) => setReserveTargetEntryId(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white">
                    <option value="">Выберите withdrawn / no-show команду</option>
                    {reserveTargetEntries.map((entry) => { const entryId = String(entry.id ?? entry.entryId ?? ''); return <option key={entryId} value={entryId}>{entryOptionLabel(entryId, entry)} · {String(entry.registrationState ?? '') === 'withdrawn' ? 'снята' : 'no-show'}</option>; })}
                  </select>
                </label>
              ) : (
                <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs leading-5 text-emerald-100">
                  Перед draw lock сервер проверит вакансию в неизменяемой квоте и покажет полный новый seed. Расширить квоту этим действием нельзя.
                </div>
              )}
              <label className="space-y-2 md:col-span-2">
                <FieldLabel>Основание директора</FieldLabel>
                <input value={reservePromotionNote} onChange={(event) => setReservePromotionNote(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white" />
              </label>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="button" onClick={() => void previewReservePromotion()} disabled={!waitlistEntries.length || Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Preview поднятия резерва</button>
              <button type="button" onClick={() => void commitReservePromotion()} disabled={!reservePromotionPreview || Boolean(pendingAction) || (reservePromotionPreview.risk === 'red' && !redApprovalId.trim())} className="min-h-11 rounded-xl bg-violet-500 px-4 text-sm font-bold text-white disabled:opacity-50">Поднять и опубликовать schedule</button>
            </div>
            {reservePromotionPreview?.risk === 'red' ? <p className="mt-3 rounded-lg border border-red-300/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">Слот уже находится в опубликованной shared-session. Нужен второй отличающийся администратор, подтвердивший именно этот scheduleHash.</p> : null}
            <OperationImpactSummary value={reservePromotionPreview} title="Seed, слот и точное successor schedule" />
            {reservePromotions.length ? (
              <details className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-white/65">История поднятия резервов ({reservePromotions.length})</summary>
                <div className="mt-3 space-y-2 text-xs text-white/55">
                  {reservePromotions.slice(0, 8).map((item, index) => <p key={String(item.id ?? index)}>{String(item.promotionMode ?? 'promotion')} · {entryLabel(String(item.reserveEntryId ?? ''))}{item.targetEntryId ? ` вместо ${entryLabel(String(item.targetEntryId))}` : ''}</p>)}
                </div>
              </details>
            ) : null}
          </div>
          <div className="rounded-xl border border-orange-400/20 bg-orange-500/[0.06] p-4">
            <h3 className="text-base font-bold text-white">Замена игрока</h3>
            <p className="mt-1 text-sm leading-5 text-white/55">До draw lock пересчитываются рейтинг и seed. После lock слот сохраняется; сыгранные lineup snapshots не меняются.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2"><FieldLabel>Команда</FieldLabel><select value={replacementEntryId} onChange={(event) => { setReplacementEntryId(event.target.value); setReplacementPreview(null); }} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="">Выберите команду</option>{entries.map((entry) => { const entryId = String(entry.id ?? entry.entryId ?? ''); return <option key={entryId} value={entryId}>{entryOptionLabel(entryId, entry)}</option>; })}</select></label>
              <label className="space-y-2"><FieldLabel>Позиция в паре</FieldLabel><select value={replaceMemberOrder} onChange={(event) => { setReplaceMemberOrder(Number(event.target.value)); setReplacementPreview(null); }} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value={1}>Игрок 1</option><option value={2}>Игрок 2</option></select></label>
              <label className="space-y-2"><FieldLabel>Player UUID</FieldLabel><input value={replacementPlayerId} onChange={(event) => { setReplacementPlayerId(event.target.value); setReplacementPreview(null); }} placeholder="Если игрок есть в базе" className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
              <label className="space-y-2"><FieldLabel>Имя игрока</FieldLabel><input value={replacementPlayerName} onChange={(event) => { setReplacementPlayerName(event.target.value); setReplacementPreview(null); }} placeholder="ФИО для локальной записи" className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
              <label className="space-y-2"><FieldLabel>Рейтинг</FieldLabel><input inputMode="numeric" value={replacementRating} onChange={(event) => { setReplacementRating(event.target.value); setReplacementPreview(null); }} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
              <label className="space-y-2"><FieldLabel>Политика после старта</FieldLabel><select value={replacementPolicy} onChange={(event) => { setReplacementPolicy(event.target.value); setReplacementPreview(null); }} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="LPV_LOCAL_ONE_PLAYER">LPVolley: один игрок со следующего матча</option><option value="FIVB_2026_NO_REPLACEMENT_AFTER_START">FIVB: запрет после первого матча</option></select></label>
              <label className="space-y-2 md:col-span-2"><FieldLabel>Причина замены</FieldLabel><input value={replacementNote} onChange={(event) => { setReplacementNote(event.target.value); setReplacementPreview(null); }} placeholder="Обязательный комментарий для audit" className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
            </div>
            <div className="mt-3 flex gap-2"><button type="button" onClick={() => void previewRosterReplacement()} disabled={Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Preview замены</button><button type="button" onClick={() => void commitRosterReplacement()} disabled={!replacementPreview || Boolean(pendingAction)} className="min-h-11 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50">Применить замену</button></div>
            {replacementPreview ? <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-white/70">{formatJson(replacementPreview)}</pre> : null}
          </div>
          <div className="rounded-xl border border-red-400/20 bg-red-500/[0.05] p-4">
            <h3 className="text-base font-bold text-white">Снятие команды</h3>
            <p className="mt-1 text-sm leading-5 text-white/55">Причина задаёт спортивный ledger. В FIVB-профиле травма до матча даёт проигравшему 1 MP, неявка или отказ — 0 MP; победитель получает rally ledger 0/0. Антидопинговая дисквалификация в незавершённой группе переписывает все матчи команды только после безопасного impact preview.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-2"><FieldLabel>Команда</FieldLabel><select value={withdrawalEntryId} onChange={(event) => { setWithdrawalEntryId(event.target.value); setWithdrawalPreview(null); }} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="">Выберите команду</option>{entries.filter((entry) => String(entry.registrationState) === 'confirmed').map((entry) => { const entryId = String(entry.id ?? entry.entryId ?? ''); return <option key={entryId} value={entryId}>{entryOptionLabel(entryId, entry)}</option>; })}</select></label>
              <label className="space-y-2"><FieldLabel>Политика standings</FieldLabel><select value={withdrawalPolicy} onChange={(event) => { setWithdrawalPolicy(event.target.value); setWithdrawalPreview(null); setConfirmRedWithdrawal(false); }} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="LPV_PRESERVE_PLAYED_FORFEIT_FUTURE">LPV: сохранить сыгранное, будущие — forfeit</option><option value="FIVB_2026_MATCH_LEDGER">FIVB 2026 ledger по причине</option><option value="LOCAL_REDUCE_TO_THREE_ANNUL_RESULTS">Локально: сократить 4→3, аннулировать матчи снятой</option><option value="LOCAL_FORFEIT_ALL">Локально: техническое поражение во всех матчах</option></select></label>
              <label className="space-y-2 md:col-span-2"><FieldLabel>Спортивная причина</FieldLabel><select value={withdrawalCause} onChange={(event) => { setWithdrawalCause(event.target.value); setWithdrawalPreview(null); setConfirmRedWithdrawal(false); }} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="injury_before_match">Травма непосредственно до матча — FIVB loser 1 MP</option><option value="medical_withdrawal">Медицинское снятие с будущих матчей — FIVB loser 1 MP</option><option value="no_show">Неявка — FIVB loser 0 MP</option><option value="refusal_to_play">Отказ играть — FIVB loser 0 MP</option><option value="game_disqualification_future">Игровая дисквалификация: только будущие матчи, текущий — через инцидент</option><option value="anti_doping_disqualification">Антидопинговая дисквалификация</option><option value="administrative_withdrawal">Административное снятие</option></select></label>
              <label className="space-y-2 md:col-span-2"><FieldLabel>Причина снятия</FieldLabel><input value={withdrawalNote} onChange={(event) => { setWithdrawalNote(event.target.value); setWithdrawalPreview(null); }} placeholder="Неявка, травма, дисквалификация — основание для audit" className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
            </div>
            {withdrawalPreview?.risk === 'red' ? <label className="mt-3 flex min-h-11 items-center gap-3 rounded-xl border border-red-400/35 bg-red-500/10 px-3 text-sm font-semibold text-red-100"><input type="checkbox" checked={confirmRedWithdrawal} onChange={(event) => setConfirmRedWithdrawal(event.target.checked)} />Подтверждаю перезапись сыгранных результатов и проверил impact preview</label> : null}
            <div className="mt-3 flex gap-2"><button type="button" onClick={() => void previewEntryWithdrawal()} disabled={Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Preview снятия</button><button type="button" onClick={() => void commitEntryWithdrawal()} disabled={!withdrawalPreview || Boolean(pendingAction)} className="min-h-11 rounded-xl bg-red-500 px-4 text-sm font-bold text-white disabled:opacity-50">Снять команду</button></div>
            {withdrawalPreview ? <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-white/70">{formatJson(withdrawalPreview)}</pre> : null}
          </div>
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/[0.05] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">Команда появилась после no-show</h3>
                <p className="mt-1 max-w-3xl text-sm leading-5 text-white/55">Выберите, сохранить ли уже присуждённые результаты или компенсирующей ревизией вернуть матчи в очередь. Технический результат никогда не удаляется из истории.</p>
              </div>
              <span className="rounded-full border border-red-300/25 px-2.5 py-1 text-[11px] font-semibold text-red-100">Только director</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <FieldLabel>Вернувшаяся команда</FieldLabel>
                <select value={reinstatementEntryId} onChange={(event) => setReinstatementEntryId(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white">
                  <option value="">Выберите no-show команду</option>
                  {noShowEntries.map((entry) => { const entryId = String(entry.id ?? entry.entryId ?? ''); return <option key={entryId} value={entryId}>{entryOptionLabel(entryId, entry)}</option>; })}
                </select>
              </label>
              <label className="space-y-2 xl:col-span-2">
                <FieldLabel>Что делать с присуждёнными матчами</FieldLabel>
                <select value={reinstatementDecision} onChange={(event) => setReinstatementDecision(event.target.value as 'keep_awarded_result' | 'overturn_and_cascade')} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white">
                  <option value="keep_awarded_result">Сохранить результаты, допустить только к будущим матчам</option>
                  <option value="overturn_and_cascade">Отменить присуждение новой ревизией и пересобрать downstream</option>
                </select>
              </label>
              <label className="space-y-2">
                <FieldLabel>Новый attendance</FieldLabel>
                <select value={reinstatementTargetState} onChange={(event) => setReinstatementTargetState(event.target.value as 'checked_in' | 'late_hold')} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="checked_in">Прибыла / checked-in</option><option value="late_hold">Опоздала, слот удерживать</option></select>
              </label>
              <label className="space-y-2 md:col-span-2 xl:col-span-4"><FieldLabel>Основание директора</FieldLabel><input value={reinstatementNote} onChange={(event) => setReinstatementNote(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white" /></label>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="button" onClick={() => void previewAttendanceReinstatement()} disabled={!noShowEntries.length || Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Preview возврата</button>
              <button type="button" onClick={() => void commitAttendanceReinstatement()} disabled={!reinstatementPreview || Boolean(pendingAction) || (reinstatementPreview.risk === 'red' && !redApprovalId.trim())} className="min-h-11 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white disabled:opacity-50">Вернуть команду</button>
            </div>
            {reinstatementDecision === 'overturn_and_cascade' ? <p className="mt-3 rounded-lg border border-red-300/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">Это всегда red-операция: меняется победитель завершённого технического матча. Commit доступен только после approval второго администратора по этому inputHash.</p> : <p className="mt-3 rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs leading-5 text-emerald-100">Ранее присуждённые результаты остаются в силе; сервер пересчитает только будущую доступность и расписание.</p>}
            <OperationImpactSummary value={reinstatementPreview} title="Результаты, маршруты, standings и successor schedule" />
            {attendanceReinstatements.length ? <details className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3"><summary className="cursor-pointer text-xs font-semibold text-white/65">История возвратов ({attendanceReinstatements.length})</summary><div className="mt-3 space-y-2 text-xs text-white/55">{attendanceReinstatements.slice(0, 8).map((item, index) => <p key={String(item.eventId ?? index)}>{entryLabel(String(item.entryId ?? ''))} · {String(item.decision ?? '')} · {String(item.toState ?? '')}</p>)}</div></details> : null}
          </div>
          <div><h2 className="text-lg font-bold text-white">Инцидент и каскад</h2><p className="mt-1 text-sm text-white/55">Неявка, травма или исправление счёта сначала показывают downstream impact.</p></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2"><FieldLabel>Матч</FieldLabel><select value={matchId} onChange={(event) => { setMatchId(event.target.value); setIncidentEntryId(''); setIncidentPreview(null); }} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="">Выберите матч</option>{matches.map((match) => <option key={String(match.id)} value={String(match.id)}>{matchLabel(match)}</option>)}</select></label>
            <label className="space-y-2"><FieldLabel>Команда инцидента</FieldLabel><select value={incidentEntryId} onChange={(event) => { setIncidentEntryId(event.target.value); setIncidentPreview(null); }} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="">Не выбрана / обе команды</option>{incidentEntryOptions.map((entry) => { const entryId = String(entry.id ?? entry.entryId ?? ''); return <option key={entryId} value={entryId}>{entryOptionLabel(entryId, entry)}</option>; })}</select></label>
            <label className="space-y-2"><FieldLabel>Результат</FieldLabel><select value={incidentKind} onChange={(event) => setIncidentKind(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="walkover">Техническая победа / неявка</option><option value="forfeit">Отказ</option><option value="incomplete">Матч не завершён</option><option value="mutual_no_show">Обе команды не явились</option><option value="voided">Аннулирование</option><option value="admin_award">Административный результат</option></select></label>
            <label className="space-y-2"><FieldLabel>Причина</FieldLabel><select value={incidentReason} onChange={(event) => setIncidentReason(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="admin_override">Admin override</option><option value="referee_typo">Ошибка судьи</option><option value="protest_accepted">Протест принят</option><option value="injury_retirement">Травма</option><option value="no_show">Неявка</option><option value="disqualification">Дисквалификация</option></select></label>
          </div>
          <label className="block max-w-xl space-y-2"><FieldLabel>Вклад технического результата в standings</FieldLabel><select value={technicalStandingProfile} onChange={(event) => setTechnicalStandingProfile(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="LPV_DECLARED_SCORE">LPVolley: объявленный счёт полностью</option><option value="FIVB_2026_MATCH_LEDGER">FIVB ledger: победителю rally 0/0</option></select></label>
          <label className="block space-y-2"><FieldLabel>Комментарий к причине</FieldLabel><textarea value={incidentNote} onChange={(event) => setIncidentNote(event.target.value)} rows={3} placeholder="Что произошло, на каком основании меняется результат" className="w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" /></label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2"><FieldLabel>Каскадное решение</FieldLabel><select value={incidentResolution} onChange={(event) => setIncidentResolution(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="cascade_void_and_replay" disabled={!incidentQualificationModel.cascadeAvailable}>Аннулировать downstream и переиграть</option><option value="retain_progression_override" disabled={incidentQualificationModel.active && !incidentQualificationModel.retainAvailable}>Сохранить текущую сетку (привилегированный override)</option></select></label>
            {incidentPreview?.risk === 'red' ? <label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-red-400/35 bg-red-500/10 px-3 text-sm font-semibold text-red-100"><input type="checkbox" checked={confirmRedIncident} onChange={(event) => setConfirmRedIncident(event.target.checked)} />Подтверждаю изменение LIVE/final downstream</label> : null}
          </div>
          {incidentQualificationModel.active ? <div className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-50"><p className="font-bold">Квалификация уже зафиксирована</p><p className="mt-1 text-amber-50/75">Автоматическая пересборка сеток недоступна без атомарного replan. Retain сохраняет участников текущей сетки, записывает новые standings snapshots и требует роль {incidentQualificationModel.retainRole}.</p>{incidentQualificationModel.blockers.length ? <ul className="mt-2 space-y-1 text-xs text-amber-100/80">{incidentQualificationModel.blockers.map((blocker, index) => <li key={`${String(blocker.code ?? 'blocker')}-${index}`}>• {String(blocker.message ?? blocker.code ?? 'Операция заблокирована')}</li>)}</ul> : null}</div> : null}
          <div className="flex gap-2"><button type="button" onClick={() => void previewIncident()} disabled={Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Impact preview</button><button type="button" onClick={() => void commitIncident()} disabled={!incidentPreview || Boolean(pendingAction) || (incidentResolution === 'cascade_void_and_replay' && !incidentQualificationModel.cascadeAvailable)} className="min-h-11 rounded-xl bg-red-500 px-4 text-sm font-bold text-white disabled:opacity-50">Применить</button></div>
          {incidentPreview ? <pre className={cx('max-h-[520px] overflow-auto rounded-xl border p-3 text-xs leading-5 text-white/75', incidentPreview.risk === 'red' ? 'border-red-400/40 bg-red-500/10' : 'border-white/10 bg-black/25')}>{formatJson(incidentPreview)}</pre> : null}

          <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/[0.045] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-base font-bold text-white">Импорт бумажного протокола</h3><p className="mt-1 text-sm leading-5 text-white/55">Только для первого фактического результа. Исправление уже сохранённого счёта сервер перенаправит в incident workflow.</p></div>
              <span className="rounded-full border border-red-300/25 px-2.5 py-1 text-[11px] font-semibold text-red-100">Только director</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2"><FieldLabel>Матч</FieldLabel><select value={paperMatchId} onChange={(event) => setPaperMatchId(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"><option value="">Выерите матч</option>{paperImportMatches.map((match) => <option key={String(match.id)} value={String(match.id)}>{matchLabel(match)}</option>)}</select></label>
              <label className="space-y-2"><FieldLabel>Фактическое начало · {config.timezone}</FieldLabel><input type="datetime-local" value={paperActualStartedAt} onChange={(event) => setPaperActualStartedAt(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
              <label className="space-y-2"><FieldLabel>Фактическое окончание · {config.timezone}</FieldLabel><input type="datetime-local" value={paperActualEndedAt} onChange={(event) => setPaperActualEndedAt(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
              <label className="space-y-2"><FieldLabel>Номер / фото протокола</FieldLabel><input value={paperEvidenceRef} onChange={(event) => setPaperEvidenceRef(event.target.value)} placeholder="Номер листа или ссылка" className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-white" /></label>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {paperSetScores.map((set, index) => (
                <div key={index} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold text-white/55">Партия {index + 1}</p>
                  <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <input aria-label={`Бумажный протокол, команда A, партия ${index + 1}`} inputMode="numeric" value={set.a} onChange={(event) => setPaperSetScores((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, a: event.target.value } : item))} className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-black/25 px-2 text-center text-white" />
                    <span className="text-white/35">:</span>
                    <input aria-label={`Бумажный протокол, команда B, партия ${index + 1}`} inputMode="numeric" value={set.b} onChange={(event) => setPaperSetScores((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, b: event.target.value } : item))} className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-black/25 px-2 text-center text-white" />
                  </div>
                </div>
              ))}
            </div>
            <label className="mt-3 block space-y-2"><FieldLabel>Причина ручного импорта</FieldLabel><textarea value={paperNote} onChange={(event) => setPaperNote(event.target.value)} rows={2} placeholder="Например: судья работал без сети, бумажный лист сверен директором" className="w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" /></label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => void previewPaperImport()} disabled={Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Preview импорта</button><button type="button" onClick={() => void commitPaperImport()} disabled={!paperImportPreview || Boolean(pendingAction)} className="min-h-11 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white disabled:opacity-50">Импортировать</button></div>
            <OperationImpactSummary value={paperImportPreview} title="Проверка бумажного протокола" />
            <OperationImpactSummary value={paperImportReceipt} title="Протокол импортирован: серверная receipt" />
          </div>
        </section>
      ) : null}

      {activeTab === 'audit' ? (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-[#0f131d]/95 p-4 md:p-5">
          <div><h2 className="text-lg font-bold text-white">Снимки и аудит</h2><p className="mt-1 text-sm text-white/55">Текущее серверное состояние без скрытого локального кэша.</p></div>
          <div className="rounded-xl border border-sky-300/20 bg-sky-500/[0.045] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Публичная видимость V2</h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-white/55">
                  Защитный переключатель и фактическая публикация разделены. Сайт откроет structure, standings, brackets и live schedule только после этого preview → commit.
                </p>
              </div>
              <span className={cx(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold',
                publicationState === 'published'
                  ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100'
                  : 'border-amber-300/25 bg-amber-500/10 text-amber-100',
              )}>
                {publicationState === 'published' ? 'Опубликовано' : publicationState === 'unpublished' ? 'Не опубликовано' : 'Shadow-проверка'}
              </span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
              <label className="space-y-2">
                <FieldLabel>Действие</FieldLabel>
                <select
                  value={publicationTarget}
                  onChange={(event) => setPublicationTarget(event.target.value as 'published' | 'unpublished')}
                  className="min-h-11 w-full rounded-xl border border-white/15 bg-[#131824] px-3 text-white"
                >
                  <option value="published">Опубликовать</option>
                  <option value="unpublished">Закрыть публичный доступ</option>
                </select>
              </label>
              <label className="space-y-2">
                <FieldLabel>Основание директора</FieldLabel>
                <input
                  value={publicationNote}
                  onChange={(event) => setPublicationNote(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="button" onClick={() => void previewPublication()} disabled={Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Publication preview</button>
              <button
                type="button"
                onClick={() => void commitPublication()}
                disabled={!publicationPreview || Boolean(pendingAction) || (publicationPreview.risk === 'red' && !redApprovalId.trim())}
                className="min-h-11 rounded-xl bg-sky-500 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {publicationTarget === 'published' ? 'Опубликовать после проверки' : 'Закрыть публичный доступ'}
              </button>
            </div>
            {!publicKillSwitchEnabled && publicationTarget === 'published' ? (
              <p className="mt-3 rounded-lg border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
                Сначала включите «Разрешить публичную публикацию V2» в настройках турнира. Пока переключатель выключен, сервер отклонит preview.
              </p>
            ) : null}
            {publicationPreview?.risk === 'red' ? (
              <p className="mt-3 rounded-lg border border-red-300/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
                Будут раскрыты команды и расписание. Нужен второй отличающийся администратор, согласовавший именно этот inputHash и версию.
              </p>
            ) : null}
            <OperationImpactSummary value={publicationPreview} title="Что станет публичным" />
            <OperationImpactSummary value={publicationReceipt} title="Серверная receipt публикации" />
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <h3 className="text-sm font-bold text-white">Компенсирующий undo</h3>
            <p className="mt-1 text-xs leading-5 text-white/55">История не удаляется: undo создаёт новую mutation batch после отдельного impact preview.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input value={mutationBatchId} onChange={(event) => setMutationBatchId(event.target.value)} placeholder="Mutation batch UUID" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white" />
              <button type="button" onClick={() => void previewUndo()} disabled={Boolean(pendingAction)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">Undo preview</button>
              <button type="button" onClick={() => void commitUndo()} disabled={!undoPreview || Boolean(pendingAction)} className="min-h-11 rounded-xl border border-red-400/35 bg-red-500/10 px-4 text-sm font-semibold text-red-100 disabled:opacity-50">Применить undo</button>
            </div>
            {undoPreview ? <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-white/70">{formatJson(undoPreview)}</pre> : null}
          </div>
          <pre className="max-h-[680px] overflow-auto rounded-xl border border-white/10 bg-black/25 p-3 text-xs leading-5 text-white/75">{formatJson(structure)}</pre>
        </section>
      ) : null}
    </div>
  );
}
