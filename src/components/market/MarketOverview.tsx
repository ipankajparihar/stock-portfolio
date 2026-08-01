"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import clsx from "clsx";
import { Banner } from "@/components/ui/Banner";
import { useMarketData } from "@/components/market/MarketDataContext";
import { formatPrice, formatSignedPercent } from "@/lib/format";
import type { IndexQuote, Market, MarketSnapshot, MoverQuote } from "@/lib/types";

const MARKET_LABEL: Record<Market, string> = { US: "United States", IN: "India" };

// Indices are point values, not currency amounts — no symbol, just grouped decimals.
const indexPoints = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function MarketOverview() {
  const { data, isLoading, error } = useMarketData();
  const [market, setMarket] = useState<Market>("US");

  const snapshot = useMemo(
    () => data?.markets.find((m) => m.market === market) ?? null,
    [data, market],
  );

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border border-border-base bg-surface p-1">
        {(["US", "IN"] as Market[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMarket(m)}
            aria-pressed={market === m}
            className={clsx(
              "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
              market === m ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
            )}
          >
            {MARKET_LABEL[m]}
          </button>
        ))}
      </div>

      {error && <Banner tone="error" message={`Couldn't load market data: ${error}`} />}
      {data?.warnings.map((w) => <Banner key={w} tone="warn" message={w} />)}

      {isLoading && !snapshot ? (
        <MarketOverviewSkeleton />
      ) : snapshot ? (
        <MarketSnapshotView snapshot={snapshot} />
      ) : null}
    </div>
  );
}

function MarketSnapshotView({ snapshot }: { snapshot: MarketSnapshot }) {
  const currency = snapshot.market === "IN" ? "INR" : "USD";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {snapshot.indices.map((index) => (
          <IndexCard key={index.symbol} index={index} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MoversTable title="Top Gainers" movers={snapshot.gainers} currency={currency} tone="up" />
        <MoversTable title="Top Losers" movers={snapshot.losers} currency={currency} tone="down" />
      </div>
    </div>
  );
}

function IndexCard({ index }: { index: IndexQuote }) {
  const direction = (index.change ?? 0) >= 0 ? "up" : "down";

  return (
    <div className="rounded-xl border border-border-base bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{index.name}</p>
      <p className="mt-1 text-xl font-semibold tabular">
        {index.price == null ? "—" : indexPoints.format(index.price)}
      </p>
      <p
        className={clsx(
          "mt-0.5 flex items-center gap-1 text-sm font-medium tabular",
          direction === "up" ? "text-gain" : "text-loss",
        )}
      >
        {direction === "up" ? (
          <ArrowUpRight size={14} aria-hidden="true" />
        ) : (
          <ArrowDownRight size={14} aria-hidden="true" />
        )}
        {formatSignedPercent(index.changePercent)}
      </p>
    </div>
  );
}

function MoversTable({
  title,
  movers,
  currency,
  tone,
}: {
  title: string;
  movers: MoverQuote[];
  currency: string;
  tone: "up" | "down";
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border-base bg-surface shadow-sm">
      <h3 className="border-b border-border-base px-4 py-2.5 text-sm font-semibold">{title}</h3>

      {movers.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">No data available.</p>
      ) : (
        <ol className="divide-y divide-border-base">
          {movers.map((mover, i) => (
            <li key={mover.symbol} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-5 shrink-0 text-xs text-muted tabular">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium" title={mover.name}>
                {mover.name}
                <span className="ml-1.5 text-xs text-muted">{mover.symbol}</span>
              </span>
              <span className="shrink-0 tabular">{formatPrice(mover.price, currency)}</span>
              <span
                className={clsx(
                  "w-20 shrink-0 text-right font-semibold tabular",
                  tone === "up" ? "text-gain" : "text-loss",
                )}
              >
                {formatSignedPercent(mover.changePercent)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function MarketOverviewSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="skeleton h-72 rounded-xl" />
        <div className="skeleton h-72 rounded-xl" />
      </div>
    </div>
  );
}
