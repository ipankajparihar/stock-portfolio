"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QUOTE_INTERVAL_MS } from "@/lib/cadence";
import { isAnyMarketOpen } from "@/lib/market-hours";
import type { Market } from "@/lib/types";
import type { WatchlistResponse } from "@/lib/watchlist-service";

interface UseWatchlistResult {
  data: WatchlistResponse | null;
  isInitialLoading: boolean;
  isManualRefreshing: boolean;
  isConnected: boolean;
  error: string | null;
  isPaused: boolean;
  refresh: () => void;
}

/**
 * Polls the user's watchlist, same cadence and pause-while-hidden rules as `usePortfolio` — a
 * watched stock's price should feel exactly as live as an owned one.
 */
export function useWatchlist(): UseWatchlistResult {
  const [data, setData] = useState<WatchlistResponse | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const mounted = useRef(true);
  // Which markets the watchlist actually spans, once known — lets a background tick skip
  // itself outright when none of them are trading.
  const watchedMarkets = useRef<Market[] | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async ({ manual }: { manual: boolean }) => {
    if (!manual && watchedMarkets.current && !isAnyMarketOpen(watchedMarkets.current)) return;

    if (manual) setIsManualRefreshing(true);

    try {
      const res = await fetch("/api/watchlist", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Request failed with status ${res.status}`);
      }

      const payload: WatchlistResponse = await res.json();
      if (!mounted.current) return;

      setData(payload);
      setError(null);
      setIsConnected(true);
      watchedMarkets.current = payload.rows.map((r) => r.market);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Failed to load watchlist");
      setIsConnected(false);
    } finally {
      if (mounted.current) {
        setIsInitialLoading(false);
        if (manual) setIsManualRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isPaused) return;

    queueMicrotask(() => void load({ manual: false }));
    const timer = setInterval(() => void load({ manual: false }), QUOTE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isPaused, load]);

  useEffect(() => {
    function onVisibilityChange() {
      setIsPaused(document.visibilityState === "hidden");
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const refresh = useCallback(() => {
    void load({ manual: true });
  }, [load]);

  return { data, isInitialLoading, isManualRefreshing, isConnected, error, isPaused, refresh };
}
