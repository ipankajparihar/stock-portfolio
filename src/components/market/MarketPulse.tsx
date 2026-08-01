"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import clsx from "clsx";
import { useMarketData } from "@/components/market/MarketDataContext";
import type { IndexQuote, Market } from "@/lib/types";

const MARKET_LABEL: Record<Market, string> = { US: "United States", IN: "India" };

const indexPoints = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * A compact, live "market pulse" card for the hero — the visual proof that the product is
 * showing real, moving data before the visitor has scrolled or signed in. Consumes the shared
 * feed, so it adds no network cost.
 */
export function MarketPulse() {
  const { data, isLoading } = useMarketData();

  return (
    <div className="rounded-2xl border border-border-base bg-surface/80 p-5 shadow-xl backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold">Market Pulse</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gain-soft px-2 py-0.5 text-xs font-medium text-gain">
          <span className="size-1.5 rounded-full bg-gain pulse-live" aria-hidden="true" />
          Live
        </span>
      </div>

      {isLoading && !data ? (
        <PulseSkeleton />
      ) : (
        <div className="space-y-4">
          {data?.markets.map((market) => (
            <div key={market.market} className="space-y-1.5">
              <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
                {MARKET_LABEL[market.market]}
              </p>
              {market.indices.map((index) => (
                <IndexRow key={index.symbol} index={index} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IndexRow({ index }: { index: IndexQuote }) {
  const up = (index.changePercent ?? 0) >= 0;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-base py-1.5 last:border-0">
      <span className="truncate text-sm font-medium">{index.name}</span>
      <span className="flex shrink-0 items-center gap-3">
        <span className="tabular text-sm text-muted-strong">
          {index.price == null ? "—" : indexPoints.format(index.price)}
        </span>
        <span
          className={clsx(
            "inline-flex w-20 items-center justify-end gap-0.5 text-sm font-semibold tabular",
            up ? "text-gain" : "text-loss",
          )}
        >
          {up ? (
            <ArrowUpRight size={14} aria-hidden="true" />
          ) : (
            <ArrowDownRight size={14} aria-hidden="true" />
          )}
          {index.changePercent == null ? "—" : `${Math.abs(index.changePercent).toFixed(2)}%`}
        </span>
      </span>
    </div>
  );
}

function PulseSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="skeleton h-6 rounded" />
      ))}
    </div>
  );
}
