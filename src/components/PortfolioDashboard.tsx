"use client";

import { useCallback, useMemo, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { AlertTriangle, LayoutList, Search, Rows3, X } from "lucide-react";
import clsx from "clsx";
import { PortfolioTable } from "@/components/PortfolioTable";
import { SectorCharts } from "@/components/SectorCharts";
import { SectorSection } from "@/components/SectorSection";
import { SummaryCards } from "@/components/SummaryCards";
import { StatusBar } from "@/components/StatusBar";
import { Banner } from "@/components/ui/Banner";
import { GainLoss } from "@/components/ui/GainLoss";
import { usePortfolio } from "@/hooks/usePortfolio";
import { formatCurrency } from "@/lib/format";
import type { PortfolioResponse, PortfolioRow, SectorGroup } from "@/lib/types";

/**
 * The dashboard shell: owns view state (search, grouping, sorting, expansion) and composes
 * everything else. All *data* state lives in `usePortfolio`; all *derived* data lives on the
 * server. This component only decides what is shown.
 */

export function PortfolioDashboard() {
  const {
    data,
    isInitialLoading,
    isManualRefreshing,
    isConnected,
    error,
    nextRefreshAt,
    isPaused,
    refresh,
  } = usePortfolio();

  const [query, setQuery] = useState("");
  const [grouped, setGrouped] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleSector = useCallback((sector: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sector)) next.delete(sector);
      else next.add(sector);
      return next;
    });
  }, []);

  // Search filters which *rows* are visible. It deliberately does NOT recompute sector
  // subtotals or portfolio weights: those are facts about the portfolio, not about the
  // current search box. Showing "Technology: ₹90,000" because you filtered to one stock
  // would be inventing a number.
  const { sectors, flatRows, matchCount, totalCount } = useFilteredSectors(data, query);

  if (isInitialLoading) return <DashboardSkeleton />;

  // Only reachable when the very first load failed and there's nothing to show.
  if (!data) return <FatalError message={error} onRetry={refresh} />;

  // The page has no refreshing state, by design. Updates are pushed, land silently, and only the
  // cells whose price actually moved react — see the note atop `usePortfolio`. Dimming the whole
  // dashboard to announce an incoming frame would make every update feel like a page load.
  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">Portfolio Dashboard</h1>
            <p className="text-sm text-muted">
              Live prices from Yahoo Finance · Fundamentals from Google Finance
            </p>
          </div>
        </div>

        <StatusBar
          updatedAt={data.updatedAt}
          fundamentalsUpdatedAt={data.fundamentalsUpdatedAt}
          marketState={data.marketState}
          nextRefreshAt={nextRefreshAt}
          isConnected={isConnected}
          isManualRefreshing={isManualRefreshing}
          isPaused={isPaused}
          onRefresh={refresh}
        />
      </header>

      {/* A failed refresh is a warning, not a takeover: the last good data is still on screen. */}
      {error && <Banner tone="error" message={`Refresh failed: ${error}. Showing last known data.`} />}
      {[...data.quoteWarnings, ...data.fundamentalsWarnings].map((warning) => (
        <Banner key={warning} tone="warn" message={warning} />
      ))}

      {/* Sub-slices, not the whole payload: a quote tick always bumps `data.updatedAt`, so a
          component memo'd on `data` would re-render on every tick even when nothing it draws
          moved. Passing only what it reads lets the memo actually hold. */}
      <SummaryCards totals={data.totals} sectors={data.sectors} />

      <SectorCharts sectors={data.sectors} />

      {/* One filter row, above everything it scopes. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stock or symbol…"
            aria-label="Search holdings by name or symbol"
            className={clsx(
              "w-full rounded-lg border border-border-base bg-surface py-2 pr-8 pl-9 text-sm",
              "placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none",
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setGrouped((g) => !g)}
          aria-pressed={grouped}
          className={clsx(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
            "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
            grouped
              ? "border-accent bg-accent-soft text-accent"
              : "border-border-base bg-surface text-muted-strong hover:bg-surface-muted",
          )}
        >
          {grouped ? <LayoutList size={15} /> : <Rows3 size={15} />}
          {grouped ? "Grouped by sector" : "Flat list"}
        </button>

        {query && (
          <span className="text-xs text-muted" aria-live="polite">
            {matchCount} of {totalCount} holdings
          </span>
        )}
      </div>

      {/* Holdings */}
      {matchCount === 0 ? (
        <EmptyState query={query} onClear={() => setQuery("")} />
      ) : grouped ? (
        <div className="space-y-3">
          {sectors.map((group) => (
            <SectorSection
              key={group.sector}
              group={group}
              isExpanded={!collapsed.has(group.sector)}
              onToggle={toggleSector}
              sorting={sorting}
              onSortingChange={setSorting}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-base bg-surface shadow-sm">
          <PortfolioTable rows={flatRows} sorting={sorting} onSortingChange={setSorting} />
        </div>
      )}

      {/* Grand total — the bottom line, always visible regardless of grouping or filter. */}
      <TotalsBar data={data} />

      <Disclaimer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/**
 * The `useMemo` is load-bearing, not decoration. `sectors` and `flatRows` are handed straight
 * to `memo`'d children, so they have to keep their identity across every render that didn't
 * actually change them — a fresh array here would defeat the memo, and for `flatRows` it would
 * also make TanStack rebuild the whole row and sort model from scratch on each render.
 */
function useFilteredSectors(data: PortfolioResponse | null, query: string) {
  return useMemo(() => {
    if (!data) {
      return { sectors: [] as SectorGroup[], flatRows: [] as PortfolioRow[], matchCount: 0, totalCount: 0 };
    }

    const totalCount = data.sectors.reduce((n, s) => n + s.rows.length, 0);
    const needle = query.trim().toLowerCase();

    const sectors = needle
      ? data.sectors
          .map((group) => ({
            ...group,
            rows: group.rows.filter(
              (row) =>
                row.name.toLowerCase().includes(needle) ||
                row.symbol.toLowerCase().includes(needle) ||
                row.sector.toLowerCase().includes(needle),
            ),
          }))
          .filter((group) => group.rows.length > 0)
      : data.sectors;

    const flatRows = sectors.flatMap((s) => s.rows);
    return { sectors, flatRows, matchCount: flatRows.length, totalCount };
  }, [data, query]);
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function TotalsBar({ data }: { data: PortfolioResponse }) {
  const { totals } = data;

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-border-strong bg-surface-muted px-4 py-3 shadow-sm">
      <span className="text-sm font-semibold">Portfolio Total</span>

      <span className="flex flex-col">
        <span className="text-[11px] tracking-wide text-muted uppercase">Investment</span>
        <span className="text-sm font-semibold tabular">{formatCurrency(totals.investment)}</span>
      </span>

      <span className="flex flex-col">
        <span className="text-[11px] tracking-wide text-muted uppercase">Present Value</span>
        <span className="text-sm font-semibold tabular">{formatCurrency(totals.presentValue)}</span>
      </span>

      <span className="flex flex-col">
        <span className="text-[11px] tracking-wide text-muted uppercase">Gain / Loss</span>
        <GainLoss value={totals.gainLoss} percent={totals.gainLossPercent} size="md" />
      </span>
    </div>
  );
}

function EmptyState({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center">
      <p className="text-sm font-medium">No holdings match “{query}”</p>
      <p className="mt-1 text-sm text-muted">Try a stock name, symbol, or sector.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 rounded-lg border border-border-base px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
      >
        Clear search
      </button>
    </div>
  );
}

function FatalError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-loss-border bg-loss-soft p-10 text-center">
      <AlertTriangle size={28} className="mx-auto text-loss" aria-hidden="true" />
      <h2 className="mt-3 text-base font-semibold">Couldn’t load your portfolio</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-strong">
        {message ?? "The market data providers could not be reached."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}

/**
 * Required by the brief, and genuinely warranted: both feeds are unofficial. Yahoo's quote
 * endpoints are undocumented, and the Google figures are scraped from a page that can change
 * shape without notice. Saying so plainly is part of handling the data honestly.
 */
function Disclaimer() {
  return (
    <p className="pt-1 pb-6 text-xs leading-relaxed text-muted">
      <strong className="font-medium text-muted-strong">Data disclaimer:</strong>{" "}
      prices come from Yahoo Finance’s unofficial endpoints and P/E &amp; earnings are scraped
      from Google Finance. Neither provides an official public API, so figures may be delayed, rounded, or
      occasionally unavailable, and the two sources can disagree on P/E because they use
      different earnings bases. This dashboard is for demonstration only — not investment advice.
    </p>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading portfolio">
      <div className="space-y-2">
        <div className="skeleton h-7 w-56 rounded-lg" />
        <div className="skeleton h-4 w-80 rounded" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-28 rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="skeleton h-52 rounded-xl" />
        <div className="skeleton h-52 rounded-xl" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))}
      </div>

      <p className="text-center text-sm text-muted">
        Fetching live quotes and fundamentals…
      </p>
    </div>
  );
}
