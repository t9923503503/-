import { describe, expect, it } from 'vitest';
import {
  normalizeCoachExerciseFilters,
  normalizeCoachExerciseInput,
  normalizeCoachExercisePhotoInput,
  normalizeCoachExerciseVideoInput,
  normalizeCoachTextList,
  validateCoachExerciseInput,
  validateCoachExercisePhotoInput,
  validateCoachExerciseVideoInput,
} from '../../web/lib/coach/exercise-validators';

const SKILL_ID = '1a7b2d5e-3403-4ea8-a41e-c105db7e8ad4';
const ISSUE_ID = '3a7b2d5e-3403-4ea8-a41e-c105db7e8ad4';

describe('LP Coach exercise validators', () => {
  it('normalizes a complete exercise and de-duplicates links and tags', () => {
    const input = normalizeCoachExerciseInput({
      title: '  Приём после перемещения  ',
      category: 'reception',
      primarySkillId: SKILL_ID,
      additionalSkillIds: [SKILL_ID, ISSUE_ID, ISSUE_ID],
      issueIds: [ISSUE_ID, ISSUE_ID],
      equipment: 'Конусы\nМячи\nконусы',
      tags: 'приём, движение, приём',
      playerMin: 2,
      playerMax: 6,
    });
    expect(validateCoachExerciseInput(input)).toBeNull();
    expect(input.title).toBe('Приём после перемещения');
    expect(input.additionalSkillIds).toEqual([ISSUE_ID]);
    expect(input.issueIds).toEqual([ISSUE_ID]);
    expect(input.equipment).toEqual(['Конусы', 'Мячи']);
    expect(input.tags).toEqual(['приём', 'движение']);
  });

  it('requires a real title, primary skill and coherent player range', () => {
    expect(validateCoachExerciseInput(normalizeCoachExerciseInput({ title: 'x', primarySkillId: SKILL_ID }))).toMatch(/Название/);
    expect(validateCoachExerciseInput(normalizeCoachExerciseInput({ title: 'Работа ног' }))).toMatch(/основной навык/i);
    expect(validateCoachExerciseInput(normalizeCoachExerciseInput({ title: 'Работа ног', primarySkillId: SKILL_ID, playerMin: 8, playerMax: 4 }))).toMatch(/Минимум/);
  });

  it('validates photo phases and storage URLs', () => {
    const photo = normalizeCoachExercisePhotoInput({ type: 'phase', phaseIndex: 3, storageUrl: 'https://cdn.example/frame.webp', relatedIssueId: ISSUE_ID });
    expect(validateCoachExercisePhotoInput(photo)).toBeNull();
    expect(validateCoachExercisePhotoInput(normalizeCoachExercisePhotoInput({ type: 'phase', storageUrl: '/images/frame.webp' }))).toMatch(/номер/);
    expect(validateCoachExercisePhotoInput(normalizeCoachExercisePhotoInput({ type: 'correct', storageUrl: 'javascript:alert(1)' }))).toMatch(/HTTPS/);
  });

  it('validates external video URLs and timestamps', () => {
    const video = normalizeCoachExerciseVideoInput({ platform: 'youtube', url: 'https://youtu.be/example', durationSeconds: 120, timestampStartSec: 42 });
    expect(validateCoachExerciseVideoInput(video)).toBeNull();
    expect(validateCoachExerciseVideoInput(normalizeCoachExerciseVideoInput({ url: 'http://example.com/video' }))).toMatch(/HTTPS/);
    expect(validateCoachExerciseVideoInput(normalizeCoachExerciseVideoInput({ url: 'https://example.com/video', durationSeconds: 10, timestampStartSec: 20 }))).toMatch(/Таймкод/);
  });

  it('bounds text lists and parses library filters', () => {
    expect(normalizeCoachTextList(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
    const filters = normalizeCoachExerciseFilters(new URLSearchParams('q=приём&players=4&favorite=1&noEquipment=1&coachRequired=0'));
    expect(filters).toMatchObject({ query: 'приём', players: 4, favorite: true, noEquipment: true, coachRequired: false });
  });
});
