"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus, X } from "lucide-react";
import clsx from "clsx";
import { deleteWatchlistEntry } from "@/app/actions/watchlist";
import { directionOf, formatPrice, formatSignedPercent } from "@/lib/format";
import type { WatchlistRow } from "@/lib/watchlist-service";

/**
 * A card grid rather than a table — watchlists are a handful of names glanced at often, not a
 * dense dataset to be scanned row by row, so each stock gets a self-contained tile: name,
 * price, and today's move, in one glance, with room to breathe on a phone.
 */
export function WatchlistGrid({
  rows,
  onRemoved,
}: {
  rows: WatchlistRow[];
  /** Called after a row is successfully removed, so the parent can refetch immediately. */
  onRemoved?: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((row) => (
        <WatchlistCard key={row.id} row={row} onRemoved={onRemoved} />
      ))}
    </div>
  );
}

function WatchlistCard({ row, onRemoved }: { row: WatchlistRow; onRemoved?: () => void }) {
  const [isPending, startTransition] = useTransition();
  const direction = directionOf(row.dayChangePercent);

  const previous = useRef<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const prior = previous.current;
    previous.current = row.cmp;
    if (prior == null || row.cmp == null || prior === row.cmp) return;

    setFlash(row.cmp > prior ? "up" : "down");
    const timer = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(timer);
  }, [row.cmp]);

  return (
    <div
      className={clsx(
        "group relative overflow-hidden rounded-xl border border-border-base bg-surface p-4 shadow-sm transition-colors",
        "hover:border-border-strong hover:shadow-md",
      )}
    >
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await deleteWatchlistEntry(row.id);
            onRemoved?.();
          })
        }
        aria-label={`Remove ${row.symbol} from watchlist`}
        className={clsx(
          "absolute top-3 right-3 z-10 rounded-full p-1.5 text-muted opacity-0 transition-opacity",
          "hover:bg-loss-soft hover:text-loss focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
          "group-hover:opacity-100 disabled:opacity-50",
        )}
      >
        <X size={14} />
      </button>

      <Link href={`/stock/${row.symbol}`} className="block">
        <div className="flex items-center gap-2 pr-6">
          <span className="rounded border border-border-base bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-strong uppercase">
            {row.exchange}
          </span>
          <span className="text-[11px] text-muted">{row.market === "IN" ? "India" : "United States"}</span>
        </div>

        <p className="mt-2.5 truncate text-sm font-semibold text-foreground group-hover:text-accent">
          {row.name}
        </p>
        <p className="text-xs text-muted">{row.symbol}</p>

        <div className="mt-3 flex items-end justify-between gap-2">
          <span
            className={clsx(
              "rounded px-1 text-xl font-semibold tabular",
              flash === "up" && "flash-up",
              flash === "down" && "flash-down",
            )}
          >
            {formatPrice(row.cmp, row.currency)}
          </span>

          <ChangePill direction={direction} percent={row.dayChangePercent} />
        </div>
      </Link>
    </div>
  );
}

function ChangePill({
  direction,
  percent,
}: {
  direction: ReturnType<typeof directionOf>;
  percent: number | null;
}) {
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular",
        direction === "up"
          ? "bg-gain-soft text-gain"
          : direction === "down"
            ? "bg-loss-soft text-loss"
            : "bg-surface-muted text-muted",
      )}
    >
      <Icon size={12} aria-hidden="true" />
      {formatSignedPercent(percent)}
    </span>
  );
}
