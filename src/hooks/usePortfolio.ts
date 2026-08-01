"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QUOTE_INTERVAL_MS } from "@/lib/cadence";
import { isAnyMarketOpen } from "@/lib/market-hours";
import type { Market, PortfolioResponse } from "@/lib/types";

interface UsePortfolioResult {
  data: PortfolioResponse | null;
  /** True until the first fetch resolves, when there is nothing to show yet. */
  isInitialLoading: boolean;
  /** True only while a *user-clicked* refresh is running. The background poll never sets this. */
  isManualRefreshing: boolean;
  /** True while the background poll is healthy. False means the last poll failed. */
  isConnected: boolean;
  /** Set when the last fetch failed. Previous data stays visible alongside it. */
  error: string | null;
  /** Epoch ms the next background poll is expected to fire — drives the countdown ring. */
  nextRefreshAt: number;
  /** Polling is suspended while the tab is hidden. */
  isPaused: boolean;
  refresh: () => void;
}

/**
 * Polls the per-user portfolio endpoint.
 *
 * Each user has their own holdings, so — unlike the old shared demo dashboard — there is no
 * identical work to multiplex across tabs, and a per-user SSE hub would add real complexity
 * (a hub keyed by user, its own connection lifecycle) for a benefit that only matters if one
 * user has several tabs open. A plain poll is the simpler, equally-correct choice here.
 */
export function usePortfolio(): UsePortfolioResult {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [nextRefreshAt, setNextRefreshAt] = useState(0);

  const mounted = useRef(true);
  // Which markets the portfolio actually holds, once known — used to skip a background poll
  // outright when none of them are trading, rather than hitting the (still-cached) API for a
  // price that provably has not moved.
  const heldMarkets = useRef<Market[] | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async ({ manual }: { manual: boolean }) => {
    // Skip only a background tick, and only once we know the portfolio's markets are all
    // closed — the initial load and every manual click always go through.
    if (!manual && heldMarkets.current && !isAnyMarketOpen(heldMarkets.current)) {
      setNextRefreshAt(Date.now() + QUOTE_INTERVAL_MS);
      return;
    }

    if (manual) setIsManualRefreshing(true);

    try {
      const res = await fetch("/api/portfolio", { cache: "no-store" });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Request failed with status ${res.status}`);
      }

      const payload: PortfolioResponse = await res.json();
      if (!mounted.current) return;

      setData(payload);
      setError(null);
      setIsConnected(true);
      heldMarkets.current = payload.marketGroups.map((g) => g.market);
    } catch (err) {
      if (!mounted.current) return;
      // `data` is left intact on purpose — a failed poll shouldn't blank a working dashboard.
      setError(err instanceof Error ? err.message : "Failed to load portfolio");
      setIsConnected(false);
    } finally {
      if (mounted.current) {
        setIsInitialLoading(false);
        if (manual) setIsManualRefreshing(false);
        setNextRefreshAt(Date.now() + QUOTE_INTERVAL_MS);
      }
    }
  }, []);

  // Background poll — suspended while the tab is hidden.
  useEffect(() => {
    if (isPaused) return;

    // Microtask, not the effect body: `load` sets state synchronously, and calling it inline
    // would cascade an extra render straight out of this effect.
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

  return {
    data,
    isInitialLoading,
    isManualRefreshing,
    isConnected,
    error,
    nextRefreshAt,
    isPaused,
    refresh,
  };
}
