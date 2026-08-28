import { performance } from 'node:perf_hooks';

import {
  solveSchedule,
  validateSchedule,
  type ScheduleMatchInput,
  type ScheduleSolverInput,
} from '../web/lib/go-v2/scheduler';

type FixtureSize = 120 | 170;

type BenchmarkSummary = {
  fixture: FixtureSize;
  samples: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  solverP95Ms: number;
  expandedStates: number;
  scheduleHash: string;
};

function percentile(values: number[], percentileValue: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((percentileValue / 100) * ordered.length) - 1);
  return ordered[index] ?? 0;
}

function fixture(size: FixtureSize): ScheduleSolverInput {
  const matches: ScheduleMatchInput[] = [];
  const roundsPerPair = size === 120
    ? Array.from({ length: 24 }, () => 5)
    : Array.from({ length: 24 }, (_, pair) => (pair < 2 ? 8 : 7));

  roundsPerPair.forEach((roundCount, pair) => {
    const prefix = `benchmark-${size}-pair-${String(pair).padStart(2, '0')}`;
    for (let round = 0; round < roundCount; round += 1) {
      matches.push({
        id: `${prefix}-round-${round}`,
        durationMinutes: 20,
        teamIds: [`benchmark-team-${pair * 2}`, `benchmark-team-${pair * 2 + 1}`],
        dependencies: round === 0 ? [] : [`${prefix}-round-${round - 1}`],
      });
    }
  });

  if (matches.length !== size) {
    throw new Error(`Invalid ${size}-match benchmark fixture: ${matches.length}`);
  }

  return {
    sessionId: `benchmark-${size}`,
    timezone: 'Asia/Yekaterinburg',
    window: {
      start: '2026-08-15T06:00:00.000Z',
      end: size === 120 ? '2026-08-15T14:00:00.000Z' : '2026-08-15T18:00:00.000Z',
    },
    courts: Array.from({ length: 6 }, (_, index) => ({ id: `court-${index + 1}` })),
    matches,
    referee: { mode: 'none' },
    options: {
      beamWidth: 64,
      topK: 24,
      maxExpandedStates: 250_000,
      maxWallMs: 5_000,
    },
  };
}

function benchmark(size: FixtureSize, samples = 20): BenchmarkSummary {
  const input = fixture(size);
  for (let warmup = 0; warmup < 2; warmup += 1) solveSchedule(input);

  const wallSamples: number[] = [];
  const solverSamples: number[] = [];
  let scheduleHash = '';
  let expandedStates = -1;

  for (let sample = 0; sample < samples; sample += 1) {
    const startedAt = performance.now();
    const result = solveSchedule(input);
    wallSamples.push(performance.now() - startedAt);
    solverSamples.push(result.metrics.elapsedMs);

    if (result.status !== 'feasible' || !result.publishable || result.assignments.length !== size) {
      throw new Error(`${size}-match fixture is not publishable: ${result.status}`);
    }
    const validation = validateSchedule(input, result.assignments);
    if (!validation.valid || validation.scheduleHash !== result.scheduleHash) {
      throw new Error(`${size}-match fixture failed independent validation`);
    }
    if (scheduleHash && scheduleHash !== result.scheduleHash) {
      throw new Error(`${size}-match fixture is not deterministic`);
    }
    if (expandedStates >= 0 && expandedStates !== result.metrics.expandedStates) {
      throw new Error(`${size}-match fixture expanded-state count is not deterministic`);
    }
    scheduleHash = result.scheduleHash;
    expandedStates = result.metrics.expandedStates;
  }

  return {
    fixture: size,
    samples,
    p50Ms: Number(percentile(wallSamples, 50).toFixed(2)),
    p95Ms: Number(percentile(wallSamples, 95).toFixed(2)),
    p99Ms: Number(percentile(wallSamples, 99).toFixed(2)),
    maxMs: Number(Math.max(...wallSamples).toFixed(2)),
    solverP95Ms: Number(percentile(solverSamples, 95).toFixed(2)),
    expandedStates,
    scheduleHash,
  };
}

const summaries = [benchmark(120), benchmark(170)];
console.log(JSON.stringify({
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  summaries,
}, null, 2));

for (const summary of summaries) {
  if (summary.p95Ms > 2_000) {
    throw new Error(`${summary.fixture}-match p95 exceeded 2s: ${summary.p95Ms}ms`);
  }
  if (summary.p99Ms > 5_000) {
    throw new Error(`${summary.fixture}-match p99 exceeded the 5s safety wall: ${summary.p99Ms}ms`);
  }
}
