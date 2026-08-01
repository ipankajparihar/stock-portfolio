"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketOverviewResponse } from "@/lib/types";

const POLL_INTERVAL_MS = 60_000;

interface UseMarketOverviewResult {
  data: MarketOverviewResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Polls the public market overview — no auth, same for every visitor. */
export function useMarketOverview(): UseMarketOverviewResult {
  const [data, setData] = useState<MarketOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/market", { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);

      const payload: MarketOverviewResponse = await res.json();
      if (!mounted.current) return;

      setData(payload);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Failed to load market data");
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Microtask, not the effect body: `load` sets state synchronously, and calling it inline
    // would cascade an extra render straight out of this effect.
    queueMicrotask(() => void load());
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  return { data, isLoading, error, refresh: load };
}
