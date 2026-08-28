import { isCoachUuid } from './validators';
import {
  COACH_RECOMMENDATION_INTENSITIES,
  COACH_RECOMMENDATION_LEVELS,
  type CoachRecommendationInput,
} from './recommendation-types';

export function parseCoachRecommendationInput(body: unknown): CoachRecommendationInput {
  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const durationMinutes = Math.round(Number(raw.durationMinutes));
  const courtCount = Math.round(Number(raw.courtCount));
  const participantIds = Array.isArray(raw.participantIds)
    ? [...new Set(raw.participantIds.map(String).filter(isCoachUuid))].slice(0, 200)
    : [];
  const focusSkillId = raw.focusSkillId ? String(raw.focusSkillId) : null;
  const levelCode = String(raw.levelCode ?? 'auto');
  const intensity = String(raw.intensity ?? 'auto');
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 360) {
    throw new Error('BadRequest: продолжительность должна быть от 15 до 360 минут');
  }
  if (!Number.isFinite(courtCount) || courtCount < 1 || courtCount > 20) {
    throw new Error('BadRequest: количество кортов должно быть от 1 до 20');
  }
  if (!participantIds.length) throw new Error('BadRequest: выберите хотя бы одного участника');
  if (focusSkillId && !isCoachUuid(focusSkillId)) throw new Error('BadRequest: некорректный основной фокус');
  if (!COACH_RECOMMENDATION_LEVELS.includes(levelCode as CoachRecommendationInput['levelCode'])) {
    throw new Error('BadRequest: некорректный уровень');
  }
  if (!COACH_RECOMMENDATION_INTENSITIES.includes(intensity as CoachRecommendationInput['intensity'])) {
    throw new Error('BadRequest: некорректная интенсивность');
  }
  return {
    durationMinutes,
    courtCount,
    participantIds,
    focusSkillId,
    levelCode: levelCode as CoachRecommendationInput['levelCode'],
    intensity: intensity as CoachRecommendationInput['intensity'],
    replaceExisting: raw.replaceExisting === true,
  };
}
