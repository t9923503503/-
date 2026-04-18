import type { GoMatchView, GoOperatorStage } from '@/lib/go-next/types';

export type GoDomainStage =
  | 'setup_incomplete'
  | 'groups_ready'
  | 'groups_live'
  | 'groups_done'
  | 'bracket_ready'
  | 'bracket_live'
  | 'bracket_done'
  | 'tournament_closed';

export type GoUiStageId = 'prep' | 'groups' | 'matches' | 'playoff' | 'finish';

export type GoUiStageStatus = 'idle' | 'active' | 'completed' | 'locked' | 'not_applicable';

export type CockpitActionId =
  | 'bootstrap_groups'
  | 'start_group_stage'
  | 'open_schedule'
  | 'open_bracket'
  | 'finish_group_stage'
  | 'bootstrap_bracket'
  | 'finish_bracket'
  | 'open_courts'
  | 'resolve_assignments'
  | 'reload'
  | 'none';

export type CockpitAlertLevel = 'blocking' | 'attention' | 'info';

export type CourtCockpitStatus = 'live' | 'assigned' | 'waiting' | 'empty' | 'attention' | 'offline';

export interface CockpitPrimaryAction {
  id: CockpitActionId;
  label: string;
  reason: string;
  priority: 1 | 2 | 3;
}

export interface CockpitAlert {
  id: string;
  level: CockpitAlertLevel;
  title: string;
  message: string;
  actionId?: CockpitActionId;
  actionLabel?: string;
}

export interface StepperItem {
  id: GoUiStageId;
  label: string;
  status: GoUiStageStatus;
  hidden?: boolean;
}

export interface CourtCockpitCard {
  courtNo: number;
  label: string;
  pinCode: string;
  status: CourtCockpitStatus;
  statusLabel: string;
  matchLabel: string;
  teamsLabel: string;
  scoreLabel: string;
  actionLabel: string;
  actionId: CockpitActionId;
}

export interface StageSummary {
  totalMatches: number;
  playedMatches: number;
  liveMatches: number;
  pendingMatches: number;
  cancelledMatches: number;
  scheduledPendingMatches: number;
  unscheduledPendingMatches: number;
}

export function mapOperatorToDomainStage(stage: GoOperatorStage): GoDomainStage {
  if (stage === 'setup') return 'setup_incomplete';
  if (stage === 'groups_ready') return 'groups_ready';
  if (stage === 'groups_live') return 'groups_live';
  if (stage === 'groups_finished') return 'groups_done';
  if (stage === 'bracket_preview' || stage === 'bracket_ready') return 'bracket_ready';
  if (stage === 'bracket_live') return 'bracket_live';
  return 'bracket_done';
}

export function deriveStageSummary(matches: GoMatchView[]): StageSummary {
  const totalMatches = matches.length;
  const playedMatches = matches.filter((match) => match.status === 'finished').length;
  const liveMatches = matches.filter((match) => match.status === 'live').length;
  const pendingMatches = matches.filter((match) => match.status === 'pending').length;
  const cancelledMatches = matches.filter((match) => match.status === 'cancelled').length;
  const scheduledPendingMatches = matches.filter(
    (match) => match.status === 'pending' && match.courtNo != null && Boolean(match.scheduledAt),
  ).length;
  const unscheduledPendingMatches = matches.filter(
    (match) => match.status === 'pending' && (match.courtNo == null || !match.scheduledAt),
  ).length;

  return {
    totalMatches,
    playedMatches,
    liveMatches,
    pendingMatches,
    cancelledMatches,
    scheduledPendingMatches,
    unscheduledPendingMatches,
  };
}

function hasBracketData(matches: GoMatchView[]): boolean {
  return matches.some((match) => Boolean(match.bracketLevel));
}

export function buildStepperItems(input: {
  domainStage: GoDomainStage;
  matches: GoMatchView[];
}): StepperItem[] {
  const hasPlayoff = hasBracketData(input.matches) || input.domainStage.startsWith('bracket') || input.domainStage === 'bracket_done';
  const rankingByStage: Record<GoDomainStage, number> = {
    setup_incomplete: 0,
    groups_ready: 1,
    groups_live: 2,
    groups_done: 2,
    bracket_ready: 3,
    bracket_live: 4,
    bracket_done: 5,
    tournament_closed: 5,
  };
  const currentRank = rankingByStage[input.domainStage];
  const isLocked = input.domainStage === 'setup_incomplete';

  const steps: StepperItem[] = [
    { id: 'prep', label: 'Подготовка', status: currentRank > 0 ? 'completed' : 'active' },
    { id: 'groups', label: 'Группы', status: currentRank > 2 ? 'completed' : currentRank >= 1 ? 'active' : 'idle' },
    { id: 'matches', label: 'Матчи', status: currentRank > 3 ? 'completed' : currentRank >= 2 ? 'active' : 'idle' },
    {
      id: 'playoff',
      label: 'Плей-офф',
      status: !hasPlayoff ? 'not_applicable' : currentRank > 4 ? 'completed' : currentRank >= 3 ? 'active' : 'idle',
      hidden: !hasPlayoff,
    },
    {
      id: 'finish',
      label: 'Завершение',
      status: currentRank >= 5 ? 'active' : isLocked ? 'locked' : 'idle',
    },
  ];
  return steps;
}

export function deriveCourtsCards(input: {
  matches: GoMatchView[];
  courts: Array<{ courtNo: number; label: string; pinCode: string }>;
  staleMs: number;
  staleThresholdMs: number;
}): CourtCockpitCard[] {
  const nowStale = input.staleMs > input.staleThresholdMs;
  return input.courts.map((court) => {
    const courtMatches = input.matches
      .filter((match) => match.courtNo === court.courtNo)
      .sort((left, right) => (left.matchNo ?? 0) - (right.matchNo ?? 0));
    const live = courtMatches.find((match) => match.status === 'live') ?? null;
    const nextAssigned = courtMatches.find((match) => match.status === 'pending' && Boolean(match.scheduledAt)) ?? null;
    const nextAnyPending = courtMatches.find((match) => match.status === 'pending') ?? null;

    if (nowStale) {
      return {
        courtNo: court.courtNo,
        label: court.label,
        pinCode: court.pinCode,
        status: 'offline',
        statusLabel: 'OFFLINE',
        matchLabel: 'Данные устарели',
        teamsLabel: 'Потеряна свежесть live-снимка',
        scoreLabel: '--',
        actionLabel: 'Обновить',
        actionId: 'reload',
      };
    }
    if (live) {
      return {
        courtNo: court.courtNo,
        label: court.label,
        pinCode: court.pinCode,
        status: 'live',
        statusLabel: 'LIVE',
        matchLabel: `Матч #${live.matchNo}`,
        teamsLabel: `${live.teamA?.label ?? 'TBD'}\n${live.teamB?.label ?? 'TBD'}`,
        scoreLabel: `${live.setsA} : ${live.setsB}`,
        actionLabel: 'Открыть табло',
        actionId: 'open_courts',
      };
    }
    if (nextAssigned) {
      const scheduled = nextAssigned.scheduledAt ? new Date(nextAssigned.scheduledAt) : null;
      const overdue = scheduled ? Date.now() - scheduled.getTime() > 15 * 60 * 1000 : false;
      return {
        courtNo: court.courtNo,
        label: court.label,
        pinCode: court.pinCode,
        status: overdue ? 'attention' : 'assigned',
        statusLabel: overdue ? 'ВНИМАНИЕ' : 'НАЗНАЧЕН',
        matchLabel: `Матч #${nextAssigned.matchNo}`,
        teamsLabel: `${nextAssigned.teamA?.label ?? 'TBD'}\n${nextAssigned.teamB?.label ?? 'TBD'}`,
        scoreLabel: scheduled
          ? `Старт ${String(scheduled.getHours()).padStart(2, '0')}:${String(scheduled.getMinutes()).padStart(2, '0')}`
          : 'Ожидание старта',
        actionLabel: 'Открыть расписание',
        actionId: 'open_schedule',
      };
    }
    if (nextAnyPending) {
      return {
        courtNo: court.courtNo,
        label: court.label,
        pinCode: court.pinCode,
        status: 'waiting',
        statusLabel: 'ОЖИДАНИЕ',
        matchLabel: 'Ожидает назначение времени',
        teamsLabel: `${nextAnyPending.teamA?.label ?? 'TBD'}\n${nextAnyPending.teamB?.label ?? 'TBD'}`,
        scoreLabel: '--',
        actionLabel: 'Назначить матч',
        actionId: 'open_schedule',
      };
    }
    return {
      courtNo: court.courtNo,
      label: court.label,
      pinCode: court.pinCode,
      status: 'empty',
      statusLabel: 'НЕТ МАТЧА',
      matchLabel: 'Корт свободен',
      teamsLabel: 'Нет назначенного матча',
      scoreLabel: '--',
      actionLabel: 'Назначить матч',
      actionId: 'open_courts',
    };
  });
}

export function buildCockpitAlerts(input: {
  domainStage: GoDomainStage;
  summary: StageSummary;
  courts: CourtCockpitCard[];
  fetchError: string;
  patchError: string;
  staleMs: number;
  staleThresholdMs: number;
}): CockpitAlert[] {
  const alerts: CockpitAlert[] = [];

  if (input.fetchError) {
    alerts.push({
      id: 'load-error',
      level: 'blocking',
      title: 'Не удалось загрузить состояние турнира',
      message: input.fetchError,
      actionId: 'reload',
      actionLabel: 'Повторить',
    });
  }

  if (input.patchError) {
    alerts.push({
      id: 'patch-error',
      level: 'blocking',
      title: 'Действие не применилось',
      message: input.patchError,
      actionId: 'open_schedule',
      actionLabel: 'Открыть расписание',
    });
  }

  if (input.summary.unscheduledPendingMatches > 0 && input.domainStage !== 'setup_incomplete') {
    alerts.push({
      id: 'unscheduled-matches',
      level: 'blocking',
      title: 'Есть матчи без назначения',
      message: `Неназначенных матчей: ${input.summary.unscheduledPendingMatches}. Турнир не сможет двигаться дальше.`,
      actionId: 'resolve_assignments',
      actionLabel: 'Назначить матчи',
    });
  }

  const emptyCourts = input.courts.filter((court) => court.status === 'empty').length;
  if (emptyCourts > 0 && (input.domainStage === 'groups_live' || input.domainStage === 'bracket_live')) {
    alerts.push({
      id: 'empty-courts',
      level: 'attention',
      title: 'Есть свободные корты',
      message: `Свободных кортов: ${emptyCourts}. Можно ускорить проведение назначением следующего матча.`,
      actionId: 'open_courts',
      actionLabel: 'Открыть корты',
    });
  }

  if (input.staleMs > input.staleThresholdMs) {
    alerts.push({
      id: 'stale-state',
      level: 'attention',
      title: 'Состояние устарело',
      message: 'Данные давно не обновлялись. Проверьте сеть или повторите загрузку.',
      actionId: 'reload',
      actionLabel: 'Обновить',
    });
  }

  if (input.domainStage === 'groups_done') {
    alerts.push({
      id: 'groups-done',
      level: 'info',
      title: 'Группы завершены',
      message: 'Можно переходить к посеву и запуску плей-офф.',
      actionId: 'open_bracket',
      actionLabel: 'Открыть плей-офф',
    });
  }

  return alerts;
}

export function pickPrimaryAction(input: {
  domainStage: GoDomainStage;
  summary: StageSummary;
  alerts: CockpitAlert[];
}): CockpitPrimaryAction {
  const blockingWithAction = input.alerts.find((alert) => alert.level === 'blocking' && alert.actionId && alert.actionLabel);
  if (blockingWithAction && blockingWithAction.actionId && blockingWithAction.actionLabel) {
    return {
      id: blockingWithAction.actionId,
      label: blockingWithAction.actionLabel,
      reason: blockingWithAction.title,
      priority: 1,
    };
  }

  if (input.domainStage === 'setup_incomplete') {
    return { id: 'bootstrap_groups', label: 'Сгенерировать группы', reason: 'Турнир не инициализирован', priority: 2 };
  }
  if (input.domainStage === 'groups_ready') {
    return { id: 'start_group_stage', label: 'Запустить групповой этап', reason: 'Группы готовы к старту', priority: 2 };
  }
  if (input.domainStage === 'groups_live') {
    return { id: 'open_schedule', label: 'Открыть расписание', reason: 'Контроль матчей на кортах', priority: 2 };
  }
  if (input.domainStage === 'groups_done') {
    return { id: 'open_bracket', label: 'Подготовить плей-офф', reason: 'Этап групп завершён', priority: 3 };
  }
  if (input.domainStage === 'bracket_ready') {
    return { id: 'bootstrap_bracket', label: 'Запустить плей-офф', reason: 'Сетка готова', priority: 2 };
  }
  if (input.domainStage === 'bracket_live') {
    if (input.summary.pendingMatches > 0) {
      return { id: 'open_schedule', label: 'Контролировать матчи', reason: 'Плей-офф в процессе', priority: 2 };
    }
    return { id: 'finish_bracket', label: 'Завершить турнир', reason: 'Все матчи завершены', priority: 3 };
  }
  if (input.domainStage === 'bracket_done') {
    return { id: 'none', label: 'Турнир завершён', reason: 'Действий не требуется', priority: 3 };
  }
  return { id: 'none', label: 'Нет действия', reason: 'Состояние закрыто', priority: 3 };
}
