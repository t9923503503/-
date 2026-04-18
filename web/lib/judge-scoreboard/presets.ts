import type { Preset } from './types';

export const PRESETS: Preset[] = [
  {
    id: 'bo3',
    title: 'BO3 21-21-15',
    subtitle: 'Классика FIVB',
    tone: 'red',
    config: {
      format: 'bo3',
      targetMain: 21,
      targetDecider: 15,
      winByTwo: true,
      setsToWin: 2,
      timeoutsPerTeam: 1,
      timeoutDurationSec: 45,
      lockScoreDuringTimeout: false,
      autoServeOnPoint: true,
      timerModeMinutes: 0,
      division: 'MM',
    },
  },
  {
    id: 'single21',
    title: '1 сет до 21',
    subtitle: 'Win by 2',
    tone: 'green',
    config: {
      format: 'single21',
      targetMain: 21,
      targetDecider: 21,
      winByTwo: true,
      setsToWin: 1,
      timeoutsPerTeam: 1,
      timeoutDurationSec: 45,
      lockScoreDuringTimeout: false,
      autoServeOnPoint: true,
      timerModeMinutes: 0,
      division: 'MM',
    },
  },
  {
    id: 'single15',
    title: '1 сет до 15',
    subtitle: 'Win by 2',
    tone: 'yellow',
    config: {
      format: 'single15',
      targetMain: 15,
      targetDecider: 15,
      winByTwo: true,
      setsToWin: 1,
      timeoutsPerTeam: 1,
      timeoutDurationSec: 45,
      lockScoreDuringTimeout: false,
      autoServeOnPoint: true,
      timerModeMinutes: 0,
      division: 'MM',
    },
  },
];

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
