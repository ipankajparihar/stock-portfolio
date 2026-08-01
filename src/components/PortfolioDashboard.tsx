"use client";

import { useCallback, useMemo, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import {
  AlertTriangle,
  Layers,
  LayoutList,
  Search,
  Rows3,
  Wallet,
  X,
} from "lucide-react";
import clsx from "clsx";
import { PortfolioTable } from "@/components/PortfolioTable";
import { SectorCharts } from "@/components/SectorCharts";
import { SectorSection } from "@/components/SectorSection";
import { SummaryCards } from "@/components/SummaryCards";
import { StatusBar } from "@/components/StatusBar";
import { Banner } from "@/components/ui/Banner";
import { GainLoss } from "@/components/ui/GainLoss";
import { usePortfolio } from "@/hooks/usePortfolio";
import { directionOf, formatCurrency } from "@/lib/format";
import type { MarketGroup, SectorGroup } from "@/lib/types";

const MARKET_LABEL: Record<string, string> = { US: "United States", IN: "India" };
const MARKET_FLAG: Record<string, string> = { US: "🇺🇸", IN: "🇮🇳" };

/**
 * The dashboard shell: owns view state (search, grouping, sorting, expansion) and composes
 * everything else. All *data* state lives in `usePortfolio`; all *derived* data lives on the
 * server. This component only decides what is shown.
 *
 * One full section is rendered per market group — US and Indian holdings are denominated in
 * different currencies, so there is no single blended total to show at the top of the page.
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

  if (isInitialLoading) return <DashboardSkeleton />;

  // Only reachable when the very first load failed and there's nothing to show.
  if (!data) return <FatalError message={error} onRetry={refresh} />;

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
              <Wallet size={22} className="text-accent" aria-hidden="true" />
              Your Portfolio
            </h1>
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

      {error && <Banner tone="error" message={`Refresh failed: ${error}. Showing last known data.`} />}
      {[...data.quoteWarnings, ...data.fundamentalsWarnings].map((warning) => (
        <Banner key={warning} tone="warn" message={warning} />
      ))}

      {data.marketGroups.length === 0 ? (
        <NoHoldingsEmptyState />
      ) : (
        data.marketGroups.map((group) => (
          <MarketSection key={group.market} group={group} />
        ))
      )}

      <Disclaimer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One market's section
// ---------------------------------------------------------------------------

function MarketSection({ group }: { group: MarketGroup }) {
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

  const { sectors, flatRows, matchCount, totalCount } = useFilteredSectors(group.sectors, query);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="text-xl" aria-hidden="true">
          {MARKET_FLAG[group.market] ?? "🌐"}
        </span>
        <h2 className="text-lg font-semibold">{MARKET_LABEL[group.market] ?? group.market}</h2>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
          {group.currency}
        </span>
        <span className="text-xs text-muted">
          {totalCount} position{totalCount === 1 ? "" : "s"}
        </span>
      </div>

      <SummaryCards totals={group} sectors={group.sectors} currency={group.currency} />
      <SectorCharts sectors={group.sectors} currency={group.currency} />

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
            aria-label={`Search ${group.market} holdings by name or symbol`}
            className="input pl-9"
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

      {matchCount === 0 ? (
        <EmptyState query={query} onClear={() => setQuery("")} />
      ) : grouped ? (
        <div className="space-y-3">
          {sectors.map((sectorGroup) => (
            <SectorSection
              key={sectorGroup.sector}
              group={sectorGroup}
              currency={group.currency}
              isExpanded={!collapsed.has(sectorGroup.sector)}
              onToggle={toggleSector}
              sorting={sorting}
              onSortingChange={setSorting}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-base bg-surface shadow-sm">
          <PortfolioTable
            rows={flatRows}
            currency={group.currency}
            sorting={sorting}
            onSortingChange={setSorting}
          />
        </div>
      )}

      {matchCount > 0 && <TotalsFooter group={group} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function useFilteredSectors(allSectors: SectorGroup[], query: string) {
  return useMemo(() => {
    const totalCount = allSectors.reduce((n, s) => n + s.rows.length, 0);
    const needle = query.trim().toLowerCase();

    const sectors = needle
      ? allSectors
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
      : allSectors;

    const flatRows = sectors.flatMap((s) => s.rows);
    return { sectors, flatRows, matchCount: flatRows.length, totalCount };
  }, [allSectors, query]);
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

/**
 * The grand total, restated right after the holdings list. After scrolling past a dozen rows
 * the reader has lost the summary shown at the top — this puts it back exactly where their eye
 * lands next, styled as a verdict strip (colour-coded to the outcome) rather than a repeat of
 * `SummaryCards`'s neutral stat tiles.
 */
function TotalsFooter({ group }: { group: MarketGroup }) {
  const direction = directionOf(group.gainLoss);

  return (
    <div
      className={clsx(
        "flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-border-strong bg-surface-muted px-4 py-3.5 shadow-sm",
        direction === "up"
          ? "border-l-4 border-l-gain"
          : direction === "down"
            ? "border-l-4 border-l-loss"
            : "border-l-4 border-l-border-strong",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        <Layers size={15} className="text-muted" aria-hidden="true" />
        Total
      </span>

      <span className="flex flex-col">
        <span className="text-[11px] tracking-wide text-muted uppercase">Investment</span>
        <span className="text-sm font-semibold tabular">
          {formatCurrency(group.investment, group.currency)}
        </span>
      </span>

      <span className="flex flex-col">
        <span className="text-[11px] tracking-wide text-muted uppercase">Present Value</span>
        <span className="text-sm font-semibold tabular">
          {formatCurrency(group.presentValue, group.currency)}
        </span>
      </span>

      <span className="flex flex-col">
        <span className="text-[11px] tracking-wide text-muted uppercase">Gain / Loss</span>
        <GainLoss value={group.gainLoss} percent={group.gainLossPercent} currency={group.currency} size="md" />
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

function NoHoldingsEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-surface p-12 text-center">
      <span className="mx-auto inline-flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Wallet size={22} aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold">You haven’t added any holdings yet</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
        Record a purchase — symbol, quantity, price, and date — and it will show up here with a
        live price and gain/loss.
      </p>
      <a
        href="#manage-holdings"
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
      >
        Add your first holding
      </a>
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
