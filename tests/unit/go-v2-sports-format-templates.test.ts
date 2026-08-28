import { describe, expect, it } from 'vitest';

import {
  getTournamentFormatTemplateV2,
  isTournamentFormatTemplateIdV2,
  listTournamentFormatTemplatesV2,
  materializeTournamentFormatTemplateV2,
  validateTournamentFormatTemplateV2,
} from '@/lib/go-v2/core';

describe('TournamentFormatTemplateV2 catalog', () => {
  it('publishes a valid immutable catalog for every required first-wave preset', () => {
    const templates = listTournamentFormatTemplatesV2();
    expect(templates.map((template) => template.id)).toEqual([
      'lpv_groups_hl_se_v1',
      'lpv_groups_hml_se_v1',
      'lpv_groups_tiers_de_v1',
      'lpv_modified4_se_v1',
      'lpv_modified4_de_v1',
      'lpv_standalone_se_v1',
      'lpv_standalone_de_v1',
      'lpv_classification_v1',
    ]);
    expect(templates.every((template) => validateTournamentFormatTemplateV2(template).ok)).toBe(true);
    expect(templates.every((template) => (
      template.schemaVersion === 2
      && template.templateVersion === 1
      && template.scheduleDefaults.courtCount === 4
      && template.scheduleDefaults.allowedCourtCount.join('-') === '1-6'
    ))).toBe(true);
    expect(isTournamentFormatTemplateIdV2('lpv_groups_hl_se_v1')).toBe(true);
    expect(isTournamentFormatTemplateIdV2('lpv_classification_v1')).toBe(true);
    expect(isTournamentFormatTemplateIdV2('lpv_classification_extension_v1')).toBe(false);
    expect(isTournamentFormatTemplateIdV2('lpv_groups_magic_v1')).toBe(false);
    expect(() => getTournamentFormatTemplateV2('lpv_groups_magic_v1'))
      .toThrowError(expect.objectContaining({ code: 'UNKNOWN_FORMAT_TEMPLATE' }));
  });

  it.each([
    ['lpv_groups_hl_se_v1', 22, { hard: 12, medium: 0, light: 10 }, 3],
    ['lpv_groups_hml_se_v1', 29, { hard: 16, medium: 7, light: 6 }, 3],
    ['lpv_groups_tiers_de_v1', 31, { hard: 16, medium: 8, light: 7 }, 4],
  ] as const)('materializes %s deterministically for %i teams', (templateId, teamCount, quotas, minimumGames) => {
    const first = materializeTournamentFormatTemplateV2({ templateId, teamCount });
    const second = materializeTournamentFormatTemplateV2({ templateId, teamCount });
    expect(first.tierQuotas).toMatchObject(quotas);
    expect(first.minimumGames.totalMinimum).toBe(minimumGames);
    expect(first.snapshotHash).toBe(second.snapshotHash);
    expect(first.snapshotHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it('materializes Modified Pool and standalone alternatives without pretending they share one floor', () => {
    expect(materializeTournamentFormatTemplateV2({
      templateId: 'lpv_modified4_se_v1',
      teamCount: 8,
    }).minimumGames.totalMinimum).toBe(3);
    expect(materializeTournamentFormatTemplateV2({
      templateId: 'lpv_modified4_de_v1',
      teamCount: 8,
    }).minimumGames.totalMinimum).toBe(4);
    expect(materializeTournamentFormatTemplateV2({
      templateId: 'lpv_standalone_se_v1',
      teamCount: 5,
    }).minimumGames.totalMinimum).toBe(1);
    expect(materializeTournamentFormatTemplateV2({
      templateId: 'lpv_standalone_de_v1',
      teamCount: 5,
    }).minimumGames.totalMinimum).toBe(2);
  });

  it('rejects group N=5, invalid tier singleton splits and stricter unsupported targets', () => {
    expect(() => materializeTournamentFormatTemplateV2({
      templateId: 'lpv_groups_hl_se_v1',
      teamCount: 5,
    })).toThrowError(expect.objectContaining({
      code: 'GROUPS_UNAVAILABLE_FOR_FIVE',
      details: expect.objectContaining({ alternatives: ['standalone_bracket', 'add_sixth_team'] }),
    }));
    expect(() => materializeTournamentFormatTemplateV2({
      templateId: 'lpv_groups_hml_se_v1',
      teamCount: 9,
    })).toThrowError(expect.objectContaining({ code: 'SINGLETON_TIER_REQUIRES_PLACEMENT' }));
    expect(() => materializeTournamentFormatTemplateV2({
      templateId: 'lpv_standalone_se_v1',
      teamCount: 5,
      minimumGamesTarget: 3,
    })).toThrowError(expect.objectContaining({ code: 'MINIMUM_GAMES_TARGET_UNSATISFIED' }));
  });

  it('materializes classification/consolation with an honest deterministic game guarantee', () => {
    const eight = materializeTournamentFormatTemplateV2({
      templateId: 'lpv_classification_v1',
      teamCount: 8,
    });
    expect(eight).toMatchObject({
      playoffBracketSizes: [],
      classificationPlan: {
        roundCount: 3,
        realMatchCount: 12,
        minimumGamesGuaranteed: 3,
        maximumGames: 3,
      },
      minimumGames: { totalMinimum: 3, meetsTarget: true },
      playoff: {
        format: 'classification',
        strategy: { strategyId: 'lpv_classification_rounds_v1' },
      },
    });
    expect(getTournamentFormatTemplateV2('lpv_classification_v1')).toMatchObject({
      availability: 'ready',
      teamCount: { min: 3, max: 48 },
    });

    expect(materializeTournamentFormatTemplateV2({
      templateId: 'lpv_classification_v1',
      teamCount: 3,
      minimumGamesTarget: 4,
    }).minimumGames.totalMinimum).toBe(4);
    expect(() => materializeTournamentFormatTemplateV2({
      templateId: 'lpv_classification_v1',
      teamCount: 2,
    })).toThrowError(expect.objectContaining({ code: 'FORMAT_TEMPLATE_TEAM_COUNT_UNSUPPORTED' }));
    expect(() => materializeTournamentFormatTemplateV2({
      templateId: 'lpv_classification_v1',
      teamCount: 8,
      minimumGamesTarget: 4,
    })).toThrowError(expect.objectContaining({ code: 'MINIMUM_GAMES_TARGET_UNSATISFIED' }));
  });
});
