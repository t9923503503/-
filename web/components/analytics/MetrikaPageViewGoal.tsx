'use client';

import { useEffect } from 'react';
import { METRIKA_GOALS, reachMetrikaGoal } from '@/lib/metrika-goals';

type PageViewGoal =
  | typeof METRIKA_GOALS.playerProfileOpen
  | typeof METRIKA_GOALS.rulesOpen;

interface MetrikaPageViewGoalProps {
  goalId: PageViewGoal;
  params?: Record<string, unknown>;
}

export default function MetrikaPageViewGoal({ goalId, params }: MetrikaPageViewGoalProps) {
  useEffect(() => {
    reachMetrikaGoal(goalId, params);
  }, [goalId, params]);

  return null;
}
