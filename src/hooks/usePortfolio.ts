"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyQuoteTick } from "@/lib/portfolio-merge";
import type { PortfolioResponse, QuoteTick, StreamFrame } from "@/lib/types";

interface UsePortfolioResult {
  data: PortfolioResponse | null;
  /** True until the stream delivers its first payload, when there is nothing to show yet. */
  isInitialLoading: boolean;
  /** True only while a *user-clicked* refresh is running. Pushed updates never set this. */
  isManualRefreshing: boolean;
  /** The stream is up and delivering. False means `EventSource` is retrying underneath. */
  isConnected: boolean;
  /** Set when the last fetch or stream frame failed. Previous data stays visible alongside it. */
  error: string | null;
  /** Epoch ms the server expects to push the next frame — drives the countdown ring. */
  nextRefreshAt: number;
  /** The stream is closed while the tab is hidden. */
  isPaused: boolean;
  refresh: () => void;
}

/**
 * Subscribes to the portfolio stream.
 *
 * ## The client asks for nothing
 *
 * There are no timers here, no intervals, no request cadence, no abort races between a poll and
 * a click. There is one `EventSource`. The server refreshes on its own clock and pushes; this
 * hook listens and splices. Everything that used to be scheduling logic — two deadlines, a
 * 250ms ticker, re-arm-from-completion, don't-stack-requests, manual-pre-empts-background — now
 * lives once on the server, in `portfolio-hub.ts`, instead of once per open tab.
 *
 * The stream delivers two kinds of frame:
 *   - `portfolio` — the whole payload, and always the first thing sent. So the stream *is* the
 *     initial load; there is no separate boot request to race against it.
 *   - `quotes` — a lean price patch, spliced into what's on screen by `applyQuoteTick`, which
 *     preserves object identity for every row that didn't move so only the changed cells repaint.
 *
 * ## What survives from the polling version, and why
 *
 * 1. **A failure never clears the table.** Last-good data stays on screen with the error beside
 *    it. Blanking a portfolio because one refresh broke is alarming and strictly less useful
 *    than showing slightly-old numbers.
 *
 * 2. **Nothing runs while the tab is hidden.** Closing the stream doesn't just save client work
 *    now — the server sees the listener leave, and if it was the last one it stops calling Yahoo
 *    at all. The pause got teeth.
 *
 * 3. **A refresh the user clicked is the one refresh that's visible.** It's an explicit request,
 *    and an unacknowledged click reads as a broken button. Pushed frames stay silent.
 *
 * `EventSource` reconnects on its own, with backoff, whenever the connection drops — which is
 * the one piece of machinery this design would otherwise have had to hand-roll.
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

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // --- The stream ---
  useEffect(() => {
    if (isPaused) return;

    const source = new EventSource("/api/portfolio/stream");

    const onFrame = <T,>(raw: string, apply: (data: T) => void) => {
      const frame: StreamFrame<T> = JSON.parse(raw);
      apply(frame.data);
      setNextRefreshAt(frame.nextTickAt);
    };

    source.addEventListener("open", () => setIsConnected(true));

    // The whole payload. Replaces what's on screen — fundamentals and holdings can genuinely
    // have changed, and at a 5-minute cadence the wholesale swap is not worth diffing around.
    source.addEventListener("portfolio", (e) => {
      onFrame<PortfolioResponse>(e.data, (payload) => {
        setData(payload);
        setIsInitialLoading(false);
        setError(null);
      });
    });

    // A price patch. Spliced in, so rows that didn't move keep their identity and don't repaint.
    source.addEventListener("quotes", (e) => {
      onFrame<QuoteTick>(e.data, (tick) => {
        setData((prev) => (prev ? applyQuoteTick(prev, tick) : prev));
        setError(null);
      });
    });

    // The server failed to assemble a payload and said so. Surfaced beside the stale data
    // rather than replacing it. Named `upstream-error`, not `error`, so it can't be confused
    // with EventSource's built-in connection-failure event below — the two mean opposite things.
    source.addEventListener("upstream-error", (e) => {
      onFrame<{ message: string }>(e.data, ({ message }) => setError(message));
    });

    // Connection-level failure. `EventSource` is already retrying underneath, so this is a
    // status change, not a fatal error — unless we have nothing to show at all, in which case
    // the user needs a way out of a skeleton that would otherwise never resolve.
    source.onerror = () => {
      setIsConnected(false);
      setIsInitialLoading(false);
    };

    return () => source.close();
  }, [isPaused]);

  // --- Close the stream while the tab is hidden ---
  useEffect(() => {
    function onVisibilityChange() {
      setIsPaused(document.visibilityState === "hidden");
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  /**
   * The one request this hook still makes.
   *
   * A click means the user doubts something on the page, and they can't know it was the P/E
   * column — so it pulls everything, not just the price. It goes over plain HTTP rather than
   * through the stream because it's a question, and the stream only answers.
   */
  const refresh = useCallback(async () => {
    setIsManualRefreshing(true);

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
    } catch (err) {
      if (!mounted.current) return;
      // `data` is left intact on purpose (see rule 1 above).
      setError(err instanceof Error ? err.message : "Failed to load portfolio");
    } finally {
      if (mounted.current) {
        setIsManualRefreshing(false);
        setIsInitialLoading(false);
      }
    }
  }, []);

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
