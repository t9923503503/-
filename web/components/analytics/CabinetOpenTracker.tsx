'use client';

import { useEffect } from 'react';
import { METRIKA_GOALS, reachMetrikaGoal } from '@/lib/metrika-goals';

export default function CabinetOpenTracker({
  hasPlayer,
  hasAdmin,
  judgeApproved,
}: {
  hasPlayer: boolean;
  hasAdmin: boolean;
  judgeApproved: boolean;
}) {
  useEffect(() => {
    reachMetrikaGoal(METRIKA_GOALS.cabinetOpen, {
      hasPlayer,
      hasAdmin,
      judgeApproved,
    });
  }, [hasAdmin, hasPlayer, judgeApproved]);

  return null;
}
