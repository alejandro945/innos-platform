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
  baseIntervalMs = 6000,
  maxIntervalMs = 30000,
}: {
  processId: string;
  baseIntervalMs?: number;
  maxIntervalMs?: number;
}) {
  const router = useRouter();
  const lastSignature = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let interval = baseIntervalMs;

    const tick = async () => {
      if (cancelled) return;
      // Skip work when the tab isn't visible.
      if (document.visibilityState !== "visible") {
        timer = setTimeout(tick, interval);
        return;
      }
      try {
        const res = await fetch(`/api/procesos/${processId}/progress`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as {
            active: boolean;
            signature: string;
          };
          if (data.signature !== lastSignature.current) {
            lastSignature.current = data.signature;
            interval = baseIntervalMs; // reset backoff on change
            router.refresh(); // heavy refresh only when something moved
          } else {
            interval = Math.min(Math.round(interval * 1.5), maxIntervalMs);
          }
          if (!data.active) {
            router.refresh(); // final state, then stop polling
            return;
          }
        }
      } catch {
        interval = Math.min(Math.round(interval * 1.5), maxIntervalMs);
      }
      if (!cancelled) timer = setTimeout(tick, interval);
    };

    timer = setTimeout(tick, baseIntervalMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [processId, baseIntervalMs, maxIntervalMs, router]);

  return null;
}
