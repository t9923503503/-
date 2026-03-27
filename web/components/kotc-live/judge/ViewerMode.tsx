"use client";

import type { KotcCourtState } from "../types";
import { JudgeScreen } from "./JudgeScreen";

interface ViewerModeProps {
  courtIdx: number;
  court: KotcCourtState | undefined;
  clockOffsetMs: number;
  onLeave: () => void;
}

export function ViewerMode(props: ViewerModeProps) {
  return (
    <JudgeScreen
      {...props}
      readOnly={true}
      onScore={() => {}}
      onTimer={() => {}}
    />
  );
}
