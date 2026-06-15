"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Periodically refreshes the route while a background job is running. */
export function AutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
