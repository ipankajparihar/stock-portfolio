"use client";

import { useEffect, useState } from "react";
import type { OptionChainResponse } from "@/lib/types";

interface UseOptionChainResult {
  chain: OptionChainResponse | null;
  isLoading: boolean;
  error: string | null;
}

/** Fetches one options chain — re-runs whenever the symbol or the selected expiration changes. */
export function useOptionChain(symbol: string | null, expiration: string | null): UseOptionChainResult {
  const [chain, setChain] = useState<OptionChainResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) {
      // Microtask, not the effect body: setting state directly here would cascade an extra
      // render straight out of this effect.
      queueMicrotask(() => setChain(null));
      return;
    }
    const sym = symbol;

    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ symbol: sym });
        if (expiration) params.set("expiration", expiration);

        const res = await fetch(`/api/derivatives/options?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? `Request failed with status ${res.status}`);
        }

        const body: OptionChainResponse = await res.json();
        if (cancelled) return;

        setChain(body);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (cancelled) return;
        setChain(null);
        setError(err instanceof Error ? err.message : "Failed to load options");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [symbol, expiration]);

  return { chain, isLoading, error };
}
