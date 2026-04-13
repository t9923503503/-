'use client';

import { useCallback, useRef } from 'react';

interface Options {
  onClick: () => void;
  onLongPress: () => void;
  delay?: number;
}

interface Handlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function useLongPress({ onClick, onLongPress, delay = 500 }: Options): Handlers {
  const timerRef = useRef<number | null>(null);
  const firedLongRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    firedLongRef.current = false;
    clear();
    timerRef.current = window.setTimeout(() => {
      firedLongRef.current = true;
      onLongPress();
    }, delay);
  }, [clear, delay, onLongPress]);

  return {
    onPointerDown: () => {
      start();
    },
    onPointerUp: () => {
      clear();
      if (!firedLongRef.current) onClick();
    },
    onPointerLeave: () => {
      clear();
    },
    onPointerCancel: () => {
      clear();
    },
    onContextMenu: (e) => {
      e.preventDefault();
    },
  };
}
