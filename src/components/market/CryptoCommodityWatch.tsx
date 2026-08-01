"use client";

import { Bitcoin, Gem } from "lucide-react";
import clsx from "clsx";
import { useMarketData } from "@/components/market/MarketDataContext";
import { directionOf, formatPrice, formatSignedPercent } from "@/lib/format";
import type { IndexQuote } from "@/lib/types";

/**
 * Crypto and commodities trade globally, 24/7 — unlike the US/India equity board above, there's
 * no "market" to toggle between, so this renders unconditionally alongside it, fed by the same
 * shared poll.
 */
export function CryptoCommodityWatch() {
  const { data, isLoading } = useMarketData();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <WatchPanel
        title="Top Cryptocurrencies"
        icon={<Bitcoin size={16} aria-hidden="true" />}
        items={data?.crypto}
        isLoading={isLoading}
      />
      <WatchPanel
        title="Commodities"
        icon={<Gem size={16} aria-hidden="true" />}
        items={data?.commodities}
        isLoading={isLoading}
      />
    </div>
  );
}

function WatchPanel({
  title,
  icon,
  items,
  isLoading,
}: {
  title: string;
  icon: React.ReactNode;
  items: IndexQuote[] | undefined;
  isLoading: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border-base bg-surface shadow-sm">
      <h3 className="flex items-center gap-2 border-b border-border-base px-4 py-2.5 text-sm font-semibold">
        <span className="text-accent">{icon}</span>
        {title}
      </h3>

      {isLoading && !items ? (
        <div className="space-y-0 divide-y divide-border-base">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="px-4 py-3">
              <div className="skeleton h-4 w-full rounded" />
            </div>
          ))}
        </div>
      ) : !items || items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">No data available.</p>
      ) : (
        <ul className="divide-y divide-border-base">
          {items.map((item) => (
            <WatchRow key={item.symbol} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function WatchRow({ item }: { item: IndexQuote }) {
  const direction = directionOf(item.changePercent);

  return (
    <li className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium" title={item.name}>
        {item.name}
        <span className="ml-1.5 text-xs text-muted">{item.symbol}</span>
      </span>
      <span className="shrink-0 tabular">{formatPrice(item.price, "USD")}</span>
      <span
        className={clsx(
          "w-20 shrink-0 text-right font-semibold tabular",
          direction === "up" ? "text-gain" : direction === "down" ? "text-loss" : "text-muted",
        )}
      >
        {formatSignedPercent(item.changePercent)}
      </span>
    </li>
  );
}
