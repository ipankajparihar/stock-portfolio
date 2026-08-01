"use client";

import { useEffect, useRef, useState } from "react";
import type { SymbolSearchResult } from "@/lib/types";

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

interface UseSymbolSearchResult {
  results: SymbolSearchResult[];
  isLoading: boolean;
  error: string | null;
}

/** Debounced company-name/ticker search against `/api/symbol-search`. */
export function useSymbolSearch(query: string): UseSymbolSearchResult {
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestQuery = useRef(query);

  useEffect(() => {
    latestQuery.current = query;

    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      // Microtask, not the effect body: setting state directly here would cascade an extra
      // render straight out of this effect.
      queueMicrotask(() => {
        setResults([]);
        setIsLoading(false);
        setError(null);
      });
      return;
    }

    queueMicrotask(() => setIsLoading(true));
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/symbol-search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);

        const body: { results: SymbolSearchResult[] } = await res.json();
        // A slower, earlier request can resolve after a newer one — only the query that's
        // still current gets to update the list.
        if (latestQuery.current !== query) return;

        setResults(body.results);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (latestQuery.current !== query) return;
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        if (latestQuery.current === query) setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { results, isLoading, error };
}
