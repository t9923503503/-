'use client';

import { useCallback, useRef } from 'react';

export function useDoubleTap(onDouble: () => void, delay = 350) {
  const lastTapRef = useRef(0);

  return useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < delay) {
      lastTapRef.current = 0;
      onDouble();
    } else {
      lastTapRef.current = now;
    }
  }, [delay, onDouble]);
}
