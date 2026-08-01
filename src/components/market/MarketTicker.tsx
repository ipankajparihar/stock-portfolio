"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import clsx from "clsx";
import { useMarketData } from "@/components/market/MarketDataContext";
import { formatPrice } from "@/lib/format";
import type { MarketOverviewResponse } from "@/lib/types";

const indexPoints = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface TickerItem {
  key: string;
  label: string;
  value: string;
  changePercent: number | null;
}

/**
 * A full-bleed, always-moving strip of live index and top-mover quotes — the "this page is
 * alive" signal at the very top of the landing page. Reuses the shared market feed, so it
 * costs no extra network traffic.
 */
export function MarketTicker() {
  const { data } = useMarketData();
  const items = buildItems(data);

  return (
    <div className="relative overflow-hidden border-b border-border-base bg-surface">
      {items.length === 0 ? (
        <div className="h-10" aria-hidden="true" />
      ) : (
        <div className="ticker-track py-2.5" aria-label="Live market quotes">
          {[...items, ...items].map((item, i) => (
            <TickerCell key={`${item.key}-${i}`} item={item} />
          ))}
        </div>
      )}

      {/* Edge fades so items dissolve in and out rather than popping at the borders. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-surface to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-surface to-transparent" />
    </div>
  );
}

function TickerCell({ item }: { item: TickerItem }) {
  const up = (item.changePercent ?? 0) >= 0;

  return (
    <span className="mx-5 inline-flex items-center gap-2 text-sm whitespace-nowrap">
      <span className="font-semibold">{item.label}</span>
      <span className="tabular text-muted-strong">{item.value}</span>
      <span
        className={clsx(
          "inline-flex items-center gap-0.5 font-medium tabular",
          up ? "text-gain" : "text-loss",
        )}
      >
        {up ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
        {item.changePercent == null ? "—" : `${Math.abs(item.changePercent).toFixed(2)}%`}
      </span>
      <span className="ml-3 text-border-strong" aria-hidden="true">
        •
      </span>
    </span>
  );
}

/**
 * Flattens the overview into a single ticker feed: every index first (the headline numbers),
 * then a handful of the biggest movers from each market to keep the strip lively.
 */
function buildItems(data: MarketOverviewResponse | null): TickerItem[] {
  if (!data) return [];

  const items: TickerItem[] = [];

  for (const market of data.markets) {
    for (const index of market.indices) {
      items.push({
        key: index.symbol,
        label: index.name,
        value: index.price == null ? "—" : indexPoints.format(index.price),
        changePercent: index.changePercent,
      });
    }
  }

  for (const asset of [...data.crypto.slice(0, 3), ...data.commodities.slice(0, 2)]) {
    items.push({
      key: asset.symbol,
      label: asset.name,
      value: formatPrice(asset.price, "USD"),
      changePercent: asset.changePercent,
    });
  }

  for (const market of data.markets) {
    const currency = market.market === "IN" ? "INR" : "USD";
    for (const mover of [...market.gainers.slice(0, 4), ...market.losers.slice(0, 4)]) {
      items.push({
        key: `${market.market}-${mover.symbol}`,
        label: mover.symbol,
        value: formatPrice(mover.price, currency),
        changePercent: mover.changePercent,
      });
    }
  }

  return items;
}
