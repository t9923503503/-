'use client';

import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { METRIKA_GOALS, reachMetrikaGoal } from '@/lib/metrika-goals';

type TrackableGoal =
  | typeof METRIKA_GOALS.vkClick
  | typeof METRIKA_GOALS.shareClick
  | typeof METRIKA_GOALS.telegramClick;

interface MetrikaExternalLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode;
  goalId: TrackableGoal;
  goalParams?: Record<string, unknown>;
}

export default function MetrikaExternalLink({
  children,
  goalId,
  goalParams,
  onClick,
  ...props
}: MetrikaExternalLinkProps) {
  return (
    <a
      {...props}
      onClick={(event) => {
        reachMetrikaGoal(goalId, {
          ...goalParams,
          outboundUrl: props.href,
        });
        onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}
