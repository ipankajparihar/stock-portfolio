"use client";

import { useEffect, useRef, useState } from "react";
import type { Market, ScreenedStock, ScreenerFilters } from "@/lib/types";

const DEBOUNCE_MS = 400;

interface UseStockScreenerResult {
  results: ScreenedStock[];
  isLoading: boolean;
  error: string | null;
}

/** Debounced screener query against `/api/screener` — re-runs whenever market or filters change. */
export function useStockScreener(market: Market, filters: ScreenerFilters): UseStockScreenerResult {
  const [results, setResults] = useState<ScreenedStock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Stringify so the effect only re-runs when the filters' *values* change, not their identity —
  // the caller constructs a fresh `filters` object on every render.
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    const id = ++requestId.current;
    const controller = new AbortController();

    queueMicrotask(() => setIsLoading(true));

    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ market });
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== false) params.set(paramName(key), String(value === true ? 1 : value));
      }

      try {
        const res = await fetch(`/api/screener?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);

        const body: { results: ScreenedStock[] } = await res.json();
        if (requestId.current !== id) return;

        setResults(body.results);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (requestId.current !== id) return;
        setError(err instanceof Error ? err.message : "Screener failed");
      } finally {
        if (requestId.current === id) setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `filtersKey` is the intentional dependency, not `filters` itself — the caller constructs
    // a fresh filters object every render, which would otherwise re-fire this effect every time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, filtersKey]);

  return { results, isLoading, error };
}

/** `changePercentMin` → `changeMin`, matching the route's shorter query param names. */
function paramName(key: string): string {
  return key.replace("Percent", "");
}
