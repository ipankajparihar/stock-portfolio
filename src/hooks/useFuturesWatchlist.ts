"use client";

import { useEffect, useState } from "react";
import { MARKET_INTERVAL_MS } from "@/lib/cadence";
import type { FutureContract } from "@/lib/types";

interface UseFuturesWatchlistResult {
  contracts: FutureContract[];
  isLoading: boolean;
  error: string | null;
}

export function useFuturesWatchlist(): UseFuturesWatchlistResult {
  const [contracts, setContracts] = useState<FutureContract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    function onVisibilityChange() {
      // Microtask, not the effect body: this is an event handler, but the initial sync below
      // would otherwise set state straight out of the effect.
      setIsPaused(document.visibilityState === "hidden");
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (isPaused) return;
    let mounted = true;

    async function load() {
      try {
        const res = await fetch("/api/derivatives/futures", { cache: "no-store" });
        if (!res.ok) {
          // Routes send a `detail` explaining the failure; surfacing the bare status throws that away.
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? `Request failed with status ${res.status}`);
        }

        const body: { contracts: FutureContract[] } = await res.json();
        if (!mounted) return;

        setContracts(body.contracts);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load futures");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    queueMicrotask(load);
    const timer = setInterval(load, MARKET_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [isPaused]);

  return { contracts, isLoading, error };
}
