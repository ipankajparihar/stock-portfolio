"use client";

import { memo, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";
import { QUOTE_INTERVAL_MS } from "@/lib/cadence";
import { formatClockTime, formatMarketState, formatRelativeTime } from "@/lib/format";

/**
 * Live-status strip: is the data fresh, when does it refresh next, and is the market open?
 *
 * Auto-refreshing dashboards have a trust problem — a number that changes on its own is only
 * reassuring if you can tell *when* it last changed. That's sharper still now the page holds
 * two datasets on two clocks, so this states both ages rather than implying one freshness for
 * the whole page: prices are seconds old, P/E and earnings are minutes old, and quietly
 * letting the reader assume otherwise about the latter would be the dishonest option.
 *
 * The countdown ring covers the price clock specifically — it's the one that moves, and the
 * one worth being able to see coming rather than being surprised by.
 *
 * Market state is here for the same reason: a "live" price at 2am is yesterday's close, and
 * saying so is what stops the user concluding the feed is broken.
 */

interface StatusBarProps {
  /** Epoch ms the prices were last fetched. */
  updatedAt: number | null;
  /** Epoch ms the oldest P/E and earnings figures were scraped. */
  fundamentalsUpdatedAt: number | null;
  marketState: string | null;
  /** Epoch ms the server expects to push the next frame. A deadline, not a countdown. */
  nextRefreshAt: number;
  /** The stream is up. False means `EventSource` is retrying underneath. */
  isConnected: boolean;
  /**
   * Only ever true for a refresh the user clicked. Pushed updates are silent, so this is
   * feedback for an explicit action — not a progress bar for something nobody asked to wait on.
   */
  isManualRefreshing: boolean;
  isPaused: boolean;
  onRefresh: () => void;
}

export const StatusBar = memo(function StatusBar({
  updatedAt,
  fundamentalsUpdatedAt,
  marketState,
  nextRefreshAt,
  isConnected,
  isManualRefreshing,
  isPaused,
  onRefresh,
}: StatusBarProps) {
  const market = formatMarketState(marketState);

  // Everything time-based here — "12s ago", the countdown, the ring — moves on its own clock
  // while the data sits still. So this component re-renders itself against that clock rather
  // than having the hook push a new number down the tree: the dashboard above it owns twenty
  // rows and two charts, and re-rendering all of that four times a second to animate a 14px
  // arc is precisely the waste this design exists to avoid.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const msUntilRefresh = Math.max(0, nextRefreshAt - now);
  const progress = 1 - Math.min(1, msUntilRefresh / QUOTE_INTERVAL_MS);
  const secondsLeft = Math.ceil(msUntilRefresh / 1000);

  // The countdown is a promise about when data will arrive, and it's only honest while the
  // stream is actually up. Dropped, it would keep cheerfully ticking toward an update that is
  // never coming — so a broken connection says so instead of counting down to nothing.
  const isDisconnected = !isConnected && !isPaused;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {/* Market state */}
      <span
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
          market.live
            ? "border-gain-border bg-gain-soft text-gain"
            : "border-border-base bg-surface-muted text-muted",
        )}
      >
        <span
          className={clsx(
            "size-1.5 rounded-full",
            market.live ? "bg-gain pulse-live" : "bg-muted",
          )}
          aria-hidden="true"
        />
        {market.label}
      </span>

      {/* Freshness — stated per feed, because the two ages are orders of magnitude apart. */}
      <span className="text-xs text-muted">
        Prices{" "}
        <time dateTime={updatedAt ? new Date(updatedAt).toISOString() : undefined}>
          {formatRelativeTime(updatedAt)}
        </time>
        <span className="hidden sm:inline"> · {formatClockTime(updatedAt)}</span>
      </span>

      <span className="hidden text-xs text-muted sm:inline">
        P/E &amp; earnings{" "}
        <time
          dateTime={
            fundamentalsUpdatedAt ? new Date(fundamentalsUpdatedAt).toISOString() : undefined
          }
        >
          {formatRelativeTime(fundamentalsUpdatedAt)}
        </time>
      </span>

      {/* Countdown + manual refresh.
          The ring makes the incoming push legible: you can see the next update coming rather
          than being surprised by numbers changing under you. It does *not* spin on that push —
          only on a click, which is the one refresh a user is actually waiting for. */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={isManualRefreshing}
        className={clsx(
          "group ml-auto inline-flex items-center gap-2 rounded-lg border bg-surface px-3 py-1.5",
          "text-xs font-medium transition-colors hover:border-border-strong hover:bg-surface-muted",
          "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60",
          // A dropped stream is the one state worth colouring: the numbers on screen are still
          // the last good ones, but they have stopped being live and the user deserves to know
          // before they act on them.
          isDisconnected ? "border-warn-border text-warn" : "border-border-base",
        )}
        aria-label={
          isDisconnected
            ? "Live updates disconnected, reconnecting. Refresh everything now"
            : isPaused
              ? "Live updates paused while the tab is hidden. Refresh everything now"
              : `Refresh everything now. Next live update in ${secondsLeft} seconds`
        }
      >
        {isManualRefreshing || isDisconnected ? (
          <RefreshCw
            size={13}
            className={clsx(isManualRefreshing && "animate-spin")}
            aria-hidden="true"
          />
        ) : (
          <CountdownRing progress={progress} />
        )}

        <span>
          {isManualRefreshing
            ? "Refreshing…"
            : isDisconnected
              ? "Reconnecting…"
              : isPaused
                ? "Paused"
                : `Live · ${secondsLeft}s`}
        </span>
      </button>
    </div>
  );
});

/** A 14px SVG ring that drains as the next auto-refresh approaches. */
function CountdownRing({ progress }: { progress: number }) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      <circle
        cx="7"
        cy="7"
        r={radius}
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="2"
      />
      <circle
        cx="7"
        cy="7"
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        // Start the arc at 12 o'clock instead of 3 o'clock.
        transform="rotate(-90 7 7)"
      />
    </svg>
  );
}
