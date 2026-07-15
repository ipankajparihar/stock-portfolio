"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { PriceChart } from "@/components/stock/PriceChart";
import { Banner } from "@/components/ui/Banner";
import { GainLoss } from "@/components/ui/GainLoss";
import { useStockDetail } from "@/hooks/useStockDetail";
import {
  directionOf,
  formatCompactNumber,
  formatCrore,
  formatCurrency,
  formatMarketState,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatRatio,
  formatSignedCurrency,
  formatSignedPercent,
} from "@/lib/format";
import { VALID_RANGES } from "@/lib/ranges";
import type { ChartPoint, RangeKey, StockDetailResponse } from "@/lib/types";

/**
 * The stock detail page.
 *
 * Reading order is deliberate: what is it worth now (header) → what did it do (chart) →
 * what do *I* hold (position) → what are the fundamentals (stats) → what is the company.
 * Price first because that's what the click was for; the position card sits above the generic
 * fundamentals because this dashboard is about *your* holdings, not a generic quote page.
 */

interface StockDetailViewProps {
  symbol: string;
}

export function StockDetailView({ symbol }: StockDetailViewProps) {
  const { data, isInitialLoading, isManualRefreshing, isRangeLoading, error, range, setRange, refresh } =
    useStockDetail(symbol);

  // The price the header shows: the hovered point on the chart, or the live price when the
  // cursor is elsewhere. This is what makes the chart feel like an instrument rather than a
  // picture — scrub it and the big number follows.
  const [hovered, setHovered] = useState<ChartPoint | null>(null);
  const onHover = useCallback((point: ChartPoint | null) => setHovered(point), []);

  if (isInitialLoading) return <DetailSkeleton />;

  if (!data) {
    return (
      <div className="rounded-xl border border-loss-border bg-loss-soft p-10 text-center">
        <AlertTriangle size={28} className="mx-auto text-loss" aria-hidden="true" />
        <h2 className="mt-3 text-base font-semibold">Couldn’t load {symbol}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-strong">
          {error ?? "The market data providers could not be reached."}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Try again
          </button>
          <BackLink />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BackLink />

      <StockHeader
        data={data}
        hovered={hovered}
        isManualRefreshing={isManualRefreshing}
        onRefresh={refresh}
      />

      {error && (
        <Banner message={`Refresh failed: ${error}. Showing last known data.`} tone="error" />
      )}
      {data.warnings.map((w) => (
        <Banner key={w} message={w} tone="warn" />
      ))}

      {/* Chart */}
      <section className="rounded-xl border border-border-base bg-surface p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Price History</h2>
          <RangeTabs value={range} onChange={setRange} disabled={isRangeLoading} />
        </div>

        {data.history ? (
          <PriceChart
            history={data.history}
            range={range}
            isLoading={isRangeLoading}
            onHover={onHover}
          />
        ) : (
          <div className="flex h-[320px] items-center justify-center text-sm text-muted">
            Price history is unavailable right now.
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PositionCard data={data} />
        <KeyStats data={data} />
      </div>

      {data.profile?.description && <CompanyCard data={data} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function StockHeader({
  data,
  hovered,
  isManualRefreshing,
  onRefresh,
}: {
  data: StockDetailResponse;
  hovered: ChartPoint | null;
  isManualRefreshing: boolean;
  onRefresh: () => void;
}) {
  const { quote, history } = data;
  const market = formatMarketState(quote?.marketState ?? null);

  // While scrubbing the chart, the headline figures describe the hovered moment: the price at
  // that point, and its change measured from the window's baseline. Showing the *live* change
  // next to a *historical* price would be an outright lie about what the user is looking at.
  const isScrubbing = hovered !== null;
  const baseline = history?.baseline ?? null;

  const price = isScrubbing ? hovered.close : (quote?.cmp ?? null);

  const change = isScrubbing
    ? baseline == null
      ? null
      : hovered.close - baseline
    : (history?.change ?? quote?.dayChange ?? null);

  const changePercent = isScrubbing
    ? baseline == null || baseline === 0
      ? null
      : ((hovered.close - baseline) / baseline) * 100
    : (history?.changePercent ?? quote?.dayChangePercent ?? null);

  const direction = directionOf(change);

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold sm:text-2xl">{data.name}</h1>
          <span className="rounded border border-border-base bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-muted-strong">
            {data.symbol} · {data.exchange}
          </span>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">
            {data.sector}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          {/* Proportional figures, not tabular: at display size, equal-width digits
              make a number like 1,221 look loose and gappy. */}
          <span className="text-3xl font-semibold">{formatPrice(price)}</span>

          <span
            className={clsx(
              "text-sm font-semibold",
              direction === "up" ? "text-gain" : direction === "down" ? "text-loss" : "text-muted",
            )}
          >
            {formatSignedCurrency(change)} ({formatSignedPercent(changePercent)})
          </span>

          <span className="text-xs text-muted">
            {isScrubbing
              ? `at ${formatScrubTime(hovered.t, history?.range)}`
              : `over ${history?.range ?? "—"} · ${market.label}`}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onRefresh}
        disabled={isManualRefreshing}
        className={clsx(
          "inline-flex items-center gap-2 rounded-lg border border-border-base bg-surface px-3 py-1.5 text-xs font-medium",
          "transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <RefreshCw size={13} className={clsx(isManualRefreshing && "animate-spin")} aria-hidden="true" />
        {isManualRefreshing ? "Refreshing…" : "Refresh"}
      </button>
    </header>
  );
}

/**
 * Timestamp for the scrubbed point.
 *
 * Only the intraday ranges get a clock. On 1M and longer these are *daily* candles, so
 * appending "09:15 am" would invent a precision the data doesn't have — the point is a whole
 * day's close, not a moment.
 */
function formatScrubTime(t: number, range: RangeKey | undefined): string {
  const d = new Date(t);
  const isIntraday = range === "1D" || range === "5D";

  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: isIntraday ? undefined : "numeric",
    ...(isIntraday ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
  });
}

function RangeTabs({
  value,
  onChange,
  disabled,
}: {
  value: RangeKey;
  onChange: (r: RangeKey) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="Chart time range"
      className="flex gap-1 rounded-lg bg-surface-muted p-1"
    >
      {VALID_RANGES.map((r) => {
        const selected = r === value;

        return (
          <button
            key={r}
            role="tab"
            type="button"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onChange(r)}
            className={clsx(
              "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
              "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
              selected
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
              disabled && "cursor-not-allowed",
            )}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function PositionCard({ data }: { data: StockDetailResponse }) {
  const p = data.position;
  if (!p) return null;

  return (
    <section className="rounded-xl border border-border-base bg-surface p-4 shadow-sm">
      <h2 className="text-sm font-semibold">Your Position</h2>
      <p className="mb-3 text-xs text-muted">What you hold in {data.symbol}</p>

      <div className="mb-3 rounded-lg border border-border-base bg-surface-muted p-3">
        <p className="text-[11px] tracking-wide text-muted uppercase">Unrealised Gain / Loss</p>
        <div className="mt-1">
          <GainLoss value={p.gainLoss} percent={p.gainLossPercent} size="lg" />
        </div>
      </div>

      <dl className="space-y-2 text-sm">
        <Stat label="Quantity" value={`${formatQuantity(p.quantity)} shares`} />
        <Stat label="Avg. purchase price" value={formatPrice(p.purchasePrice)} />
        <Stat label="Invested" value={formatCurrency(p.investment)} />
        <Stat label="Present value" value={formatCurrency(p.presentValue)} />
        <Stat label="Portfolio weight" value={formatPercent(p.portfolioPercent)} />
      </dl>
    </section>
  );
}

function KeyStats({ data }: { data: StockDetailResponse }) {
  const q = data.quote;
  const f = data.fundamentals;

  return (
    <section className="rounded-xl border border-border-base bg-surface p-4 shadow-sm lg:col-span-2">
      <h2 className="text-sm font-semibold">Key Statistics</h2>
      <p className="mb-3 text-xs text-muted">
        Price data from Yahoo Finance · P/E, EPS and dividends from Google Finance
      </p>

      {/* One column on a phone. At two columns a value like "₹7,89,286 Cr" has to wrap onto a
          second line, splitting the number from its unit — which reads as a different number. */}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Previous close" value={formatPrice(q?.previousClose)} />
        <Stat label="Open" value={formatPrice(q?.open)} />
        <Stat
          label="Day range"
          value={
            q?.dayLow != null && q?.dayHigh != null
              ? `${formatPrice(q.dayLow)} – ${formatPrice(q.dayHigh)}`
              : "—"
          }
        />
        <Stat
          label="52-week range"
          value={
            q?.fiftyTwoWeekLow != null && q?.fiftyTwoWeekHigh != null
              ? `${formatPrice(q.fiftyTwoWeekLow)} – ${formatPrice(q.fiftyTwoWeekHigh)}`
              : "—"
          }
        />
        <Stat label="Market cap" value={formatCrore(q?.marketCap)} />
        <Stat label="Volume" value={formatCompactNumber(q?.volume)} />
        <Stat label="Avg. volume (3m)" value={formatCompactNumber(q?.averageVolume)} />

        {/* The two the brief specifically asks Google for. */}
        <Stat label="P/E ratio" value={formatRatio(f?.peRatio)} highlight />
        <Stat
          label="Latest earnings (EPS)"
          value={f?.latestEarnings != null ? formatPrice(f.latestEarnings) : "—"}
          highlight
        />

        <Stat label="Dividend yield" value={f?.dividendYield ?? "—"} />
        <Stat label="Quarterly dividend" value={formatPrice(f?.quarterlyDividend)} />
        <Stat label="Ex-dividend date" value={f?.exDividendDate ?? "—"} />
      </dl>

      {/* Google's earnings banner — richer than the bare EPS number, so don't waste it. */}
      {f?.earningsEvent && (
        <p
          className={clsx(
            "mt-3 rounded-lg border px-3 py-2 text-xs",
            /beat/i.test(f.earningsEvent)
              ? "border-gain-border bg-gain-soft text-gain"
              : /miss/i.test(f.earningsEvent)
                ? "border-loss-border bg-loss-soft text-loss"
                : "border-border-base bg-surface-muted text-muted-strong",
          )}
        >
          <span className="font-semibold">Earnings:</span> {f.earningsEvent}
        </p>
      )}
    </section>
  );
}

function CompanyCard({ data }: { data: StockDetailResponse }) {
  const p = data.profile;
  if (!p) return null;

  return (
    <section className="rounded-xl border border-border-base bg-surface p-4 shadow-sm">
      <h2 className="text-sm font-semibold">About {p.name}</h2>

      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        {p.industry && (
          <span>
            Industry: <span className="font-medium text-muted-strong">{p.industry}</span>
          </span>
        )}
        {p.employees != null && (
          <span>
            Employees:{" "}
            <span className="font-medium text-muted-strong">{formatQuantity(p.employees)}</span>
          </span>
        )}
        {p.website && (
          <a
            href={p.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
          >
            Website <ExternalLink size={11} aria-hidden="true" />
          </a>
        )}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted-strong">{p.description}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-base pb-1.5 last:border-0">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd
        className={clsx(
          "text-right font-medium tabular",
          highlight ? "text-accent" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      <ArrowLeft size={15} aria-hidden="true" />
      Back to portfolio
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading stock">
      <div className="skeleton h-4 w-32 rounded" />
      <div className="space-y-2">
        <div className="skeleton h-7 w-64 rounded-lg" />
        <div className="skeleton h-9 w-48 rounded-lg" />
      </div>
      <div className="skeleton h-[380px] rounded-xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="skeleton h-64 rounded-xl" />
        <div className="skeleton h-64 rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}
