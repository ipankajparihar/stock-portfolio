"use client";

import { useMemo, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowUpDown,
  Eye,
  LayoutGrid,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Table2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import clsx from "clsx";
import { AddWatchlistForm } from "@/components/watchlist/AddWatchlistForm";
import { StockScreener } from "@/components/watchlist/StockScreener";
import { WatchlistGrid } from "@/components/watchlist/WatchlistGrid";
import { WatchlistTable } from "@/components/watchlist/WatchlistTable";
import { Banner } from "@/components/ui/Banner";
import { useWatchlist } from "@/hooks/useWatchlist";
import { directionOf, formatRelativeTime, formatSignedPercent } from "@/lib/format";
import type { WatchlistRow } from "@/lib/watchlist-service";

type View = "grid" | "table";
type Panel = "none" | "add" | "screener";

type SortKey = "recent" | "az" | "change-desc" | "change-asc";

const SORTERS: Record<SortKey, (rows: WatchlistRow[]) => WatchlistRow[]> = {
  recent: (rows) => rows,
  az: (rows) => [...rows].sort((a, b) => a.name.localeCompare(b.name)),
  "change-desc": (rows) =>
    [...rows].sort((a, b) => (b.dayChangePercent ?? -Infinity) - (a.dayChangePercent ?? -Infinity)),
  "change-asc": (rows) =>
    [...rows].sort((a, b) => (a.dayChangePercent ?? Infinity) - (b.dayChangePercent ?? Infinity)),
};

export function WatchlistDashboard() {
  const { data, isInitialLoading, isManualRefreshing, isConnected, error, refresh } =
    useWatchlist();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [panel, setPanel] = useState<Panel>("none");
  const [view, setView] = useState<View>("grid");
  const [tableSorting, setTableSorting] = useState<SortingState>([]);

  const { filteredRows, visibleRows, stats } = useFilteredRows(data?.rows, query, sort);

  if (isInitialLoading) return <WatchlistSkeleton />;

  if (!data) return <FatalError message={error} onRetry={refresh} />;

  const isEmpty = data.rows.length === 0;

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
              <Eye size={22} className="text-accent" aria-hidden="true" />
              Watchlist
            </h1>
            <p className="text-sm text-muted">
              Stocks you&apos;re tracking, with today&apos;s live price.
            </p>
          </div>

          <LiveStatus
            isConnected={isConnected}
            isManualRefreshing={isManualRefreshing}
            updatedAt={data.updatedAt}
            onRefresh={refresh}
          />
        </div>
      </header>

      {error && <Banner tone="error" message={`Refresh failed: ${error}. Showing last known data.`} />}
      {data.warning && <Banner tone="warn" message={data.warning} />}

      {!isEmpty && <StatsBar rows={data.rows} stats={stats} />}

      <div className="flex flex-wrap items-center gap-3">
        {!isEmpty && (
          <>
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
                placeholder="Search your watchlist…"
                aria-label="Search watchlist by name or symbol"
                className="input pl-9"
              />
            </div>

            {view === "grid" && (
              <div className="relative">
                <ArrowUpDown
                  size={14}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  aria-label="Sort watchlist"
                  className="input w-auto pl-8"
                >
                  <option value="recent">Recently added</option>
                  <option value="az">Name (A–Z)</option>
                  <option value="change-desc">Change: High to low</option>
                  <option value="change-asc">Change: Low to high</option>
                </select>
              </div>
            )}

            <div className="inline-flex rounded-lg border border-border-base bg-surface p-1">
              <ViewToggleButton
                active={view === "grid"}
                label="Card view"
                icon={<LayoutGrid size={15} />}
                onClick={() => setView("grid")}
              />
              <ViewToggleButton
                active={view === "table"}
                label="Table view — sort by price, change, open, previous close, 52-week range, or P/E"
                icon={<Table2 size={15} />}
                onClick={() => setView("table")}
              />
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setPanel((p) => (p === "screener" ? "none" : "screener"))}
          aria-pressed={panel === "screener"}
          className={clsx(
            "ml-auto inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
            "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
            panel === "screener"
              ? "border-border-strong bg-surface-muted text-foreground"
              : "border-border-base bg-surface text-muted-strong hover:bg-surface-muted",
          )}
        >
          {panel === "screener" ? <X size={15} /> : <SlidersHorizontal size={15} />}
          {panel === "screener" ? "Close" : "Screen stocks"}
        </button>

        <button
          type="button"
          onClick={() => setPanel((p) => (p === "add" ? "none" : "add"))}
          aria-pressed={panel === "add"}
          className={clsx(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
            "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
            panel === "add"
              ? "border-border-strong bg-surface-muted text-foreground"
              : "border-accent bg-accent-soft text-accent hover:bg-accent-soft/80",
          )}
        >
          {panel === "add" ? <X size={15} /> : <Plus size={15} />}
          {panel === "add" ? "Close" : "Add to watchlist"}
        </button>
      </div>

      {panel === "add" && <AddWatchlistForm onClose={() => setPanel("none")} />}
      {panel === "screener" && (
        <StockScreener onClose={() => setPanel("none")} onAdded={refresh} />
      )}

      {isEmpty ? (
        <EmptyState onAdd={() => setPanel("add")} />
      ) : visibleRows.length === 0 ? (
        <NoMatches query={query} onClear={() => setQuery("")} />
      ) : view === "grid" ? (
        <WatchlistGrid rows={visibleRows} onRemoved={refresh} />
      ) : (
        <WatchlistTable
          rows={filteredRows}
          sorting={tableSorting}
          onSortingChange={setTableSorting}
          onRemoved={refresh}
        />
      )}
    </div>
  );
}

function ViewToggleButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={clsx(
        "rounded-md p-1.5 transition-colors",
        active ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
      )}
    >
      {icon}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Derived data
// ---------------------------------------------------------------------------

interface WatchlistStats {
  gainers: number;
  losers: number;
  bestMover: WatchlistRow | null;
}

function useFilteredRows(rows: WatchlistRow[] | undefined, query: string, sort: SortKey) {
  return useMemo(() => {
    const all = rows ?? [];

    const stats: WatchlistStats = {
      gainers: all.filter((r) => (r.dayChangePercent ?? 0) > 0).length,
      losers: all.filter((r) => (r.dayChangePercent ?? 0) < 0).length,
      bestMover:
        all.filter((r) => r.dayChangePercent != null).sort(
          (a, b) => Math.abs(b.dayChangePercent ?? 0) - Math.abs(a.dayChangePercent ?? 0),
        )[0] ?? null,
    };

    const needle = query.trim().toLowerCase();
    const filteredRows = needle
      ? all.filter(
          (r) => r.name.toLowerCase().includes(needle) || r.symbol.toLowerCase().includes(needle),
        )
      : all;

    // `filteredRows` (search only) feeds the table, which sorts itself by clicked column;
    // `visibleRows` additionally applies the dropdown sort, for the grid.
    return { filteredRows, visibleRows: SORTERS[sort](filteredRows), stats };
  }, [rows, query, sort]);
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function StatsBar({ rows, stats }: { rows: WatchlistRow[]; stats: WatchlistStats }) {
  const bestDirection = directionOf(stats.bestMover?.dayChangePercent);

  return (
    <section
      aria-label="Watchlist summary"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      <StatCard icon={<Eye size={16} />} label="Tracking">
        <span className="text-xl font-semibold tabular">{rows.length}</span>
      </StatCard>

      <StatCard icon={<TrendingUp size={16} />} label="Gainers today" tone="up">
        <span className="text-xl font-semibold tabular text-gain">{stats.gainers}</span>
      </StatCard>

      <StatCard icon={<TrendingDown size={16} />} label="Losers today" tone="down">
        <span className="text-xl font-semibold tabular text-loss">{stats.losers}</span>
      </StatCard>

      <StatCard icon={<Star size={16} />} label="Biggest mover">
        {stats.bestMover ? (
          <div className="flex flex-col">
            <span className="truncate text-sm font-semibold">{stats.bestMover.symbol}</span>
            <span
              className={clsx(
                "text-sm font-semibold tabular",
                bestDirection === "up" ? "text-gain" : bestDirection === "down" ? "text-loss" : "text-muted",
              )}
            >
              {formatSignedPercent(stats.bestMover.dayChangePercent)}
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted">—</span>
        )}
      </StatCard>
    </section>
  );
}

function StatCard({
  icon,
  label,
  tone,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "up" | "down";
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border-base bg-surface p-3.5 shadow-sm">
      <div
        className={clsx(
          "flex items-center gap-1.5 text-xs font-medium",
          tone === "up" ? "text-gain" : tone === "down" ? "text-loss" : "text-muted",
        )}
      >
        {icon}
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function LiveStatus({
  isConnected,
  isManualRefreshing,
  updatedAt,
  onRefresh,
}: {
  isConnected: boolean;
  isManualRefreshing: boolean;
  updatedAt: number;
  onRefresh: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isManualRefreshing}
      className={clsx(
        "inline-flex items-center gap-2 rounded-lg border bg-surface px-3 py-1.5 text-xs font-medium",
        "transition-colors hover:border-border-strong hover:bg-surface-muted",
        "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        isConnected ? "border-border-base" : "border-warn-border text-warn",
      )}
    >
      <span
        className={clsx(
          "size-1.5 rounded-full",
          isConnected ? "bg-gain pulse-live" : "bg-warn",
        )}
        aria-hidden="true"
      />
      <RefreshCw size={13} className={clsx(isManualRefreshing && "animate-spin")} aria-hidden="true" />
      {isManualRefreshing
        ? "Refreshing…"
        : isConnected
          ? `Updated ${formatRelativeTime(updatedAt)}`
          : "Reconnecting…"}
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-surface p-12 text-center">
      <span className="mx-auto inline-flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Eye size={22} aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold">Your watchlist is empty</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
        Follow the stocks you&apos;re weighing up and see today&apos;s move at a glance — before
        you commit any capital.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
      >
        <Plus size={15} />
        Add your first stock
      </button>
    </div>
  );
}

function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center">
      <p className="text-sm font-medium">No matches for “{query}”</p>
      <p className="mt-1 text-sm text-muted">Try a different name or symbol.</p>
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
      <h2 className="mt-3 text-base font-semibold">Couldn’t load your watchlist</h2>
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

function WatchlistSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading watchlist">
      <div className="space-y-2">
        <div className="skeleton h-7 w-48 rounded-lg" />
        <div className="skeleton h-4 w-72 rounded" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
