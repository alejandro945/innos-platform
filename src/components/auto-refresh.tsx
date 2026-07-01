"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls a lightweight progress endpoint while a background job runs and only
 * triggers a (heavy) router.refresh() when something actually changed. It also
 * pauses while the tab is hidden and backs off over time, to avoid hammering
 * the server.
 */
export function AutoRefresh({
  processId,
  endpoint,
  pollMs = 6000,
  refreshThrottleMs = 15000,
}: {
  /** Legacy shorthand: polls /api/procesos/[processId]/progress. */
  processId?: string;
  /** Explicit progress endpoint (used by non-process background jobs). */
  endpoint?: string;
  pollMs?: number;
  refreshThrottleMs?: number;
}) {
  const router = useRouter();
  const lastSignature = useRef<string | null>(null);
  const lastRefresh = useRef<number>(0);
  const url = endpoint ?? `/api/procesos/${processId}/progress`;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      // Skip polling while the tab isn't visible.
      if (document.visibilityState !== "visible") {
        timer = setTimeout(tick, pollMs);
        return;
      }
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as {
            active: boolean;
            signature: string;
          };
          const changed = data.signature !== lastSignature.current;
          lastSignature.current = data.signature;

          if (!data.active) {
            // Job finished -> one final refresh, then stop polling entirely.
            router.refresh();
            return;
          }
          // While running, refresh the heavy UI at most once per throttle window
          // (the progress number still moves; we just don't re-render on every tick).
          const now = Date.now();
          if (changed && now - lastRefresh.current >= refreshThrottleMs) {
            lastRefresh.current = now;
            router.refresh();
          }
        }
      } catch {
        // ignore; will retry next tick
      }
      if (!cancelled) timer = setTimeout(tick, pollMs);
    };

    timer = setTimeout(tick, pollMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, pollMs, refreshThrottleMs, router]);

  return null;
}
