'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { makeQrDataUrl } from '@/public/shared/qr-gen.js';
import { resolveAbsoluteJudgeUrl } from '@/lib/thai-ui-helpers';
import { calcKotcNextRaundStandings } from '@/lib/kotc-next/core';
import { buildKotcNextCockpitViewModel, presenceStatusLabel } from '@/lib/kotc-next/control-view-model';
import {
  resolveKotcNextRotatingPairLabel,
  rotatingDisplayedPairIdx,
  rotatingSecondaryPairIdx,
  usesKotcNextRotatingPairs,
} from '@/lib/kotc-next/pair-rotation';
import type { SudyamBootstrapPayload } from '@/lib/sudyam-bootstrap';
import type {
  KotcNextCourtOperatorView,
  KotcNextFinalIndividualRoundResult,
  KotcNextOperatorState,
  KotcNextR2ManualZone,
  KotcNextR2SeedZone,
  KotcNextTakeoversMode,
} from '@/lib/kotc-next/types';
import { zoneLabel } from '@/lib/kotc-next-config';
import { KotcNextFinalIndividualTables } from './KotcNextFinalIndividualTables';
import { KotcNextPlayerReplacementPanel } from './KotcNextPlayerReplacementPanel';
import { KotcNextR2ManualEditor } from './KotcNextR2ManualEditor';
import { KotcNextR2SeedEditor } from './KotcNextR2SeedEditor';
import TournamentControlMobileNav from '@/components/admin/TournamentControlMobileNav';

const UI = {
  qrAlt: '\u0051\u0052 \u0434\u043b\u044f \u043a\u043e\u0440\u0442\u0430',
  title: '\u041a\u043e\u0440\u043e\u043b\u044c \u043a\u043e\u0440\u0442\u0430',
  subtitle:
    '\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440 \u0432\u0435\u0434\u0451\u0442 bootstrap R1/R2, ' +
    '\u043e\u0442\u0441\u043b\u0435\u0436\u0438\u0432\u0430\u0435\u0442 \u043a\u043e\u0440\u0442\u044b, ' +
    '\u0430 \u043a\u0430\u0436\u0434\u044b\u0439 \u0441\u0443\u0434\u044c\u044f \u0437\u0430\u043a\u0440\u044b\u0432\u0430\u0435\u0442 ' +
    '\u0441\u0432\u043e\u0438 \u0440\u0430\u0443\u043d\u0434\u044b \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e \u043d\u0430 PIN-\u044d\u043a\u0440\u0430\u043d\u0435.',
  header: '\u0421\u0443\u0434\u044c\u0438 / KOTC Next',
  participants: '\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0438',
  courts: '\u041a\u043e\u0440\u0442\u044b',
  pairsPerCourt: '\u041f\u0430\u0440 \u043d\u0430 \u043a\u043e\u0440\u0442',
  roundsTimer: '\u0420\u0430\u0443\u043d\u0434\u044b / \u0442\u0430\u0439\u043c\u0435\u0440',
  blocked: '\u0417\u0430\u043f\u0443\u0441\u043a \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d',
  timerControl: '\u0423\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0442\u0430\u0439\u043c\u0435\u0440\u043e\u043c',
  timerHint:
    '\u041e\u0431\u0449\u0438\u0439 \u0437\u0430\u043f\u0443\u0441\u043a, \u043f\u0430\u0443\u0437\u0430, \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0435\u043d\u0438\u0435 ' +
    '\u0438 \u0444\u0438\u043d\u0438\u0448 \u0442\u0435\u043a\u0443\u0449\u0435\u0433\u043e \u0440\u0430\u0443\u043d\u0434\u0430 \u043d\u0430 \u0432\u0441\u0435\u0445 \u043a\u043e\u0440\u0442\u0430\u0445.',
  timerStart: '\u0421\u0442\u0430\u0440\u0442',
  timerPause: '\u041f\u0430\u0443\u0437\u0430',
  timerResume: '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c',
  timerFinish: '\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c',
  timerRemaining: '\u041e\u0441\u0442\u0430\u0442\u043e\u043a',
  timerCorrection: '\u041a\u043e\u0440\u0440\u0435\u043a\u0446\u0438\u044f \u0442\u0430\u0439\u043c\u0435\u0440\u0430',
  timerCorrectionHint:
    '\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e \u0430\u0434\u043c\u0438\u043d\u0443 \u0434\u043e \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f: \u043c\u043e\u0436\u043d\u043e ' +
    '\u0432\u044b\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u043d\u0443\u0436\u043d\u044b\u0439 \u043e\u0441\u0442\u0430\u0442\u043e\u043a \u0441 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e\u0439 \u043f\u0440\u0438\u0447\u0438\u043d\u043e\u0439.',
  timerSecondsPlaceholder: '\u0421\u0435\u043a\u0443\u043d\u0434',
  timerSetRemaining: '\u0423\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c',
  refresh: '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c',
  preparingR1: '\u041f\u043e\u0434\u0433\u043e\u0442\u0430\u0432\u043b\u0438\u0432\u0430\u0435\u043c R1 \u0438 \u0441\u0443\u0434\u0435\u0439\u0441\u043a\u0438\u0435 PIN-\u043a\u043e\u0440\u0442\u044b...',
  bootstrapHint:
    '\u0422\u0443\u0440\u043d\u0438\u0440 \u0435\u0449\u0451 \u043d\u0435 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u0438\u0437\u043e\u0432\u0430\u043d ' +
    '\u0432 KOTC Next. \u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u0435 R1, \u0447\u0442\u043e\u0431\u044b ' +
    '\u0441\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u043e\u0440\u0442\u044b \u0438 PIN-\u043a\u043e\u0434\u044b.',
  startingR1: '\u0417\u0430\u043f\u0443\u0441\u043a\u0430\u0435\u043c R1...',
  startR1: '\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c R1',
  collectingZones: '\u0421\u043e\u0431\u0438\u0440\u0430\u0435\u043c \u0437\u043e\u043d\u044b...',
  previewR2Zones: '\u041f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u0437\u043e\u043d R2',
  finishingR1: '\u0417\u0430\u0432\u0435\u0440\u0448\u0430\u0435\u043c R1...',
  finishR1: '\u25a0 \u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c R1',
  finishingR2: '\u0417\u0430\u0432\u0435\u0440\u0448\u0430\u0435\u043c R2...',
  finishR2: '\u25a0 \u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c R2',
  closingTournament: '\u0417\u0430\u043a\u0440\u044b\u0432\u0430\u0435\u043c \u0442\u0443\u0440\u043d\u0438\u0440...',
  closeTournament: '\u2713 \u0417\u0430\u043a\u0440\u044b\u0442\u044c \u0442\u0443\u0440\u043d\u0438\u0440',
  openActiveCourt: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0439 \u043a\u043e\u0440\u0442',
  spectatorBoard: '\u0422\u0430\u0431\u043b\u043e \u0434\u043b\u044f \u0437\u0440\u0438\u0442\u0435\u043b\u0435\u0439',
  printSchedule: '\u041f\u0435\u0447\u0430\u0442\u044c \u0440\u0430\u0441\u043f\u0438\u0441\u0430\u043d\u0438\u044f',
  seedHint:
    '\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u0430\u0432\u0442\u043e\u043f\u043e\u0441\u0435\u0432, ' +
    '\u043f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u043f\u0430\u0440\u044b \u043f\u043e \u0437\u043e\u043d\u0430\u043c ' +
    '\u0438 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0437\u0430\u043f\u0443\u0441\u043a R2.',
  courtsCount: '\u043a\u043e\u0440\u0442\u043e\u0432',
  court: '\u041a\u043e\u0440\u0442',
  round: '\u0420\u0430\u0443\u043d\u0434',
  manualR1: '\u0420\u0443\u0447\u043d\u043e\u0439 \u0432\u0432\u043e\u0434 \u043e\u0447\u043a\u043e\u0432 R1 \u00b7 \u043f\u0430\u0440\u044b \u043c\u0435\u043d\u044f\u044e\u0442\u0441\u044f \u043f\u043e \u0440\u0430\u0443\u043d\u0434\u0430\u043c',
  manualR2: '\u0420\u0443\u0447\u043d\u0430\u044f \u043a\u043e\u0440\u0440\u0435\u043a\u0446\u0438\u044f \u043e\u0447\u043a\u043e\u0432 R2',
  minusOne: '\u041c\u0438\u043d\u0443\u0441 \u043e\u0434\u043d\u043e \u043e\u0447\u043a\u043e',
  plusOne: '\u041f\u043b\u044e\u0441 \u043e\u0434\u043d\u043e \u043e\u0447\u043a\u043e',
  liveState: '\u0422\u0435\u043a\u0443\u0449\u0435\u0435 \u0441\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435',
  king: '\u041a\u043e\u0440\u043e\u043b\u044c',
  challenger: '\u041f\u0440\u0435\u0442\u0435\u043d\u0434\u0435\u043d\u0442',
  queue: '\u041e\u0447\u0435\u0440\u0435\u0434\u044c',
  none: '\u2014',
  standings: '\u0422\u0430\u0431\u043b\u0438\u0446\u0430',
  pair: '\u041f\u0430\u0440\u0430',
  games: '\u0418\u0433\u0440\u044b',
  openCourt: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043a\u043e\u0440\u0442',
  finals: '\u0424\u0438\u043d\u0430\u043b',
  finalZones: '\u0418\u0442\u043e\u0433\u043e\u0432\u044b\u0435 \u0437\u043e\u043d\u044b',
  finalIndividualZones: '\u0418\u0442\u043e\u0433\u043e\u0432\u044b\u0435 \u0437\u043e\u043d\u044b \u00b7 \u043b\u0438\u0447\u043d\u043e',
  men: '\u041c\u0443\u0436\u0447\u0438\u043d\u044b',
  women: '\u0416\u0435\u043d\u0449\u0438\u043d\u044b',
  playerResults: '\u0418\u0442\u043e\u0433\u0438 \u0438\u0433\u0440\u043e\u043a\u043e\u0432',
  playerResultsHint:
    '\u041b\u0438\u0447\u043d\u044b\u0439 \u0441\u0440\u0435\u0437 \u043f\u043e \u043a\u0430\u0436\u0434\u043e\u043c\u0443 \u0438\u0433\u0440\u043e\u043a\u0443: ' +
    '\u043e\u0442\u0434\u0435\u043b\u044c\u043d\u043e R1, \u043e\u0442\u0434\u0435\u043b\u044c\u043d\u043e R2 \u0438 \u0444\u0438\u043d\u0430\u043b\u044c\u043d\u0430\u044f \u0437\u043e\u043d\u0430.',
  player: '\u0418\u0433\u0440\u043e\u043a',
  finalPlace: '\u0424\u0438\u043d\u0430\u043b',
  total: '\u0418\u0442\u043e\u0433',
  roundDetails: '\u0420\u0430\u0443\u043d\u0434\u044b 1-5',
  roundDetailsHint:
    '\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 R1/R2 \u0438 \u043d\u043e\u043c\u0435\u0440 \u0440\u0430\u0443\u043d\u0434\u0430: ' +
    '\u043d\u0438\u0436\u0435 \u0432\u0438\u0434\u043d\u044b \u043e\u0447\u043a\u0438 \u043f\u0430\u0440, \u043c\u0443\u0436\u0447\u0438\u043d \u0438 \u0436\u0435\u043d\u0449\u0438\u043d \u043e\u0442\u0434\u0435\u043b\u044c\u043d\u043e.',
  pointsShort: 'KP',
  placeShort: '\u043c\u0435\u0441\u0442\u043e',
  adminTools: '\u0413\u043b\u0430\u0432\u043d\u044b\u0439 \u0430\u0434\u043c\u0438\u043d',
  adminHint:
    '\u041e\u043f\u0430\u0441\u043d\u044b\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b \u0442\u043e\u043b\u044c\u043a\u043e \u0433\u043b\u0430\u0432\u043d\u043e\u043c\u0443 \u0430\u0434\u043c\u0438\u043d\u0443.',
  controlCenterTitle: 'KOTC Next Control Center',
  controlCenterHint:
    '\u0417\u0434\u0435\u0441\u044c \u0430\u0434\u043c\u0438\u043d \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u0435\u0442 \u043e\u0431\u0449\u0438\u0439 \u0442\u0430\u0439\u043c\u0435\u0440, \u0441\u0442\u0430\u0432\u0438\u0442 \u043f\u0430\u0443\u0437\u0443, ' +
    '\u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0430\u0435\u0442 \u0440\u0430\u0443\u043d\u0434, \u0437\u0430\u0432\u0435\u0440\u0448\u0430\u0435\u0442 \u0435\u0433\u043e \u0438 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u0438\u0440\u0443\u0435\u0442 \u043e\u0441\u0442\u0430\u0442\u043e\u043a \u0432\u0440\u0435\u043c\u0435\u043d\u0438.',
  controlCenterOpen: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c Control Center',
  restartTitle: '\u0420\u0435\u0441\u0442\u0430\u0440\u0442 KOTC Next',
  restartHint:
    '\u041f\u043e\u043b\u043d\u044b\u0439 reset live-state \u0438 \u0438\u0442\u043e\u0433\u043e\u0432 KOTC Next \u0431\u0435\u0437 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u0441\u043e\u0441\u0442\u0430\u0432\u0430 \u0438 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043a.',
  restartOpen: '\u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c \u0440\u0435\u0441\u0442\u0430\u0440\u0442',
  restartConfirm: '\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c \u0440\u0435\u0441\u0442\u0430\u0440\u0442',
  restartBusy: '\u0420\u0435\u0441\u0442\u0430\u0440\u0442...',
  finishAllTitle: '\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c \u0432\u0441\u0435 \u0440\u0430\u0443\u043d\u0434\u044b',
  finishAllHint:
    '\u0415\u0441\u043b\u0438 \u043e\u0447\u043a\u0438 \u0443\u0436\u0435 \u0437\u0430\u043d\u0435\u0441\u0435\u043d\u044b \u0441 \u0431\u0443\u043c\u0430\u0436\u043a\u0438, ' +
    '\u0433\u043b\u0430\u0432\u043d\u044b\u0439 \u0430\u0434\u043c\u0438\u043d \u043c\u043e\u0436\u0435\u0442 \u0437\u0430 \u043e\u0434\u043d\u043e \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 ' +
    '\u0437\u0430\u043a\u0440\u044b\u0442\u044c \u0432\u0441\u0435 \u043d\u0435\u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d\u043d\u044b\u0435 \u0440\u0430\u0443\u043d\u0434\u044b \u043d\u0430 \u0432\u0441\u0435\u0445 \u043a\u043e\u0440\u0442\u0430\u0445.',
  finishAllOpen: '\u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u0435',
  finishAllConfirm: '\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c \u0432\u0441\u0435',
  finishAllBusy: '\u0417\u0430\u0432\u0435\u0440\u0448\u0430\u0435\u043c \u0432\u0441\u0451...',
  finishAllCount: '\u041d\u0435\u0437\u0430\u043a\u0440\u044b\u0442\u044b\u0445 \u0440\u0430\u0443\u043d\u0434\u043e\u0432',
  reasonLabel: '\u041f\u0440\u0438\u0447\u0438\u043d\u0430',
  reasonPlaceholder:
    '\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435, \u043f\u043e\u0447\u0435\u043c\u0443 \u0433\u043b\u0430\u0432\u043d\u044b\u0439 \u0430\u0434\u043c\u0438\u043d \u0431\u0435\u0440\u0451\u0442 \u0432\u0435\u0434\u0435\u043d\u0438\u0435 \u043d\u0430 \u0441\u0435\u0431\u044f',
  cancel: '\u041e\u0442\u043c\u0435\u043d\u0430',
  finishRaund: '\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c \u0440\u0430\u0443\u043d\u0434',
  finishRaundConfirm: '\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c finish',
  finishRaundBusy: '\u0424\u0438\u043d\u0438\u0448...',
  finishRaundHint:
    '\u0415\u0441\u043b\u0438 \u0441\u0443\u0434\u044c\u044f \u043d\u0435 \u0437\u0430\u043a\u0440\u044b\u043b \u0440\u0430\u0443\u043d\u0434, \u0433\u043b\u0430\u0432\u043d\u044b\u0439 \u0430\u0434\u043c\u0438\u043d \u043c\u043e\u0436\u0435\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c \u0435\u0433\u043e \u0432\u0440\u0443\u0447\u043d\u0443\u044e.',
} as const;

const QrCodeImage = memo(function QrCodeImage({ judgeUrl, label }: { judgeUrl: string; label: string }) {
  const dataUrl = useMemo(
    () =>
      makeQrDataUrl(
        typeof window === 'undefined' ? judgeUrl : resolveAbsoluteJudgeUrl(judgeUrl, window.location.origin),
        { scale: 4, margin: 1, dark: '#17130b', light: '#ffffff' },
      ),
    [judgeUrl],
  );

  return (
    <img
      src={dataUrl}
      alt={`${UI.qrAlt} ${label}`}
      className="h-20 w-20 rounded-2xl border border-[#2e2a1d] bg-white p-2"
    />
  );
});

export type KotcNextOperatorBootstrapPhase = 'idle' | 'bootstrapping' | 'blocked' | 'error';

function formatStage(stage: string | undefined): string {
  switch (stage) {
    case 'r1_live':
      return 'R1 LIVE';
    case 'r1_finished':
      return 'R1 FINISHED';
    case 'r2_live':
      return 'R2 LIVE';
    case 'r2_finished':
      return 'R2 FINISHED';
    default:
      return 'SETUP';
  }
}

function formatVariant(variant: string | undefined): string {
  const normalized = String(variant || '').trim().toUpperCase();
  if (normalized === 'MM' || normalized === 'WW' || normalized === 'MN') return normalized;
  return 'MF';
}

function formatMetricValue(value: unknown): string {
  if (value == null || value === '') return '-';
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return String(value);
  }
  return '-';
}

function formatRaundStatus(status: string | undefined): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'running') return 'LIVE';
  if (normalized === 'paused') return 'ПАУЗА';
  if (normalized === 'finished') return 'DONE';
  return 'PENDING';
}

function formatCourtStatus(status: string | undefined): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'live') return 'LIVE';
  if (normalized === 'finished') return 'DONE';
  return 'PENDING';
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function getRemainingMs(liveState: { timerStartedAt: string | null; timerPausedAt: string | null; timerMinutes: number; status: string } | null, now: number): number | null {
  if (!liveState?.timerStartedAt) return null;
  const finishAt = new Date(liveState.timerStartedAt).getTime() + liveState.timerMinutes * 60_000;
  const effectiveNow =
    liveState.status === 'paused' && liveState.timerPausedAt
      ? new Date(liveState.timerPausedAt).getTime()
      : now;
  return Math.max(0, finishAt - effectiveNow);
}

function pickStandings(court: KotcNextCourtOperatorView, takeoversMode: KotcNextTakeoversMode) {
  if (court.liveState?.pairs?.length) {
    return calcKotcNextRaundStandings(court.liveState.pairs, takeoversMode);
  }
  const latestFinished = [...court.raunds].reverse().find((raund) => Array.isArray(raund.standings));
  return latestFinished?.standings ?? [];
}

function labelForPair(
  court: KotcNextCourtOperatorView,
  pairIdx: number,
  variant?: string | null,
  raundNo?: number,
): string {
  if (variant && raundNo && usesKotcNextRotatingPairs(variant)) {
    return resolveKotcNextRotatingPairLabel(court.pairs, pairIdx, variant, raundNo);
  }
  return court.pairs.find((pair) => pair.pairIdx === pairIdx)?.label ?? `${UI.pair} ${pairIdx + 1}`;
}

function rotatingR1PairIndex(court: KotcNextCourtOperatorView, rowIndex: number, raundNo: number): number {
  return rotatingDisplayedPairIdx(rowIndex, raundNo, court.pairs.length);
}

function labelForRotatingR1Pair(
  court: KotcNextCourtOperatorView,
  pairIdx: number,
  variant: string | null | undefined,
  raundNo: number,
): string {
  return resolveKotcNextRotatingPairLabel(court.pairs, pairIdx, variant, raundNo);
}

function rotatingPairEntries(
  court: KotcNextCourtOperatorView,
  variant: string | null | undefined,
  raundNo: number,
): Array<{ pairIdx: number; label: string }> {
  return court.pairs.map((_, rowIndex) => {
    const pairIdx = rotatingDisplayedPairIdx(rowIndex, raundNo, court.pairs.length);
    return {
      pairIdx,
      label: labelForRotatingR1Pair(court, pairIdx, variant, raundNo),
    };
  });
}

function formatRun(value: { longestKingRun?: number; firstLongestKingRunOrder?: number | null }): string {
  const run = value.longestKingRun ?? 0;
  const order = value.firstLongestKingRunOrder ?? null;
  if (!run) return '0';
  return order ? `${run} (#${order})` : String(run);
}

function formatGenderBadge(gender: 'M' | 'W' | null | undefined): string {
  if (gender === 'M') return '\u041c';
  if (gender === 'W') return '\u0416';
  return '-';
}

function formatRoundResult(round: KotcNextFinalIndividualRoundResult | null): string {
  if (!round) return '-';
  const place = Number.isFinite(round.position) ? `#${round.position}` : '#-';
  const area = round.zoneLabel || round.courtLabel || `${UI.court} ${round.courtNo}`;
  return `${round.kingWins} ${UI.pointsShort} В· ${place} В· ${area}`;
}

type RoundDetailPairRow = {
  key: string;
  courtLabel: string;
  pairLabel: string;
  kingWins: number;
  takeovers: number;
  gamesPlayed: number;
};

export const KOTC_OPERATOR_RELEASE_GUARD = 'LPVOLLEY_KOTC_OPERATOR_V2_ONLY_20260810';

type RoundDetailPlayerRow = {
  key: string;
  playerName: string;
  pairLabel: string;
  courtLabel: string;
  kingWins: number;
  takeovers: number;
  gamesPlayed: number;
};

function pairForIdx(court: KotcNextCourtOperatorView, pairIdx: number) {
  return court.pairs.find((pair) => pair.pairIdx === pairIdx) ?? null;
}

function roundDetailKey(roundNo: number, raundNo: number, courtNo: number, pairIdx: number, slot: 'pair' | 'm' | 'w') {
  return `${roundNo}:${raundNo}:${courtNo}:${pairIdx}:${slot}`;
}

function buildRoundDetails(
  operatorState: KotcNextOperatorState | undefined,
  selectedRoundNo: number,
  selectedRaundNo: number,
  variant: string | null | undefined,
) {
  const round = operatorState?.rounds.find((item) => item.roundNo === selectedRoundNo) ?? null;
  const pairs: RoundDetailPairRow[] = [];
  const men: RoundDetailPlayerRow[] = [];
  const women: RoundDetailPlayerRow[] = [];

  for (const court of round?.courts ?? []) {
    const raund = court.raunds.find((item) => item.raundNo === selectedRaundNo) ?? null;
    for (const stat of raund?.standings ?? []) {
      const pairLabel = labelForPair(court, stat.pairIdx, variant, selectedRaundNo);
      const primaryPair = pairForIdx(court, stat.pairIdx);
      const secondaryIdx = usesKotcNextRotatingPairs(variant)
        ? rotatingSecondaryPairIdx(stat.pairIdx, selectedRaundNo, court.pairs.length)
        : stat.pairIdx;
      const secondaryPair = pairForIdx(court, secondaryIdx);

      pairs.push({
        key: roundDetailKey(selectedRoundNo, selectedRaundNo, court.courtNo, stat.pairIdx, 'pair'),
        courtLabel: court.label,
        pairLabel,
        kingWins: stat.kingWins,
        takeovers: stat.takeovers,
        gamesPlayed: stat.gamesPlayed,
      });

      if (primaryPair?.primaryPlayer?.name) {
        men.push({
          key: roundDetailKey(selectedRoundNo, selectedRaundNo, court.courtNo, stat.pairIdx, 'm'),
          playerName: primaryPair.primaryPlayer.name,
          pairLabel,
          courtLabel: court.label,
          kingWins: stat.kingWins,
          takeovers: stat.takeovers,
          gamesPlayed: stat.gamesPlayed,
        });
      }
      if (secondaryPair?.secondaryPlayer?.name) {
        women.push({
          key: roundDetailKey(selectedRoundNo, selectedRaundNo, court.courtNo, stat.pairIdx, 'w'),
          playerName: secondaryPair.secondaryPlayer.name,
          pairLabel,
          courtLabel: court.label,
          kingWins: stat.kingWins,
          takeovers: stat.takeovers,
          gamesPlayed: stat.gamesPlayed,
        });
      }
    }
  }

  const sortByScore = <T extends { kingWins: number; takeovers: number; gamesPlayed: number; playerName?: string; pairLabel?: string }>(
    rows: T[],
  ) =>
    [...rows].sort(
      (left, right) =>
        right.kingWins - left.kingWins ||
        right.takeovers - left.takeovers ||
        left.gamesPlayed - right.gamesPlayed ||
        String(left.playerName || left.pairLabel || '').localeCompare(String(right.playerName || right.pairLabel || '')),
    );

  return {
    pairs: sortByScore(pairs),
    men: sortByScore(men),
    women: sortByScore(women),
  };
}

export function KotcNextOperatorPanel({
  data,
  bootstrap,
  actions,
  cockpitV3Enabled,
  onReplacementChanged,
  title = UI.title,
  subtitle = UI.subtitle,
}: {
  data: SudyamBootstrapPayload;
  cockpitV3Enabled: boolean;
  bootstrap: {
    phase: KotcNextOperatorBootstrapPhase;
    message: string | null;
    lastUpdatedAt?: Date | null;
    onBootstrapR1: () => void;
    onRefresh: () => void;
  };
  actions: {
    pendingAction:
      | 'preview_r2_seed'
      | 'confirm_r2_seed'
      | 'preview_manual_r2'
      | 'confirm_manual_r2'
      | 'bootstrap_r2'
      | 'finish_r1'
      | 'finish_r2'
      | 'close_tournament'
      | 'reset_r2'
      | 'adjust_r1_pair_score'
      | 'adjust_r2_pair_score'
      | 'start_raund'
      | 'pause_raund'
      | 'resume_raund'
      | 'finish_raund'
      | 'set_remaining_time'
      | 'admin_reset'
      | 'force_finish_round'
      | 'force_finish_all_rounds'
      | null;
    r2SeedDraft: KotcNextR2SeedZone[] | null;
    manualR2Draft: KotcNextR2ManualZone[] | null;
    r2SeedLoading: boolean;
    onAction: (action: 'finish_r1' | 'finish_r2' | 'close_tournament') => void;
    onAdjustR1PairScore: (courtNo: number, raundNo: number, pairIdx: number, delta: number) => void;
    onAdjustR2PairScore: (courtNo: number, raundNo: number, pairIdx: number, delta: number) => void;
    onOpenR2Seed: () => void;
    onConfirmR2Seed: (zones: KotcNextR2SeedZone[]) => void;
    onOpenManualR2: () => void;
    onConfirmManualR2: (zones: KotcNextR2ManualZone[]) => void;
    onResetR2: () => void;
    onControlAction: (
      action: 'start_raund' | 'pause_raund' | 'resume_raund' | 'finish_raund',
      options: { roundNo?: number; raundNo?: number; reason?: string; acknowledgeOffline?: boolean },
    ) => void;
    onSetRemainingTime: (roundNo: number, raundNo: number, remainingSeconds: number, reason: string) => void;
    onAdminReset: (reason: string) => void;
    onAdminForceFinishAllRounds: (reason: string) => void;
    onAdminForceFinishRound: (roundNo: number, courtNo: number, raundNo: number, reason: string) => void;
  };
  onReplacementChanged?: (payload?: SudyamBootstrapPayload) => Promise<void> | void;
  title?: string;
  subtitle?: string;
}) {
  const operatorState = data.kotcOperatorState;
  const judgeModule = 'Next';
  const blockedReason = String(data.kotcJudgeBlockedReason || '').trim();
  const isNextModule = data.kotcJudgeModule === 'next';
  const tournamentStatus = String(data.bootstrapState.tournament.status || '').trim().toLowerCase();
  const canCloseTournament = Boolean(
    isNextModule &&
      operatorState?.stage === 'r2_finished' &&
      operatorState?.finalResults?.length &&
      tournamentStatus !== 'finished',
  );
  const canBootstrapR1 =
    isNextModule && !blockedReason && Boolean(operatorState?.canBootstrapR1 || data.kotcJudgeNeedsBootstrap);
  const participants = data.bootstrapState.participants.filter((participant) => !participant.isWaitlist);
  const activeCourt =
    operatorState?.rounds.flatMap((round) => round.courts).find((court) => court.status === 'live') ??
    operatorState?.rounds[0]?.courts[0] ??
    null;
  const variant = operatorState?.variant ?? (data.bootstrapState.settings.variant as string | undefined) ?? null;
  const bootstrapMessage =
    bootstrap.message ||
    (bootstrap.phase === 'bootstrapping' ? UI.preparingR1 : canBootstrapR1 ? UI.bootstrapHint : null);
  const canAdminResetKotcNext = Boolean(data.canAdminResetKotcNext);
  const canAdminForceFinishKotcRound = Boolean(data.canAdminForceFinishKotcRound);
  const [restartArmed, setRestartArmed] = useState(false);
  const [restartReason, setRestartReason] = useState('');
  const [forceFinishAllArmed, setForceFinishAllArmed] = useState(false);
  const [forceFinishAllReason, setForceFinishAllReason] = useState('');
  const [forceFinishKey, setForceFinishKey] = useState<string | null>(null);
  const [forceFinishReason, setForceFinishReason] = useState('');
  const [remainingSecondsInput, setRemainingSecondsInput] = useState('');
  const [timerReason, setTimerReason] = useState('');
  const [timerCorrectionArmed, setTimerCorrectionArmed] = useState(false);
  const [offlineOverrideArmed, setOfflineOverrideArmed] = useState(false);
  const [offlineOverrideReason, setOfflineOverrideReason] = useState('');
  const [roundDetailsRoundNo, setRoundDetailsRoundNo] = useState(2);
  const [roundDetailsRaundNo, setRoundDetailsRaundNo] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const pendingRaundCount =
    operatorState?.rounds.reduce(
      (sum, round) =>
        sum +
        round.courts.reduce(
          (courtSum, court) => courtSum + court.raunds.filter((raund) => raund.canAdminForceFinish).length,
          0,
        ),
      0,
    ) ?? 0;
  const availableRoundNos = operatorState?.rounds.map((round) => round.roundNo) ?? [];
  const selectedDetailsRoundNo = availableRoundNos.includes(roundDetailsRoundNo)
    ? roundDetailsRoundNo
    : availableRoundNos[availableRoundNos.length - 1] ?? 1;
  const selectedDetailsRound = operatorState?.rounds.find((round) => round.roundNo === selectedDetailsRoundNo) ?? null;
  const availableRaundNos = [
    ...new Set(selectedDetailsRound?.courts.flatMap((court) => court.raunds.map((raund) => raund.raundNo)) ?? []),
  ].sort((left, right) => left - right);
  const selectedDetailsRaundNo = availableRaundNos.includes(roundDetailsRaundNo)
    ? roundDetailsRaundNo
    : availableRaundNos[0] ?? 1;
  const roundDetails = useMemo(
    () => buildRoundDetails(operatorState, selectedDetailsRoundNo, selectedDetailsRaundNo, variant),
    [operatorState, selectedDetailsRoundNo, selectedDetailsRaundNo, variant],
  );
  const activeRound =
    operatorState?.rounds.find((round) => round.status !== 'finished') ??
    operatorState?.rounds[operatorState.rounds.length - 1] ??
    null;
  const activeRaund =
    activeRound?.courts[0]?.raunds.find((raund) => raund.status === 'running' || raund.status === 'paused') ??
    activeRound?.courts[0]?.raunds.find((raund) => raund.status === 'pending') ??
    activeRound?.courts[0]?.raunds[activeRound.courts[0].raunds.length - 1] ??
    null;
  const activeLiveState =
    activeRaund && activeRound
      ? activeRound.courts.find((court) => court.currentRaundNo === activeRaund.raundNo)?.liveState ??
        activeRound.courts[0]?.liveState ??
        null
      : null;
  const remainingMs = getRemainingMs(activeLiveState, now);
  const cockpit = operatorState ? buildKotcNextCockpitViewModel(operatorState, remainingMs) : null;
  const canSetRemainingTime =
    canAdminResetKotcNext &&
    !!activeRound &&
    !!activeRaund &&
    activeRaund.status !== 'finished';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div id="kotc-live-overview" data-judge-ui-release={KOTC_OPERATOR_RELEASE_GUARD} className="scroll-mt-24 space-y-4">
      <section className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,10,14,0.98),rgba(6,7,12,0.98))] px-5 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.34em] text-white/34">{UI.header}</div>
            <h2 className="mt-2 font-heading text-4xl uppercase tracking-[0.08em] text-[#ffd24a] sm:text-5xl">
              {title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/62">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#4b3c15] bg-[#1b160d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ffd24a]">
              {formatVariant(operatorState?.variant ?? (data.bootstrapState.settings.variant as string))}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#aeb6c8]">
              {judgeModule}
            </span>
            {operatorState ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#aeb6c8]">
                {formatStage(operatorState.stage)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">{UI.participants}</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">{participants.length}</div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">{UI.courts}</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">
              {formatMetricValue(operatorState?.params.courts ?? data.bootstrapState.settings.courts)}
            </div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">{UI.pairsPerCourt}</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">
              {formatMetricValue(operatorState?.params.ppc ?? data.bootstrapState.settings.kotcPpc)}
            </div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-[#11111d] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#78809a]">{UI.roundsTimer}</div>
            <div className="mt-2 text-2xl font-black tracking-[0.06em] text-white">
              {operatorState
                ? `${operatorState.params.raundCount} · ${operatorState.params.raundTimerMinutes}м`
                : `${data.bootstrapState.settings.kotcRaundCount ?? '-'} · ${data.bootstrapState.settings.kotcRaundTimerMinutes ?? '-'}м`}
            </div>
          </div>
        </div>

        {bootstrapMessage ? (
          <div
            role={bootstrap.phase === 'error' || bootstrap.phase === 'blocked' ? 'alert' : 'status'}
            aria-live="polite"
            className={`mt-4 rounded-[18px] px-4 py-3 text-sm ${
              bootstrap.phase === 'blocked' || blockedReason
                ? 'border border-red-400/30 bg-red-500/10 text-red-100'
                : bootstrap.phase === 'error'
                  ? 'border border-amber-400/30 bg-amber-500/10 text-amber-100'
                  : 'border border-sky-400/30 bg-sky-500/10 text-sky-100'
            }`}
          >
            {bootstrapMessage}
          </div>
        ) : null}

        {blockedReason ? (
          <div className="mt-4 rounded-[18px] border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            <div className="text-[10px] uppercase tracking-[0.28em] text-red-200/80">{UI.blocked}</div>
            <div className="mt-2">{blockedReason}</div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={bootstrap.onRefresh}
            className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
          >
            {UI.refresh}
          </button>
          {bootstrap.lastUpdatedAt ? (
            <span className="text-[11px] tracking-[0.16em] text-white/35">
              {new Intl.DateTimeFormat('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }).format(bootstrap.lastUpdatedAt)}
            </span>
          ) : null}
          {canBootstrapR1 ? (
            <button
              type="button"
              onClick={bootstrap.onBootstrapR1}
              disabled={bootstrap.phase === 'bootstrapping'}
              className="inline-flex rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bootstrap.phase === 'bootstrapping' ? UI.startingR1 : UI.startR1}
            </button>
          ) : null}
          {operatorState?.canPreviewR2Seed ? (
            <button
              type="button"
              onClick={actions.onOpenR2Seed}
              disabled={actions.r2SeedLoading}
              className="inline-flex rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actions.r2SeedLoading ? UI.collectingZones : UI.previewR2Zones}
            </button>
          ) : null}
          {operatorState?.canFinishR1 ? (
            <button
              type="button"
              onClick={() => actions.onAction('finish_r1')}
              disabled={actions.pendingAction === 'finish_r1'}
              className="inline-flex rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 transition hover:border-red-300/50 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actions.pendingAction === 'finish_r1' ? UI.finishingR1 : UI.finishR1}
            </button>
          ) : null}
          {canCloseTournament ? (
            <button
              type="button"
              onClick={() => actions.onAction('close_tournament')}
              disabled={actions.pendingAction === 'close_tournament'}
              className="inline-flex rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 transition hover:border-red-300/50 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actions.pendingAction === 'close_tournament' ? UI.closingTournament : UI.closeTournament}
            </button>
          ) : null}
          {activeCourt ? (
            <a
              href={activeCourt.judgeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
            >
              {UI.openActiveCourt}
            </a>
          ) : null}
          {operatorState?.rounds.length && data.tournamentId ? (
            <a
              href={`/live/kotcn/${encodeURIComponent(data.tournamentId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:border-emerald-400/50 hover:bg-emerald-500/15"
            >
              {UI.spectatorBoard}
            </a>
          ) : null}
          {data.tournamentId ? (
            <a
              href={`/admin/tournaments/${encodeURIComponent(data.tournamentId)}/kotcn-schedule-print`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
            >
              {UI.printSchedule}
            </a>
          ) : null}
        </div>
      </section>

      {operatorState && activeRound && activeRaund ? (
        <section id="kotc-control-timer" className="scroll-mt-24 rounded-[24px] border border-amber-300/20 bg-[linear-gradient(180deg,rgba(35,27,10,0.96),rgba(17,13,7,0.96))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-amber-200/70">{UI.timerControl}</div>
              <h3 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">
                R{activeRound.roundNo} · {UI.round} {activeRaund.raundNo}
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-50/75">{UI.timerHint}</p>
            </div>
            <div className="min-w-[180px] rounded-[18px] border border-[#5b4713] bg-[#18140d] px-4 py-3 text-center">
              <div className="text-[10px] uppercase tracking-[0.22em] text-[#8f7c4a]">{UI.timerRemaining}</div>
              <div className="mt-2 text-4xl font-black tracking-[0.08em] text-[#ffd24a]">
                {remainingMs == null ? '--:--' : formatClock(remainingMs)}
              </div>
              <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-white/55">
                {activeRaund.displayStatus}
              </div>
            </div>
          </div>
          {cockpitV3Enabled && cockpit ? (
            <div className="mt-4 space-y-3">
              <nav aria-label="Этап турнира" className="grid grid-cols-4 gap-1">
                {cockpit.steps.map((step) => (
                  step.clickable ? (
                    <a key={step.id} href={step.id === 'setup' ? '#kotc-live-overview' : step.id === 'finish' ? '#kotc-live-results' : `#kotc-round-${step.id === 'r1' ? 1 : 2}`} className={`flex min-h-10 items-center justify-center rounded-xl border px-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] ${step.state === 'current' ? 'border-[#ffd24a] bg-[#ffd24a]/15 text-[#ffe47a]' : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'}`}>
                      {step.label}
                    </a>
                  ) : (
                    <span key={step.id} aria-disabled="true" className="flex min-h-10 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] px-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">{step.label}</span>
                  )
                ))}
              </nav>
              <div className="sticky bottom-[76px] z-20 rounded-[20px] border border-[#ffd24a]/30 bg-[#17130b]/95 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur md:static">
                <button
                  type="button"
                  disabled={cockpit.primaryAction === 'none' || actions.pendingAction !== null}
                  onClick={() => {
                    if (cockpit.primaryAction === 'none') return;
                    if (cockpit.primaryAction === 'start_raund' && cockpit.primaryDisabledReason) {
                      setOfflineOverrideArmed(true);
                      return;
                    }
                    actions.onControlAction(cockpit.primaryAction, { roundNo: activeRound.roundNo, raundNo: activeRaund.raundNo });
                  }}
                  className="flex min-h-14 w-full items-center justify-center rounded-2xl border border-[#ffe47a]/40 bg-[#ffd24a] px-5 py-3 text-base font-black uppercase tracking-[0.05em] text-[#17130b] shadow-[0_14px_35px_rgba(255,210,74,0.18)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {actions.pendingAction ? 'Выполняем…' : cockpit.primaryLabel}
                </button>
                {cockpit.warnings.length ? <p className="mt-2 text-xs text-amber-100/75">{cockpit.warnings.join(' · ')}</p> : null}
              </div>
              {offlineOverrideArmed ? (
                <div className="rounded-[18px] border border-red-300/30 bg-red-500/10 p-4">
                  <div className="text-sm font-semibold text-red-100">Запуск при отсутствии связи</div>
                  <p className="mt-1 text-xs leading-5 text-red-100/70">Сервер повторно проверит все корты. При подтверждении будут запущены все корты, без частичного старта.</p>
                  <input value={offlineOverrideReason} onChange={(event) => setOfflineOverrideReason(event.target.value)} placeholder="Обязательная причина" className="mt-3 w-full rounded-2xl border border-red-300/25 bg-black/25 px-3 py-3 text-sm text-white outline-none" />
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setOfflineOverrideArmed(false)} className="rounded-full border border-white/10 px-4 py-2 text-sm text-white">Отмена</button>
                    <button type="button" disabled={!canAdminResetKotcNext || !offlineOverrideReason.trim() || actions.pendingAction !== null} onClick={() => actions.onControlAction('start_raund', { roundNo: activeRound.roundNo, raundNo: activeRaund.raundNo, acknowledgeOffline: true, reason: offlineOverrideReason.trim() })} className="rounded-full border border-red-300/35 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-50 disabled:opacity-40">Подтвердить запуск всех кортов</button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2" data-kotcn-cockpit="legacy">
              {(['start_raund', 'pause_raund', 'resume_raund', 'finish_raund'] as const).map((action) => {
                const enabled = action === 'start_raund'
                  ? activeRaund.status === 'pending'
                  : action === 'pause_raund'
                    ? activeRaund.status === 'running'
                    : action === 'resume_raund'
                      ? activeRaund.status === 'paused'
                      : (activeRaund.status === 'running' || activeRaund.status === 'paused') && remainingMs === 0;
                const label = action === 'start_raund' ? UI.timerStart : action === 'pause_raund' ? UI.timerPause : action === 'resume_raund' ? UI.timerResume : UI.timerFinish;
                return <button key={action} type="button" disabled={!enabled || actions.pendingAction !== null} onClick={() => actions.onControlAction(action, { roundNo: activeRound.roundNo, raundNo: activeRaund.raundNo })} className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:opacity-35">{label}</button>;
              })}
            </div>
          )}
          {canSetRemainingTime ? (
            <div className="mt-4 rounded-[18px] border border-orange-300/20 bg-black/20 p-4">
              <div className="text-[10px] uppercase tracking-[0.24em] text-orange-100/70">{UI.timerCorrection}</div>
              <p className="mt-2 text-sm leading-6 text-orange-50/75">{UI.timerCorrectionHint}</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-[140px_minmax(220px,1fr)_auto]">
                <input
                  inputMode="numeric"
                  value={remainingSecondsInput}
                  onChange={(event) => setRemainingSecondsInput(event.target.value)}
                  placeholder={UI.timerSecondsPlaceholder}
                  className="rounded-2xl border border-orange-300/20 bg-[#190d0d] px-3 py-3 text-sm text-white outline-none transition focus:border-orange-300/45"
                />
                <input
                  value={timerReason}
                  onChange={(event) => setTimerReason(event.target.value)}
                  placeholder={UI.reasonPlaceholder}
                  className="rounded-2xl border border-orange-300/20 bg-[#190d0d] px-3 py-3 text-sm text-white outline-none transition focus:border-orange-300/45"
                />
                <button
                  type="button"
                  disabled={
                    actions.pendingAction !== null ||
                    !timerReason.trim() ||
                    !Number.isFinite(Number(remainingSecondsInput)) ||
                    Number(remainingSecondsInput) < 0
                  }
                  onClick={() => {
                    if (!timerCorrectionArmed) {
                      setTimerCorrectionArmed(true);
                      return;
                    }
                    actions.onSetRemainingTime(
                      activeRound.roundNo,
                      activeRaund.raundNo,
                      Number(remainingSecondsInput),
                      timerReason.trim(),
                    );
                    setRemainingSecondsInput('');
                    setTimerReason('');
                    setTimerCorrectionArmed(false);
                  }}
                  className="inline-flex rounded-full border border-orange-300/35 bg-orange-400/15 px-4 py-2 text-sm font-semibold text-orange-50 transition hover:bg-orange-400/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {timerCorrectionArmed ? 'Подтвердить изменение времени' : UI.timerSetRemaining}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {canAdminResetKotcNext ? (
        <section id="kotc-admin-actions" className="scroll-mt-24 rounded-[24px] border border-red-400/25 bg-[linear-gradient(180deg,rgba(48,12,12,0.94),rgba(24,10,10,0.96))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
          <div className="text-[10px] uppercase tracking-[0.3em] text-red-200/75">{UI.adminTools}</div>
          {data.tournamentId ? (
            <div className="mt-4 rounded-[18px] border border-orange-300/20 bg-black/20 p-4">
              <div className="text-[10px] uppercase tracking-[0.26em] text-orange-100/70">{UI.controlCenterTitle}</div>
              <p className="mt-2 text-sm leading-6 text-orange-50/80">{UI.controlCenterHint}</p>
              <div className="mt-4">
                <a
                  href={`/admin/tournaments/${encodeURIComponent(data.tournamentId)}/kotcn-live`}
                  className="inline-flex rounded-full border border-orange-300/35 bg-orange-400/15 px-4 py-2 text-sm font-semibold text-orange-50 transition hover:bg-orange-400/25"
                >
                  {UI.controlCenterOpen}
                </a>
              </div>
            </div>
          ) : null}
          <h3 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-red-100">{UI.restartTitle}</h3>
          <p className="mt-2 text-sm leading-6 text-red-100/75">{UI.restartHint}</p>
          <p className="mt-2 text-xs text-red-100/55">{UI.adminHint}</p>
          {canAdminForceFinishKotcRound ? (
            <div className="mt-4 rounded-[18px] border border-red-400/20 bg-black/20 p-4">
              <div className="text-[10px] uppercase tracking-[0.26em] text-red-200/70">{UI.finishAllTitle}</div>
              <p className="mt-2 text-sm leading-6 text-red-100/75">{UI.finishAllHint}</p>
              <div className="mt-2 text-xs text-red-100/60">
                {UI.finishAllCount}: {pendingRaundCount}
              </div>
              {forceFinishAllArmed ? (
                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-medium text-red-50">
                    {UI.reasonLabel}
                    <textarea
                      value={forceFinishAllReason}
                      onChange={(event) => setForceFinishAllReason(event.target.value)}
                      placeholder={UI.reasonPlaceholder}
                      className="mt-2 min-h-24 w-full rounded-2xl border border-red-400/25 bg-[#190d0d] px-3 py-3 text-sm text-white outline-none transition focus:border-red-300/50"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setForceFinishAllArmed(false);
                        setForceFinishAllReason('');
                      }}
                      className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
                    >
                      {UI.cancel}
                    </button>
                    <button
                      type="button"
                      disabled={actions.pendingAction === 'force_finish_all_rounds' || !forceFinishAllReason.trim() || pendingRaundCount < 1}
                      onClick={() => {
                        actions.onAdminForceFinishAllRounds(forceFinishAllReason.trim());
                        setForceFinishAllArmed(false);
                        setForceFinishAllReason('');
                      }}
                      className="inline-flex rounded-full border border-red-300/35 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-50 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actions.pendingAction === 'force_finish_all_rounds' ? UI.finishAllBusy : UI.finishAllConfirm}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <button
                    type="button"
                    disabled={pendingRaundCount < 1 || actions.pendingAction !== null}
                    onClick={() => setForceFinishAllArmed(true)}
                    className="inline-flex rounded-full border border-red-300/35 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-50 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {UI.finishAllOpen}
                  </button>
                </div>
              )}
            </div>
          ) : null}
          {restartArmed ? (
            <div className="mt-4 space-y-3 rounded-[18px] border border-red-400/20 bg-black/20 p-4">
              <label className="block text-sm font-medium text-red-50">
                {UI.reasonLabel}
                <textarea
                  value={restartReason}
                  onChange={(event) => setRestartReason(event.target.value)}
                  placeholder={UI.reasonPlaceholder}
                  className="mt-2 min-h-24 w-full rounded-2xl border border-red-400/25 bg-[#190d0d] px-3 py-3 text-sm text-white outline-none transition focus:border-red-300/50"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRestartArmed(false);
                    setRestartReason('');
                  }}
                  className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
                >
                  {UI.cancel}
                </button>
                <button
                  type="button"
                  disabled={actions.pendingAction === 'admin_reset' || !restartReason.trim()}
                  onClick={() => actions.onAdminReset(restartReason.trim())}
                  className="inline-flex rounded-full border border-red-300/35 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-50 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actions.pendingAction === 'admin_reset' ? UI.restartBusy : UI.restartConfirm}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setRestartArmed(true)}
                className="inline-flex rounded-full border border-red-300/35 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-50 transition hover:bg-red-500/25"
              >
                {UI.restartOpen}
              </button>
            </div>
          )}
        </section>
      ) : null}

      {data.tournamentId ? (
        <div id="kotc-player-replacement" className="scroll-mt-24">
          <KotcNextPlayerReplacementPanel
            tournamentId={data.tournamentId}
            participants={data.bootstrapState.participants}
            disabled={bootstrap.phase === 'bootstrapping' || actions.pendingAction !== null}
            onChanged={onReplacementChanged}
          />
        </div>
      ) : null}

      {operatorState?.canPreviewR2Seed ? (
        <KotcNextR2SeedEditor
          draft={actions.r2SeedDraft}
          loading={actions.r2SeedLoading || actions.pendingAction === 'confirm_r2_seed'}
          message={actions.r2SeedDraft ? null : UI.seedHint}
          onReload={actions.onOpenR2Seed}
          onConfirm={actions.onConfirmR2Seed}
        />
      ) : null}

      {operatorState?.canPreviewManualR2 ? (
        <KotcNextR2ManualEditor
          draft={actions.manualR2Draft}
          loading={actions.r2SeedLoading || actions.pendingAction === 'confirm_manual_r2'}
          canResetR2={operatorState.canResetR2}
          onReload={actions.onOpenManualR2}
          onConfirm={actions.onConfirmManualR2}
          onResetR2={actions.onResetR2}
        />
      ) : null}

      {operatorState ? (
        <>
          {operatorState.rounds.map((round) => (
            <section key={round.roundId} id={`kotc-round-${round.roundNo}`} className="scroll-mt-24 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">
                    {round.roundType.toUpperCase()} · {String(round.status || '').toUpperCase()}
                  </h3>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-[#7d8498]">
                    {round.courts.length} {UI.courtsCount}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {round.courts.map((court) => {
                  const standings = pickStandings(court, operatorState?.params.takeoversMode ?? 'standard');
                  const isLive = court.status === 'live';
                  // Score corrections are intentionally available only in the audited admin Control Center.
                  const canAdjustR1Scores = false;
                  const canAdjustR2Scores = false;

                  return (
                    <article
                      key={court.courtId}
                      id={`kotc-court-${round.roundNo}-${court.courtNo}`}
                      className={`scroll-mt-24 rounded-[24px] border bg-[linear-gradient(180deg,rgba(20,24,37,0.98),rgba(10,13,24,0.98))] px-4 py-4 transition-shadow ${
                        isLive
                          ? 'border-[#2fd35a] shadow-[0_18px_50px_rgba(47,211,90,0.12)]'
                          : 'border-[#2d3144] shadow-[0_18px_50px_rgba(0,0,0,0.26)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">
                            {round.roundType === 'r2' ? court.label : `${UI.court} ${court.label}`}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-[#4b3c15] bg-[#1b160d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ffd24a]">
                              PIN {court.pinCode}
                            </span>
                            <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#aeb6c8]">
                              {formatCourtStatus(court.status)}
                            </span>
                            <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#aeb6c8]">
                              {UI.round} {court.currentRaundNo ?? '-'}
                            </span>
                            <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${court.presence.status === 'online' ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100' : court.presence.status === 'stale' ? 'border-amber-300/25 bg-amber-500/10 text-amber-100' : 'border-red-300/25 bg-red-500/10 text-red-100'}`}>
                              {presenceStatusLabel(court.presence.status)} · {court.presence.onlineDevices} устр.
                            </span>
                            <span className="text-[11px] text-white/40">
                              heartbeat {court.presence.lastSeenAt ? new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(court.presence.lastSeenAt)) : '—'}
                            </span>
                          </div>
                        </div>
                        <QrCodeImage judgeUrl={court.judgeUrl} label={court.label} />
                      </div>

                      {canAdjustR1Scores ? (
                        <div className="mt-4 space-y-3 rounded-[18px] border border-[#5b4713] bg-[#18140d] p-3">
                          <div className="text-[10px] uppercase tracking-[0.26em] text-[#8f7c4a]">{UI.manualR1}</div>
                          {court.raunds.map((raund) => {
                            const scoreByPair = new Map((raund.standings ?? []).map((row) => [row.pairIdx, row.kingWins]));
                            return (
                              <div key={`${court.courtId}-manual-${raund.raundNo}`} className="space-y-2">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ffd24a]">
                                  {UI.round} {raund.raundNo}
                                </div>
                                {court.pairs.map((pair, rowIndex) => {
                                  const pairIdx = rotatingR1PairIndex(court, rowIndex, raund.raundNo);
                                  const label = labelForRotatingR1Pair(court, pairIdx, variant, raund.raundNo);
                                  return (
                                    <div
                                      key={`${court.courtId}-${raund.raundNo}-${pairIdx}`}
                                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-sm font-medium text-white/88"
                                    >
                                      <span>{label}</span>
                                      <span className="inline-flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => actions.onAdjustR1PairScore(court.courtNo, raund.raundNo, pairIdx, -1)}
                                          disabled={actions.pendingAction === 'adjust_r1_pair_score'}
                                          className="h-8 w-8 rounded-full border border-red-400/30 bg-red-500/10 text-sm font-black text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                          aria-label={`${UI.minusOne}: ${label}`}
                                        >
                                          -1
                                        </button>
                                        <span className="min-w-10 rounded-full border border-[#5b4713] bg-[#10101a] px-3 py-1 text-center text-[#ffd24a]">
                                          {scoreByPair.get(pairIdx) ?? 0}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => actions.onAdjustR1PairScore(court.courtNo, raund.raundNo, pairIdx, 1)}
                                          disabled={actions.pendingAction === 'adjust_r1_pair_score'}
                                          className="h-8 w-8 rounded-full border border-emerald-400/30 bg-emerald-500/10 text-sm font-black text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                          aria-label={`${UI.plusOne}: ${label}`}
                                        >
                                          +1
                                        </button>
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      ) : canAdjustR2Scores ? (
                        <div className="mt-4 space-y-3 rounded-[18px] border border-[#5b4713] bg-[#18140d] p-3">
                          <div className="text-[10px] uppercase tracking-[0.26em] text-[#8f7c4a]">{UI.manualR2}</div>
                          {court.raunds.map((raund) => {
                            const scoreByPair = new Map((raund.standings ?? []).map((row) => [row.pairIdx, row.kingWins]));
                            return (
                              <div key={`${court.courtId}-manual-r2-${raund.raundNo}`} className="space-y-2">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ffd24a]">
                                  {UI.round} {raund.raundNo}
                                </div>
                                {rotatingPairEntries(court, variant, raund.raundNo).map(({ pairIdx, label }) => (
                                  <div
                                    key={`${court.courtId}-${raund.raundNo}-r2-${pairIdx}`}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-sm font-medium text-white/88"
                                  >
                                    <span>{label}</span>
                                    <span className="inline-flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => actions.onAdjustR2PairScore(court.courtNo, raund.raundNo, pairIdx, -1)}
                                        disabled={actions.pendingAction === 'adjust_r2_pair_score'}
                                        className="h-8 w-8 rounded-full border border-red-400/30 bg-red-500/10 text-sm font-black text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                        aria-label={`${UI.minusOne} R2: ${label}`}
                                      >
                                        -1
                                      </button>
                                      <span className="min-w-10 rounded-full border border-[#5b4713] bg-[#10101a] px-3 py-1 text-center text-[#ffd24a]">
                                        {scoreByPair.get(pairIdx) ?? 0}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => actions.onAdjustR2PairScore(court.courtNo, raund.raundNo, pairIdx, 1)}
                                        disabled={actions.pendingAction === 'adjust_r2_pair_score'}
                                        className="h-8 w-8 rounded-full border border-emerald-400/30 bg-emerald-500/10 text-sm font-black text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                        aria-label={`${UI.plusOne} R2: ${label}`}
                                      >
                                        +1
                                      </button>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-4 grid gap-2">
                          {rotatingPairEntries(court, variant, court.currentRaundNo || 1).map(({ pairIdx, label }) => (
                            <div
                              key={`${court.courtId}-${pairIdx}`}
                              className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-sm font-medium text-white/88"
                            >
                              {label}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {court.raunds.map((raund) => {
                          const adminKey = `${round.roundNo}:${court.courtNo}:${raund.raundNo}`;
                          return (
                            <div key={`${court.courtId}-raund-${raund.raundNo}`} className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-white/8 bg-[#10101a] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#aeb6c8]">
                                R{raund.raundNo} · {formatRaundStatus(raund.status)}
                              </span>
                              {canAdminForceFinishKotcRound && raund.canAdminForceFinish ? (
                                forceFinishKey === adminKey ? (
                                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2">
                                    <input
                                      value={forceFinishReason}
                                      onChange={(event) => setForceFinishReason(event.target.value)}
                                      placeholder={UI.reasonPlaceholder}
                                      className="min-w-[220px] flex-1 rounded-full border border-red-300/20 bg-[#190d0d] px-3 py-2 text-xs text-white outline-none transition focus:border-red-300/50"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setForceFinishKey(null);
                                        setForceFinishReason('');
                                      }}
                                      className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white transition hover:border-white/20 hover:bg-white/10"
                                    >
                                      {UI.cancel}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={actions.pendingAction === 'force_finish_round' || !forceFinishReason.trim()}
                                      onClick={() =>
                                        actions.onAdminForceFinishRound(
                                          round.roundNo,
                                          court.courtNo,
                                          raund.raundNo,
                                          forceFinishReason.trim(),
                                        )
                                      }
                                      className="inline-flex rounded-full border border-red-300/30 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-50 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {actions.pendingAction === 'force_finish_round' ? UI.finishRaundBusy : UI.finishRaundConfirm}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setForceFinishKey(adminKey);
                                      setForceFinishReason('');
                                    }}
                                    className="inline-flex rounded-full border border-red-300/25 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-red-50 transition hover:bg-red-500/20"
                                  >
                                    {UI.finishRaund}
                                  </button>
                                )
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                      {canAdminForceFinishKotcRound ? (
                        <div className="mt-3 text-xs text-red-100/55">{UI.finishRaundHint}</div>
                      ) : null}

                      {court.liveState ? (() => {
                        const liveState = court.liveState;
                        return (
                        <div className="mt-4 rounded-[18px] border border-white/8 bg-[#10101a] p-3">
                          <div className="text-[10px] uppercase tracking-[0.26em] text-[#7d8498]">{UI.liveState}</div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-2xl border border-[#5b4713] bg-[#18140d] px-3 py-3">
                              <div className="text-[10px] uppercase tracking-[0.2em] text-[#8f7c4a]">{UI.king}</div>
                              <div className="mt-2 text-sm font-semibold text-white">
                                {labelForPair(court, liveState.kingPairIdx, variant, liveState.currentRaundNo)}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                              <div className="text-[10px] uppercase tracking-[0.2em] text-[#7d8498]">{UI.challenger}</div>
                              <div className="mt-2 text-sm font-semibold text-white">
                                {labelForPair(court, liveState.challengerPairIdx, variant, liveState.currentRaundNo)}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 text-xs text-[#9aa1b3]">
                            {UI.queue}:{' '}
                            {liveState.queueOrder
                              .map((pairIdx) => labelForPair(court, pairIdx, variant, liveState.currentRaundNo))
                              .join(' · ') || UI.none}
                          </div>
                        </div>
                        );
                      })() : null}

                      <div className="mt-4 rounded-[18px] border border-white/8 bg-[#10101a] p-3">
                        <div className="text-[10px] uppercase tracking-[0.26em] text-[#7d8498]">{UI.standings}</div>
                        <div className="mt-3 overflow-x-auto">
                          <table className="min-w-full text-left text-xs text-white/82">
                            <thead className="text-[10px] uppercase tracking-[0.22em] text-[#7d8498]">
                              <tr>
                                <th className="pb-2 pr-3">{UI.pair}</th>
                                <th className="pb-2 px-2 text-center">KP</th>
                                <th className="pb-2 px-2 text-center">Run</th>
                                <th className="pb-2 px-2 text-center">TO</th>
                                <th className="pb-2 pl-2 text-center">{UI.games}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {standings.map((row) => (
                                <tr key={`${court.courtId}-standing-${row.pairIdx}`} className="border-t border-white/6">
                                  <td className="py-2 pr-3 font-medium text-white">
                                    {labelForPair(court, row.pairIdx, variant, court.currentRaundNo || 1)}
                                  </td>
                                  <td className="py-2 px-2 text-center text-[#ffd24a]">{row.kingWins}</td>
                                  <td className="py-2 px-2 text-center text-[#8ee6ff]">{formatRun(row)}</td>
                                  <td className="py-2 px-2 text-center">{row.takeovers}</td>
                                  <td className="py-2 pl-2 text-center">{row.gamesPlayed}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="mt-4">
                        <a
                          href={court.judgeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex rounded-full border border-[#5b4713] bg-[#ffd24a] px-4 py-2 text-sm font-semibold text-[#17130b] transition hover:bg-[#ffe07f]"
                        >
                          {UI.openCourt}
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}

          {operatorState?.rounds?.length ? (
            <section id="kotc-live-results" className="scroll-mt-24 rounded-[24px] border border-[#2d3144] bg-[linear-gradient(180deg,rgba(20,24,37,0.98),rgba(10,13,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">{UI.standings}</div>
                  <h3 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">
                    {UI.roundDetails}
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">{UI.roundDetailsHint}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableRoundNos.map((roundNo) => (
                    <button
                      key={`details-round-${roundNo}`}
                      type="button"
                      onClick={() => {
                        setRoundDetailsRoundNo(roundNo);
                        setRoundDetailsRaundNo(1);
                      }}
                      className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition ${
                        selectedDetailsRoundNo === roundNo
                          ? 'border-[#ffd24a] bg-[#ffd24a] text-[#17130b]'
                          : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      R{roundNo}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {availableRaundNos.map((raundNo) => (
                  <button
                    key={`details-raund-${raundNo}`}
                    type="button"
                    onClick={() => setRoundDetailsRaundNo(raundNo)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] transition ${
                      selectedDetailsRaundNo === raundNo
                        ? 'border-[#ffd24a] bg-[#1b160d] text-[#ffd24a]'
                        : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    Раунд {raundNo}
                  </button>
                ))}
              </div>
              <div className="mt-5 grid gap-3 xl:grid-cols-3">
                {[
                  { title: UI.pair, rows: roundDetails.pairs, kind: 'pair' as const },
                  { title: UI.men, rows: roundDetails.men, kind: 'player' as const },
                  { title: UI.women, rows: roundDetails.women, kind: 'player' as const },
                ].map((block) => (
                  <div key={block.title} className="rounded-[18px] border border-white/8 bg-[#10101a] p-4">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">{block.title}</div>
                    <div className="mt-3 space-y-2">
                      {block.rows.map((row, index) => (
                        <div
                          key={row.key}
                          className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2 text-sm text-white"
                        >
                          <span className="text-xs font-black text-[#ffd24a]">#{index + 1}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">
                              {'playerName' in row ? row.playerName : row.pairLabel}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-white/45">
                              {row.courtLabel}{'playerName' in row ? ` В· ${row.pairLabel}` : ''}
                            </span>
                          </span>
                          <span className="rounded-full border border-[#5b4713] bg-[#18140d] px-3 py-1 text-xs font-black text-[#ffd24a]">
                            {row.kingWins} {UI.pointsShort}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {operatorState.finalIndividualResults?.length ? (
            <KotcNextFinalIndividualTables
              rows={operatorState.finalIndividualResults}
              eyebrow={UI.finals}
              title={UI.finalIndividualZones}
              hint={UI.playerResultsHint}
            />
          ) : null}

          {false && operatorState?.finalResults?.length ? (
            <section className="rounded-[24px] border border-[#2d3144] bg-[linear-gradient(180deg,rgba(20,24,37,0.98),rgba(10,13,24,0.98))] px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#8f7c4a]">{UI.finals}</div>
              <h3 className="mt-2 font-heading text-2xl uppercase tracking-[0.08em] text-[#ffd24a]">{UI.finalZones}</h3>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {operatorState?.finalResults?.map((zone) => (
                  <div key={zone.zone} className="rounded-[18px] border border-white/8 bg-[#10101a] p-4">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-[#8f7c4a]">{zone.zoneLabel}</div>
                    <div className="mt-3 space-y-2">
                      {zone.pairs.map((pair) => (
                        <div
                          key={`${zone.zone}-${pair.position}-${pair.pairLabel}`}
                          className="rounded-2xl border border-[#5b4713] bg-[#18140d] px-3 py-2 text-sm font-semibold text-white"
                        >
                          #{pair.position} · {pair.pairLabel} · KP {pair.kingWins} · Run {formatRun(pair)} · TO{' '}
                          {pair.takeovers}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
      {operatorState && data.tournamentId ? (
        <TournamentControlMobileNav
          format="KOTC"
          overviewTargetId="kotc-live-overview"
          resultsTargetId="kotc-live-results"
          rounds={operatorState.rounds.map((round) => ({
            key: String(round.roundNo),
            label: `R${round.roundNo}`,
            status: round.status,
            targetId: `kotc-round-${round.roundNo}`,
            active: round.status !== 'finished',
            courts: round.courts.map((court) => ({
              key: court.courtId,
              label: `Корт ${court.label}`,
              status: `${court.status} · раунд ${court.currentRaundNo ?? '—'}`,
              targetId: `kotc-court-${round.roundNo}-${court.courtNo}`,
              judgeUrl: court.judgeUrl,
              active: court.status === 'live',
            })),
          }))}
          extras={[
            { href: '#kotc-player-replacement', label: 'Замена игрока', note: 'Изменить состав турнира' },
            { href: '#kotc-control-timer', label: 'Коррекция таймера', note: 'Время и глобальное управление' },
            { href: '#kotc-admin-actions', label: 'Аварийные действия', note: 'Force-finish и полный рестарт' },
            ...(activeCourt ? [{ href: activeCourt.judgeUrl, label: 'Ссылка судье', note: `Корт ${activeCourt.label}`, external: true }] : []),
            { href: `/live/kotcn/${encodeURIComponent(data.tournamentId)}`, label: 'Табло', note: 'Экран для зрителей', external: true },
            { href: `/admin/tournaments/${encodeURIComponent(data.tournamentId)}/kotcn-schedule-print`, label: 'Печать', note: 'Расписание по кортам', external: true },
            { href: `/admin/tournaments/${encodeURIComponent(data.tournamentId)}/edit`, label: 'Настройки', note: 'Карточка турнира' },
            { href: '/admin/tournaments', label: 'Все турниры', note: 'Вернуться к списку' },
          ]}
        />
      ) : null}
    </div>
  );
}
