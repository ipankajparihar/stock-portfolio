"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronsUpDown } from "lucide-react";
import clsx from "clsx";
import { Banner } from "@/components/ui/Banner";
import { GlossaryDisclosure, type GlossaryItem } from "@/components/ui/GlossaryDisclosure";
import { useOptionChain } from "@/hooks/useOptionChain";
import {
  directionOf,
  formatCompactNumber,
  formatPercent,
  formatPrice,
  formatRatio,
  formatSignedPercent,
} from "@/lib/format";
import type { OptionContract } from "@/lib/types";

const POPULAR_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "SPY", "QQQ", "DIA"];

/** How many strikes to show on each side of the money by default — kept tight on purpose. */
const DEFAULT_STRIKE_WINDOW = 8;

/**
 * A real options chain for a chosen US-listed underlying: pick a symbol, pick an expiration,
 * see calls and puts side by side around the money. Defaults to a narrow strike window rather
 * than every strike Yahoo has (a liquid name can have 70+) — the strikes that matter are the
 * ones near the current price, and "show all" is one click away for anyone who wants the rest.
 */
export function OptionChain() {
  const [symbolInput, setSymbolInput] = useState("");
  const [symbol, setSymbol] = useState<string | null>(null);
  const [expiration, setExpiration] = useState<string | null>(null);
  const [showAllStrikes, setShowAllStrikes] = useState(false);

  const { chain, isLoading, error } = useOptionChain(symbol, expiration);

  function selectSymbol(next: string) {
    setSymbol(next.toUpperCase());
    setExpiration(null);
    setShowAllStrikes(false);
    setSymbolInput("");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border-base bg-surface p-4 shadow-sm">
        <p className="mb-2 text-xs font-medium text-muted uppercase">Popular</p>
        <div className="flex flex-wrap gap-1.5">
          {POPULAR_SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => selectSymbol(s)}
              aria-pressed={symbol === s}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                symbol === s
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border-base bg-surface text-muted hover:bg-surface-muted",
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (symbolInput.trim()) selectSymbol(symbolInput.trim());
          }}
        >
          <input
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder="Or type a US ticker…"
            className="input max-w-[220px]"
          />
          <button
            type="submit"
            className="rounded-lg border border-border-base bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-muted"
          >
            Load
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">
          Options data covers US-listed stocks and ETFs only — Indian (NSE/BSE) derivatives
          aren&apos;t available through this data source.
        </p>
      </div>

      {error && <Banner tone="error" message={error} />}

      {!symbol ? (
        <p className="rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center text-sm text-muted">
          Pick a symbol above to see its options chain.
        </p>
      ) : isLoading && !chain ? (
        <div className="skeleton h-96 rounded-xl" />
      ) : chain ? (
        <ChainView
          chain={chain}
          isLoading={isLoading}
          showAllStrikes={showAllStrikes}
          onToggleShowAll={() => setShowAllStrikes((v) => !v)}
          onSelectExpiration={setExpiration}
        />
      ) : null}
    </div>
  );
}

type HeatMetric = "openInterest" | "volume";
type ViewMode = "simple" | "full";

function ChainView({
  chain,
  isLoading,
  showAllStrikes,
  onToggleShowAll,
  onSelectExpiration,
}: {
  chain: NonNullable<ReturnType<typeof useOptionChain>["chain"]>;
  isLoading: boolean;
  showAllStrikes: boolean;
  onToggleShowAll: () => void;
  onSelectExpiration: (iso: string) => void;
}) {
  const direction = directionOf(chain.underlyingChangePercent);
  const Icon = direction === "up" ? ArrowUpRight : ArrowDownRight;
  const [viewMode, setViewMode] = useState<ViewMode>("simple");
  const [heatMetric, setHeatMetric] = useState<HeatMetric>("openInterest");

  const { rows, hiddenCount, atmStrike } = useStrikeRows(chain, showAllStrikes);
  const maxHeat = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      const callVal = row.call?.[heatMetric] ?? 0;
      const putVal = row.put?.[heatMetric] ?? 0;
      if (callVal > max) max = callVal;
      if (putVal > max) max = putVal;
    }
    return max;
  }, [rows, heatMetric]);
  const snapshot = useChainSnapshot(chain, atmStrike);

  // One column order, defined once: the header cells and the body cells both read from it, so
  // they can't drift out of sync. Puts mirror calls so the strike column sits in the middle.
  const callColumns: ContractColumn[] =
    viewMode === "simple" ? ["openInterest", "lastPrice"] : ["openInterest", "volume", "lastPrice"];
  const putColumns = [...callColumns].reverse();
  const cellHeat = viewMode === "simple" ? "openInterest" : heatMetric;

  return (
    <div className={clsx("space-y-4 transition-opacity", isLoading && "opacity-60")}>
      <div>
        <h2 className="text-lg font-semibold">
          {chain.name} <span className="text-sm text-muted">{chain.symbol}</span>
        </h2>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tabular">
            {formatPrice(chain.underlyingPrice, chain.currency)}
          </span>
          <span
            className={clsx(
              "inline-flex items-center gap-0.5 text-sm font-semibold tabular",
              direction === "up" ? "text-gain" : direction === "down" ? "text-loss" : "text-muted",
            )}
          >
            {direction !== "flat" && <Icon size={14} aria-hidden="true" />}
            {formatSignedPercent(chain.underlyingChangePercent)}
          </span>
        </div>
      </div>

      <SnapshotBar snapshot={snapshot} />

      <div
        role="tablist"
        aria-label="Expiration date"
        className="thin-scroll flex gap-1 overflow-x-auto rounded-lg bg-surface-muted p-1"
      >
        {chain.expirationDates.map((iso) => {
          const selected = iso === chain.expiration;
          return (
            <button
              key={iso}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => onSelectExpiration(iso)}
              className={clsx(
                "shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors",
                "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
                selected ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
              )}
            >
              {formatExpiration(iso)}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border-base bg-surface p-0.5">
          {(["simple", "full"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              aria-pressed={viewMode === mode}
              className={clsx(
                "rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors",
                viewMode === mode ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
              )}
            >
              {mode}
            </button>
          ))}
        </div>

        <GlossaryDisclosure label="What do these mean?" items={GLOSSARY} />
      </div>

      <div className="overflow-hidden rounded-xl border border-border-base bg-surface shadow-sm">
        {viewMode === "full" && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-base bg-surface-muted px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <span>Heatmap:</span>
              <div className="inline-flex rounded-md border border-border-base bg-surface p-0.5">
                {(["openInterest", "volume"] as const).map((metric) => (
                  <button
                    key={metric}
                    type="button"
                    onClick={() => setHeatMetric(metric)}
                    aria-pressed={heatMetric === metric}
                    className={clsx(
                      "rounded-[5px] px-2 py-0.5 text-xs font-semibold transition-colors",
                      heatMetric === metric
                        ? "bg-accent-soft text-accent"
                        : "text-muted hover:text-foreground",
                    )}
                  >
                    {metric === "openInterest" ? "OI" : "Volume"}
                  </button>
                ))}
              </div>
            </div>
            <HeatLegend />
          </div>
        )}
        {viewMode === "simple" && (
          <div className="flex items-center justify-end border-b border-border-base bg-surface-muted px-3 py-1.5">
            <HeatLegend label="Open interest" />
          </div>
        )}

        <div className="grid grid-cols-2 border-b border-border-base bg-surface-muted text-xs font-semibold text-muted-strong">
          <div className="px-3 py-2 text-center text-gain">Calls</div>
          <div className="px-3 py-2 text-center text-loss">Puts</div>
        </div>

        <div className="thin-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-base text-xs font-semibold text-muted-strong">
                {callColumns.map((column) => (
                  <th key={column} className="px-2 py-2 text-right">
                    {COLUMN_LABELS[column]}
                  </th>
                ))}
                <th className="bg-surface-muted px-3 py-2 text-center">Strike</th>
                {putColumns.map((column) => (
                  <th key={column} className="px-2 py-2 text-left">
                    {COLUMN_LABELS[column]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.strike}
                  className={clsx(
                    "border-b border-border-base last:border-0",
                    row.isAtm && "bg-accent-soft/40",
                  )}
                >
                  <ContractCells
                    contract={row.call}
                    side="call"
                    heatMetric={cellHeat}
                    maxHeat={maxHeat}
                    columns={callColumns}
                    currency={chain.currency}
                  />
                  <td className="bg-surface-muted px-3 py-2 text-center font-semibold tabular">
                    {formatPrice(row.strike, chain.currency)}
                  </td>
                  <ContractCells
                    contract={row.put}
                    side="put"
                    heatMetric={cellHeat}
                    maxHeat={maxHeat}
                    columns={putColumns}
                    currency={chain.currency}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(hiddenCount > 0 || showAllStrikes) && (
          <button
            type="button"
            onClick={onToggleShowAll}
            className="flex w-full items-center justify-center gap-1.5 border-t border-border-base py-2.5 text-xs font-medium text-accent hover:bg-surface-muted"
          >
            <ChevronsUpDown size={13} aria-hidden="true" />
            {showAllStrikes ? "Show fewer strikes" : `Show all ${rows.length + hiddenCount} strikes`}
          </button>
        )}
      </div>
    </div>
  );
}

function HeatLegend({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted">
      {label && <span>{label}:</span>}
      <span>Low</span>
      <div className="flex h-2.5 w-16 overflow-hidden rounded-full">
        <span className="flex-1 bg-[color-mix(in_srgb,var(--gain)_8%,transparent)]" />
        <span className="flex-1 bg-[color-mix(in_srgb,var(--gain)_35%,transparent)]" />
        <span className="flex-1 bg-[color-mix(in_srgb,var(--gain)_70%,transparent)]" />
      </div>
      <span>High</span>
    </div>
  );
}

const GLOSSARY: GlossaryItem[] = [
  { term: "Strike", definition: "The price at which the option can be exercised." },
  {
    term: "OI (Open Interest)",
    definition: "Contracts currently outstanding at that strike — not yet closed or expired. Strikes with heavy OI are often watched as price levels the market is positioned around.",
  },
  { term: "Vol (Volume)", definition: "Contracts traded at that strike so far today." },
  { term: "Last", definition: "The most recent traded price for that contract." },
  { term: "ATM", definition: "At-the-money — the strike closest to the current underlying price." },
  { term: "ITM", definition: "In-the-money — a call below the current price, or a put above it, already has intrinsic value." },
];

interface ChainSnapshot {
  daysToExpiry: number | null;
  atmStrike: number | null;
  atmIv: number | null;
  callOiShare: number | null;
}

/**
 * A few plain-language numbers up top — the "what am I looking at" a new user needs before the
 * raw table. `atmStrike` comes from `useStrikeRows` rather than being re-derived here, so the
 * highlighted row and the headline stat can never name different strikes.
 */
function useChainSnapshot(
  chain: { calls: OptionContract[]; puts: OptionContract[]; expiration: string },
  atmStrike: number | null,
): ChainSnapshot {
  // Lazy initializer keeps the clock read out of render (the repo's `react-hooks/purity` rule),
  // without an effect and the extra render it would cost. Same form as `StatusBar`.
  const [nowMs] = useState(() => Date.now());

  return useMemo(() => {
    const totalCallOi = chain.calls.reduce((sum, c) => sum + (c.openInterest ?? 0), 0);
    const totalPutOi = chain.puts.reduce((sum, p) => sum + (p.openInterest ?? 0), 0);
    const totalOi = totalCallOi + totalPutOi;

    const atmIvSamples = [...chain.calls, ...chain.puts]
      .filter((c) => c.strike === atmStrike && c.impliedVolatility != null)
      .map((c) => c.impliedVolatility!);
    const atmIv = atmIvSamples.length > 0 ? atmIvSamples.reduce((a, b) => a + b, 0) / atmIvSamples.length : null;

    const expiryMs = Date.parse(`${chain.expiration}T00:00:00Z`);
    const daysToExpiry = Number.isNaN(expiryMs)
      ? null
      : Math.max(0, Math.round((expiryMs - nowMs) / 86_400_000));

    return {
      daysToExpiry,
      atmStrike,
      atmIv,
      callOiShare: totalOi > 0 ? totalCallOi / totalOi : null,
    };
  }, [chain, atmStrike, nowMs]);
}

function SnapshotBar({ snapshot }: { snapshot: ChainSnapshot }) {
  const callPercent = snapshot.callOiShare != null ? Math.round(snapshot.callOiShare * 100) : null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <SnapshotStat
        label="Expires in"
        value={snapshot.daysToExpiry != null ? `${snapshot.daysToExpiry}d` : "—"}
      />
      <SnapshotStat label="At-the-money strike" value={formatRatio(snapshot.atmStrike)} />
      <SnapshotStat label="ATM implied volatility" value={formatPercent(snapshot.atmIv)} />
      <div className="rounded-lg border border-border-base bg-surface p-2.5">
        <p className="text-xs text-muted">Open interest split</p>
        {callPercent != null ? (
          <>
            <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div className="bg-gain" style={{ width: `${callPercent}%` }} />
              <div className="bg-loss" style={{ width: `${100 - callPercent}%` }} />
            </div>
            <p className="mt-1 text-xs tabular text-muted">
              <span className="text-gain">{callPercent}% calls</span> ·{" "}
              <span className="text-loss">{100 - callPercent}% puts</span>
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm font-semibold">—</p>
        )}
      </div>
    </div>
  );
}

function SnapshotStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-base bg-surface p-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular">{value}</p>
    </div>
  );
}

type ContractColumn = "openInterest" | "volume" | "lastPrice";

const COLUMN_LABELS: Record<ContractColumn, string> = {
  openInterest: "OI",
  volume: "Vol",
  lastPrice: "Last",
};

/** Renders exactly the columns it's given, in the given order — callers pass the visual left-to-right order directly. */
function ContractCells({
  contract,
  side,
  heatMetric,
  maxHeat,
  columns,
  currency,
}: {
  contract: OptionContract | undefined;
  side: "call" | "put";
  heatMetric: HeatMetric;
  maxHeat: number;
  columns: ContractColumn[];
  currency: string;
}) {
  if (!contract) {
    return (
      <td className="px-2 py-2 text-muted" colSpan={columns.length}>
        —
      </td>
    );
  }

  const itmClass = contract.inTheMoney ? "bg-accent-soft/25" : undefined;
  const heatColor = side === "call" ? "var(--gain)" : "var(--loss)";

  function heatStyle(metric: ContractColumn): CSSProperties | undefined {
    if (heatMetric !== metric || maxHeat <= 0) return undefined;
    const value = contract![metric];
    if (value == null || value <= 0) return undefined;
    const intensity = Math.min(1, value / maxHeat);
    const percent = Math.round(8 + intensity * 62);
    return { backgroundColor: `color-mix(in srgb, ${heatColor} ${percent}%, transparent)` };
  }

  return (
    <>
      {columns.map((column) => {
        const style = heatStyle(column);
        return (
          <td
            key={column}
            style={style}
            className={clsx(
              "px-2 py-2 text-right tabular",
              column === "lastPrice" ? "font-medium" : "text-muted",
              !style && itmClass,
            )}
          >
            {column === "lastPrice"
              ? formatPrice(contract.lastPrice, currency)
              : formatCompactNumber(contract[column])}
          </td>
        );
      })}
    </>
  );
}

interface StrikeRow {
  strike: number;
  call: OptionContract | undefined;
  put: OptionContract | undefined;
  isAtm: boolean;
}

/**
 * Merges calls and puts into one strike ladder and marks the at-the-money row. `atmStrike` is
 * returned so the snapshot above the table reports the same strike this highlights.
 */
function useStrikeRows(
  chain: { calls: OptionContract[]; puts: OptionContract[]; underlyingPrice: number | null },
  showAll: boolean,
): { rows: StrikeRow[]; hiddenCount: number; atmStrike: number | null } {
  return useMemo(() => {
    const byStrike = new Map<number, { call?: OptionContract; put?: OptionContract }>();
    for (const c of chain.calls) byStrike.set(c.strike, { ...byStrike.get(c.strike), call: c });
    for (const p of chain.puts) byStrike.set(p.strike, { ...byStrike.get(p.strike), put: p });

    const strikes = [...byStrike.keys()].sort((a, b) => a - b);
    if (strikes.length === 0) return { rows: [], hiddenCount: 0, atmStrike: null };

    const price = chain.underlyingPrice ?? strikes[Math.floor(strikes.length / 2)];
    let atmIndex = 0;
    let atmDistance = Infinity;
    strikes.forEach((s, i) => {
      const d = Math.abs(s - price);
      if (d < atmDistance) {
        atmDistance = d;
        atmIndex = i;
      }
    });
    const atmStrike = strikes[atmIndex];

    const allRows: StrikeRow[] = strikes.map((strike, i) => ({
      strike,
      call: byStrike.get(strike)?.call,
      put: byStrike.get(strike)?.put,
      isAtm: i === atmIndex,
    }));

    if (showAll) return { rows: allRows, hiddenCount: 0, atmStrike };

    const start = Math.max(0, atmIndex - DEFAULT_STRIKE_WINDOW);
    const end = Math.min(allRows.length, atmIndex + DEFAULT_STRIKE_WINDOW + 1);
    const windowed = allRows.slice(start, end);

    return { rows: windowed, hiddenCount: allRows.length - windowed.length, atmStrike };
  }, [chain, showAll]);
}

function formatExpiration(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
