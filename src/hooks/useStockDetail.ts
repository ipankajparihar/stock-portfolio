"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QUOTE_INTERVAL_MS } from "@/lib/cadence";
import type { RangeKey, StockDetailResponse } from "@/lib/types";

interface UseStockDetailResult {
  data: StockDetailResponse | null;
  isInitialLoading: boolean;
  /** True only while a *user-clicked* refresh runs. The background poll is silent. */
  isManualRefreshing: boolean;
  /** True while switching ranges — only the chart is stale, not the page. */
  isRangeLoading: boolean;
  error: string | null;
  range: RangeKey;
  setRange: (range: RangeKey) => void;
  refresh: () => void;
}

/**
 * Loads and polls one stock's detail payload.
 *
 * Same rules as `usePortfolio` — keep last-good data on failure, pause when hidden, re-arm the
 * interval from completion, and let a background poll land **silently** rather than announcing
 * itself with a spinner the user never asked to watch — plus one specific to this page:
 *
 * **Switching range must not blank the page.** The header, position and fundamentals are
 * identical across ranges; only the chart changes. So a range switch keeps everything on
 * screen and dims just the chart, rather than throwing the whole view back to a skeleton.
 * That's the same principle the dashboard's split refresh applies at page scale: show a
 * pending state over the part that's actually pending, and nothing else.
 *
 * **Known gap — this page is only half-way to where the dashboard is.** The background poll is
 * silent, but it still refetches and wholesale-replaces the *entire* payload every 15s: the
 * price history array, the fundamentals, and a company profile that structurally cannot have
 * changed. Every consumer therefore gets a fresh object and re-renders, even on a quiet tick.
 * The dashboard solved this with a lean tick endpoint plus an identity-preserving merge
 * (`applyQuoteTick`); the equivalent here needs its own chart-splicing logic, so it's deferred
 * rather than done. Don't read the shared `isManualRefreshing` naming as render parity — it
 * isn't, yet.
 */
export function useStockDetail(symbol: string): UseStockDetailResult {
  const [data, setData] = useState<StockDetailResponse | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [isRangeLoading, setIsRangeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRangeState] = useState<RangeKey>("1M");

  const abortRef = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  // Read inside the poll loop so the interval doesn't need to be torn down and rebuilt
  // every time the user picks a different range.
  const rangeRef = useRef<RangeKey>(range);

  const load = useCallback(
    async (nextRange: RangeKey, { isRangeSwitch = false, manual = false } = {}) => {
      if (inFlight.current) return;
      inFlight.current = true;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Only work the user is waiting on gets a pending state: a range switch (they clicked a
      // tab) and a manual refresh (they clicked the button). The 15s background poll gets
      // none — it lands and the price flashes, which is the whole signal it needs to send.
      if (isRangeSwitch) setIsRangeLoading(true);
      else if (manual) setIsManualRefreshing(true);

      try {
        const res = await fetch(
          `/api/stock/${encodeURIComponent(symbol)}?range=${nextRange}`,
          { signal: controller.signal, cache: "no-store" },
        );

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? `Request failed with status ${res.status}`);
        }

        const payload: StockDetailResponse = await res.json();
        if (!mounted.current) return;

        setData(payload);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!mounted.current) return;
        // `data` is left intact on purpose — a failed poll shouldn't empty the page.
        setError(err instanceof Error ? err.message : "Failed to load stock");
      } finally {
        if (mounted.current) {
          setIsManualRefreshing(false);
          setIsRangeLoading(false);
          setIsInitialLoading(false);
        }
        inFlight.current = false;
      }
    },
    [symbol],
  );

  const setRange = useCallback(
    (next: RangeKey) => {
      rangeRef.current = next;
      setRangeState(next);
      void load(next, { isRangeSwitch: true });
    },
    [load],
  );

  const refresh = useCallback(() => {
    void load(rangeRef.current, { manual: true });
  }, [load]);

  // --- Initial load ---
  useEffect(() => {
    mounted.current = true;

    // Microtask, not the effect body: `load` sets state synchronously, and calling it inline
    // would cascade an extra render straight out of mount.
    queueMicrotask(() => {
      if (mounted.current) void load(rangeRef.current);
    });

    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, [load]);

  // --- Poll for the live price, pausing while the tab is hidden ---
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden" || inFlight.current) return;
      void load(rangeRef.current);
    }, QUOTE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [load]);

  return {
    data,
    isInitialLoading,
    isManualRefreshing,
    isRangeLoading,
    error,
    range,
    setRange,
    refresh,
  };
}
