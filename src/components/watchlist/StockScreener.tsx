"use client";

import { useState, useTransition } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Loader2,
  Minus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import clsx from "clsx";
import { addScreenedStock } from "@/app/actions/watchlist";
import { useStockScreener } from "@/hooks/useStockScreener";
import { directionOf, formatPrice, formatRatio, formatSignedPercent } from "@/lib/format";
import type { Market, ScreenedStock, ScreenerFilters } from "@/lib/types";

const EMPTY_FILTERS: ScreenerFilters = {};

/**
 * Filter stocks in the US or Indian market by price, day change, P/E, volume, and proximity to
 * the 52-week high/low, then add any match to the watchlist with one click.
 *
 * The candidate pool is fetched and cached server-side per market (`screener-service.ts`), so
 * every filter tweak here is just a debounced re-query over already-cached data — no upstream
 * cost per keystroke.
 */
export function StockScreener({ onClose, onAdded }: { onClose?: () => void; onAdded?: () => void }) {
  const [market, setMarket] = useState<Market>("IN");
  const [filters, setFilters] = useState<ScreenerFilters>(EMPTY_FILTERS);
  const { results, isLoading, error } = useStockScreener(market, filters);

  function setFilter<K extends keyof ScreenerFilters>(key: K, value: ScreenerFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined && v !== false);

  return (
    <div className="rounded-xl border border-border-base bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <SlidersHorizontal size={17} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Screen stocks</h2>
            <p className="text-xs text-muted">
              Filter the US or Indian market by price, change, P/E, volume, or 52-week range.
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="inline-flex rounded-lg border border-border-base bg-surface-muted p-1">
        {(["IN", "US"] as Market[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMarket(m)}
            aria-pressed={market === m}
            className={clsx(
              "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
              market === m ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            {m === "IN" ? "India" : "United States"}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <RangeField
          label="Price"
          minValue={filters.priceMin}
          maxValue={filters.priceMax}
          onMinChange={(v) => setFilter("priceMin", v)}
          onMaxChange={(v) => setFilter("priceMax", v)}
        />
        <RangeField
          label="Day change %"
          minValue={filters.changePercentMin}
          maxValue={filters.changePercentMax}
          onMinChange={(v) => setFilter("changePercentMin", v)}
          onMaxChange={(v) => setFilter("changePercentMax", v)}
        />
        <RangeField
          label="P/E ratio"
          minValue={filters.peMin}
          maxValue={filters.peMax}
          onMinChange={(v) => setFilter("peMin", v)}
          onMaxChange={(v) => setFilter("peMax", v)}
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted uppercase">Min. volume</span>
          <input
            type="number"
            min="0"
            placeholder="e.g. 100000"
            value={filters.volumeMin ?? ""}
            onChange={(e) => setFilter("volumeMin", e.target.value === "" ? undefined : Number(e.target.value))}
            className="input"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ToggleChip
          active={!!filters.nearHigh}
          label="Near 52-week high"
          onClick={() => setFilter("nearHigh", filters.nearHigh ? undefined : true)}
        />
        <ToggleChip
          active={!!filters.nearLow}
          label="Near 52-week low"
          onClick={() => setFilter("nearLow", filters.nearLow ? undefined : true)}
        />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="ml-auto text-xs font-medium text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-4">
        {error ? (
          <p className="rounded-lg border border-loss-border bg-loss-soft px-3 py-2 text-sm text-loss">
            {error}
          </p>
        ) : isLoading && results.length === 0 ? (
          <ResultsSkeleton />
        ) : results.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong px-3 py-6 text-center text-sm text-muted">
            No stocks match these filters.
          </p>
        ) : (
          <ResultsList results={results} isLoading={isLoading} onAdded={onAdded} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter inputs
// ---------------------------------------------------------------------------

function RangeField({
  label,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  minValue: number | undefined;
  maxValue: number | undefined;
  onMinChange: (v: number | undefined) => void;
  onMaxChange: (v: number | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted uppercase">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          placeholder="Min"
          value={minValue ?? ""}
          onChange={(e) => onMinChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className="input"
        />
        <span className="text-muted">–</span>
        <input
          type="number"
          placeholder="Max"
          value={maxValue ?? ""}
          onChange={(e) => onMaxChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className="input"
        />
      </div>
    </div>
  );
}

function ToggleChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-border-base bg-surface text-muted hover:bg-surface-muted",
      )}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function ResultsList({
  results,
  isLoading,
  onAdded,
}: {
  results: ScreenedStock[];
  isLoading: boolean;
  onAdded?: () => void;
}) {
  return (
    <div
      className={clsx(
        "max-h-[420px] overflow-y-auto rounded-lg border border-border-base transition-opacity",
        isLoading && "opacity-60",
      )}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="sticky top-0 border-b border-border-base bg-surface-muted text-xs font-semibold text-muted-strong">
            <th className="px-3 py-2 text-left">Name</th>
            <th className="px-3 py-2 text-right">Price</th>
            <th className="px-3 py-2 text-right">Change</th>
            <th className="px-3 py-2 text-right">P/E</th>
            <th className="px-3 py-2 text-right">52W Range</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {results.map((stock) => (
            <ResultRow key={`${stock.exchange}:${stock.symbol}`} stock={stock} onAdded={onAdded} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultRow({ stock, onAdded }: { stock: ScreenedStock; onAdded?: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "added" | "error">("idle");
  const direction = directionOf(stock.changePercent);

  function onAdd() {
    startTransition(async () => {
      const result = await addScreenedStock({
        symbol: stock.symbol,
        market: stock.market,
        exchange: stock.exchange,
        name: stock.name,
      });
      setStatus(result.error ? "error" : "added");
      if (!result.error) onAdded?.();
    });
  }

  return (
    <tr className="border-b border-border-base last:border-0 hover:bg-surface-muted">
      <td className="px-3 py-2">
        <span className="font-medium">{stock.name}</span>
        <span className="ml-1.5 text-xs text-muted">{stock.symbol}</span>
        <span className="ml-1.5 rounded border border-border-base bg-surface-muted px-1 py-0.5 text-[10px] font-medium text-muted-strong">
          {stock.exchange}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular">{formatPrice(stock.price, stock.currency)}</td>
      <td
        className={clsx(
          "px-3 py-2 text-right font-semibold tabular",
          direction === "up" ? "text-gain" : direction === "down" ? "text-loss" : "text-muted",
        )}
      >
        <span className="inline-flex items-center gap-0.5">
          {direction === "up" ? (
            <ArrowUpRight size={12} aria-hidden="true" />
          ) : direction === "down" ? (
            <ArrowDownRight size={12} aria-hidden="true" />
          ) : (
            <Minus size={12} aria-hidden="true" />
          )}
          {formatSignedPercent(stock.changePercent)}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular text-muted">
        {stock.peRatio == null ? "N/A" : formatRatio(stock.peRatio)}
      </td>
      <td className="px-3 py-2 text-right text-xs tabular text-muted">
        {stock.percentFromLow != null && stock.percentFromHigh != null
          ? `${formatSignedPercent(stock.percentFromLow)} / ${formatSignedPercent(stock.percentFromHigh)}`
          : "—"}
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          disabled={isPending || status === "added"}
          onClick={onAdd}
          aria-label={`Add ${stock.symbol} to watchlist`}
          className={clsx(
            "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
            status === "added"
              ? "border-gain-border bg-gain-soft text-gain"
              : "border-border-base bg-surface hover:bg-surface-muted",
            "disabled:cursor-not-allowed",
          )}
        >
          {isPending ? (
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          ) : status === "added" ? (
            <Check size={12} aria-hidden="true" />
          ) : null}
          {status === "added" ? "Added" : status === "error" ? "Retry" : "Add"}
        </button>
      </td>
    </tr>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="skeleton h-9 rounded-lg" />
      ))}
    </div>
  );
}
