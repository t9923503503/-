import type {
  CoachRecommendationCandidate,
  CoachRecommendationInput,
  CoachRecommendationResult,
  CoachRecommendedItem,
} from './recommendation-types';

const CATEGORY_LABELS: Record<string, string> = {
  warmup: 'разминку', ball_control: 'контроль мяча', reception: 'приём', setting: 'передачу',
  attack: 'атаку', serve: 'подачу', defense: 'защиту', block: 'блок', transitions: 'переходы',
  tactics: 'тактику', game: 'игровые задания', physical: 'физику', coordination: 'координацию', combined: 'комбинированную работу',
};

function daysSince(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.max(0, Math.floor((nowMs - time) / 86_400_000)) : null;
}

export function coachRepetitionPenalty(candidate: Pick<CoachRecommendationCandidate, 'usedInLastSession' | 'usedInLast3' | 'usedInLast5'>): number {
  return Math.max(
    candidate.usedInLastSession ? 35 : 0,
    candidate.usedInLast3 >= 2 ? 24 : 0,
    candidate.usedInLast5 >= 3 ? 18 : 0,
  );
}

function assigneesFor(candidate: CoachRecommendationCandidate, participantIds: string[]): string[] | null {
  if (participantIds.length >= candidate.playerMin && participantIds.length <= candidate.playerMax) return participantIds;
  const matched = candidate.matchedParticipantIds.filter((id) => participantIds.includes(id)).sort();
  if (matched.length < candidate.playerMin) return null;
  return matched.slice(0, candidate.playerMax);
}

function scoreCandidate(candidate: CoachRecommendationCandidate, input: CoachRecommendationInput, inferredLevel: 'light' | 'medium' | 'hard', minimumRecentSeconds: number, nowMs: number): number {
  const matchedCount = candidate.matchedParticipantIds.length;
  let score = 20 + matchedCount * 12 + candidate.matchedHighPriorityCount * 8 + candidate.matchedPriorityWeight * 2;
  if (input.focusSkillId) {
    if (candidate.primarySkillId === input.focusSkillId) score += 30;
    else if (candidate.skillIds.includes(input.focusSkillId)) score += 18;
  }
  if (candidate.levelCode === 'all') score += 5;
  else if (candidate.levelCode === inferredLevel) score += 8;
  else score -= 6;
  if (candidate.favorite) score += 6;
  if (candidate.recommended) score += 6;
  if (candidate.coachRating) score += candidate.coachRating * 3;
  if (candidate.recentCategorySeconds === 0) score += 14;
  else if (candidate.recentCategorySeconds === minimumRecentSeconds) score += 8;
  const days = daysSince(candidate.lastUsedAt, nowMs);
  if (days == null) score += 14;
  else if (days >= 14) score += 10;
  else if (days >= 7) score += 5;
  else if (days <= 1) score -= 10;
  return score - coachRepetitionPenalty(candidate);
}

function reasonsFor(candidate: CoachRecommendationCandidate, input: CoachRecommendationInput, assignees: string[], participantCount: number, minimumRecentSeconds: number, nowMs: number): string[] {
  const reasons: string[] = [];
  const affected = Math.min(candidate.matchedParticipantIds.length, assignees.length);
  if (affected > 0) {
    reasons.push(`Подходит ${assignees.length} из ${participantCount} участников; у ${affected} есть связанная активная проблема.`);
    if (candidate.matchedHighPriorityCount > 0) reasons.push(`У ${Math.min(candidate.matchedHighPriorityCount, affected)} участников проблема высокого приоритета.`);
  } else {
    reasons.push(`Подходит составу: ${assignees.length} участников при диапазоне упражнения ${candidate.playerMin}–${candidate.playerMax}.`);
  }
  if (input.focusSkillId && candidate.skillIds.includes(input.focusSkillId)) {
    reasons.push(candidate.primarySkillId === input.focusSkillId
      ? `Основной навык упражнения совпадает с выбранным фокусом${candidate.primarySkillName ? ` «${candidate.primarySkillName}»` : ''}.`
      : 'Упражнение развивает выбранный фокус как дополнительный навык.');
  }
  const days = daysSince(candidate.lastUsedAt, nowMs);
  if (days == null) reasons.push('Группа ещё не выполняла это упражнение в зафиксированных тренировках.');
  else reasons.push(`Последний зафиксированный раз группа делала его ${days === 0 ? 'сегодня' : `${days} дн. назад`}.`);
  const penalty = coachRepetitionPenalty(candidate);
  if (penalty > 0) reasons.push(`Учтён штраф за повтор: упражнение встречалось ${candidate.usedInLast5} раз в последних 5 тренировках.`);
  else if (candidate.recentCategorySeconds === minimumRecentSeconds) reasons.push(`Баланс нагрузки: на ${CATEGORY_LABELS[candidate.category] ?? candidate.category} недавно ушло меньше всего времени.`);
  if (candidate.coachRating) reasons.push(`Оценка тренера: ${candidate.coachRating} из 5.`);
  return reasons.slice(0, 5);
}

export function buildDeterministicRecommendation(args: {
  input: CoachRecommendationInput;
  candidates: CoachRecommendationCandidate[];
  inferredLevel: 'light' | 'medium' | 'hard';
  now?: Date;
}): CoachRecommendationResult {
  const { input, inferredLevel } = args;
  const nowMs = (args.now ?? new Date()).getTime();
  const eligible = args.candidates
    .filter((candidate) => candidate.courtCount <= input.courtCount)
    .filter((candidate) => candidate.durationMinutes <= input.durationMinutes)
    .filter((candidate) => input.levelCode === 'auto' || candidate.levelCode === 'all' || candidate.levelCode === input.levelCode)
    .filter((candidate) => input.intensity === 'auto' || candidate.intensity === input.intensity)
    .map((candidate) => ({ candidate, assignees: assigneesFor(candidate, input.participantIds) }))
    .filter((entry): entry is { candidate: CoachRecommendationCandidate; assignees: string[] } => Boolean(entry.assignees));
  const minimumRecentSeconds = eligible.length ? Math.min(...eligible.map((entry) => entry.candidate.recentCategorySeconds)) : 0;
  const scored = eligible.map((entry) => ({
    ...entry,
    baseScore: scoreCandidate(entry.candidate, input, inferredLevel, minimumRecentSeconds, nowMs),
  }));
  const picked: Array<(typeof scored)[number]> = [];
  let remaining = input.durationMinutes;
  while (picked.length < 12) {
    const next = scored
      .filter((entry) => !picked.some((pickedEntry) => pickedEntry.candidate.id === entry.candidate.id))
      .filter((entry) => entry.candidate.durationMinutes <= remaining)
      .map((entry) => ({
        ...entry,
        dynamicScore: entry.baseScore + (picked.some((pickedEntry) => pickedEntry.candidate.category === entry.candidate.category) ? -8 : 10),
      }))
      .sort((a, b) => b.dynamicScore - a.dynamicScore || a.candidate.title.localeCompare(b.candidate.title, 'ru') || a.candidate.id.localeCompare(b.candidate.id))[0];
    if (!next) break;
    picked.push(next);
    remaining -= next.candidate.durationMinutes;
  }
  const ordered = [...picked].sort((a, b) => {
    const rank = (category: string) => category === 'warmup' ? 0 : category === 'game' ? 2 : 1;
    return rank(a.candidate.category) - rank(b.candidate.category);
  });
  const items: CoachRecommendedItem[] = ordered.map((entry) => ({
    exerciseId: entry.candidate.id,
    title: entry.candidate.title,
    category: entry.candidate.category,
    durationMinutes: entry.candidate.durationMinutes,
    participantIds: entry.assignees,
    score: entry.baseScore,
    reasons: reasonsFor(entry.candidate, input, entry.assignees, input.participantIds.length, minimumRecentSeconds, nowMs),
  }));
  return {
    items,
    plannedDurationMinutes: items.reduce((sum, item) => sum + item.durationMinutes, 0),
    requestedDurationMinutes: input.durationMinutes,
  };
}
