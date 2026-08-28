import type { CompiledScheduleInput, NormalizedMatch } from './compile';
import type {
  ScheduleAssignment,
  ScheduleDiagnostics,
  ScheduleTeamTimelineDiagnostic,
} from './types';

interface TimelineItem {
  assignment: ScheduleAssignment;
  match: NormalizedMatch;
  start: number;
  end: number;
}

function minuteDiff(later: number, earlier: number): number {
  return Math.max(0, (later - earlier) / 60_000);
}

/** Pure, deterministic operational diagnostics for previews and incident UI. */
export function buildScheduleDiagnostics(
  compiled: CompiledScheduleInput,
  assignments: ScheduleAssignment[],
): ScheduleDiagnostics {
  const timelineItems = assignments.flatMap((assignment): TimelineItem[] => {
    const match = compiled.matchById.get(assignment.matchId);
    const start = Date.parse(assignment.start);
    const end = Date.parse(assignment.end);
    return match && Number.isFinite(start) && Number.isFinite(end) && end > start
      ? [{ assignment, match, start, end }]
      : [];
  });

  const courts = compiled.courts.map((court) => {
    const courtItems = timelineItems.filter((item) => item.assignment.courtId === court.id);
    const availableMinutes = court.availability.reduce(
      (total, range) => total + (range.end - range.start) / 60_000,
      0,
    );
    const scheduledMinutes = courtItems.reduce((total, item) => total + item.match.durationMinutes, 0);
    return {
      courtId: court.id,
      availableMinutes,
      scheduledMinutes,
      assignmentCount: courtItems.length,
      utilizationPermille: availableMinutes > 0 ? Math.round((scheduledMinutes * 1000) / availableMinutes) : 0,
      fullyClosed: court.availability.length === 0,
    };
  });

  const tierOrder = ['hard', 'medium', 'light', 'neutral'] as const;
  const tiers = tierOrder.map((tier) => {
    const tierItems = timelineItems.filter((item) => {
      const diagnosticTier = item.match.stageKind === 'pool' || item.match.courtPolicy?.mode === 'neutral'
        ? 'neutral'
        : item.match.tier ?? 'neutral';
      return diagnosticTier === tier;
    });
    let preferredAssignments = 0;
    let fallbackAssignments = 0;
    let policyViolationAssignments = 0;
    for (const item of tierItems) {
      const policy = item.match.courtPolicy;
      if (!policy || policy.mode === 'neutral' || policy.preferredCourtIds.includes(item.assignment.courtId)) {
        preferredAssignments += 1;
      } else if (!policy.allowedCourtIds.includes(item.assignment.courtId)) {
        policyViolationAssignments += 1;
      } else {
        fallbackAssignments += 1;
      }
    }
    return {
      tier,
      assignmentCount: tierItems.length,
      preferredAssignments,
      fallbackAssignments,
      policyViolationAssignments,
    };
  });

  const timelines = new Map<string, TimelineItem[]>();
  for (const item of timelineItems) {
    for (const teamId of item.match.teamIds) {
      const timeline = timelines.get(teamId) ?? [];
      timeline.push(item);
      timelines.set(teamId, timeline);
    }
  }
  const teamTimelines: ScheduleTeamTimelineDiagnostic[] = Array.from(timelines, ([teamId, items]) => {
    items.sort((left, right) => left.start - right.start || left.match.id.localeCompare(right.match.id));
    let minRestMinutes: number | null = null;
    let maxWaitMinutes = 0;
    let softRestDeficitMinutes = 0;
    let courtSwitches = 0;
    for (let index = 1; index < items.length; index += 1) {
      const previous = items[index - 1];
      const current = items[index];
      const rest = minuteDiff(current.start, previous.end);
      minRestMinutes = minRestMinutes == null ? rest : Math.min(minRestMinutes, rest);
      maxWaitMinutes = Math.max(maxWaitMinutes, rest);
      const target = Math.max(previous.match.softRestMinutes, current.match.softRestMinutes);
      softRestDeficitMinutes += Math.max(0, target - rest);
      if (previous.assignment.courtId !== current.assignment.courtId) courtSwitches += 1;
    }
    return {
      teamId,
      matchIds: items.map((item) => item.match.id),
      games: items.length,
      minRestMinutes,
      maxWaitMinutes,
      softRestDeficitMinutes,
      courtSwitches,
    };
  }).sort((left, right) => left.teamId.localeCompare(right.teamId));

  const dutyCounts = new Map<string, number>();
  for (const match of compiled.matches) {
    for (const teamId of match.teamIds) dutyCounts.set(teamId, 0);
  }
  for (const item of timelineItems) {
    for (const teamId of item.assignment.referee.reservedTeamIds) {
      dutyCounts.set(teamId, (dutyCounts.get(teamId) ?? 0) + 1);
    }
  }
  const dutiesByTeam = Array.from(dutyCounts, ([teamId, duties]) => ({ teamId, duties }))
    .sort((left, right) => left.teamId.localeCompare(right.teamId));
  const dutyValues = dutiesByTeam.map((item) => item.duties);
  const minDuties = dutyValues.length > 0 ? Math.min(...dutyValues) : 0;
  const maxDuties = dutyValues.length > 0 ? Math.max(...dutyValues) : 0;

  return {
    courts,
    tiers,
    teamTimelines,
    refereeBalance: {
      dutiesByTeam,
      minDuties,
      maxDuties,
      spread: maxDuties - minDuties,
    },
  };
}
