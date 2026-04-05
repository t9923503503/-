"use client";

import { useEffect, useRef } from "react";

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

export function useScreenWakeLock(enabled: boolean): void {
  const lockRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;
    const nav = navigator as Navigator & {
      wakeLock?: {
        request: (type: "screen") => Promise<WakeLockSentinelLike>;
      };
    };
    if (!nav.wakeLock?.request) return;

    let mounted = true;

    const acquire = async () => {
      if (!mounted) return;
      if (document.visibilityState !== "visible") return;
      if (lockRef.current && !lockRef.current.released) return;
      try {
        lockRef.current = await nav.wakeLock.request("screen");
      } catch {
        // Some browsers/devices deny lock when battery saver is enabled.
      }
    };

    const release = async () => {
      const lock = lockRef.current;
      if (!lock) return;
      lockRef.current = null;
      if (lock.released) return;
      try {
        await lock.release();
      } catch {
        // ignore release race
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      } else {
        void release();
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void release();
    };
  }, [enabled]);
}
