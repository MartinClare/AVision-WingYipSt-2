"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

interface AutoRefreshProps {
  /** Refresh interval in seconds (default: 10) */
  intervalSec?: number;
  /** When false, auto-refresh is paused (default: true). */
  enabled?: boolean;
}

/**
 * Invisible component that triggers a server-data refresh via router.refresh()
 * at a fixed interval. Drop it anywhere inside a page — no UI, no flash.
 */
export function AutoRefresh({ intervalSec = 10, enabled = true }: AutoRefreshProps) {
  const router = useRouter();
  const savedInterval = useRef(intervalSec);

  useEffect(() => {
    savedInterval.current = intervalSec;
  }, [intervalSec]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      router.refresh();
    }, savedInterval.current * 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return null;
}
