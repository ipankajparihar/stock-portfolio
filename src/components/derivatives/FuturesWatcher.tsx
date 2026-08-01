"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import clsx from "clsx";
import { Banner } from "@/components/ui/Banner";
import { GlossaryDisclosure, type GlossaryItem } from "@/components/ui/GlossaryDisclosure";
import { useFuturesWatchlist } from "@/hooks/useFuturesWatchlist";
import { directionOf, formatPrice, formatSignedPercent } from "@/lib/format";
import type { FutureContract } from "@/lib/types";

const GLOSSARY: GlossaryItem[] = [
  {
    term: "Futures contract",
    definition:
      "An agreement to buy or sell something at a set price on a future date. Traders watch them as a read on where the market expects prices to head.",
  },
  {
    term: "Why these move before the market opens",
    definition:
      "Index futures trade nearly around the clock, so they're the common early signal for how US stocks may open.",
  },
  {
    term: "Front-month / continuous",
    definition:
      "Each card tracks the nearest active contract, rolled forward as it expires — not a full multi-expiry chain like the Options tab, since that data isn't available for futures through this source.",
  },
];

/**
 * Every contract on one screen as a compact card, rather than a list where picking one hides the
 * other eight. With only nine instruments there's no reason to make the whole picture a click
 * away — the card carries the four things that matter (price, direction, what it tracks, where it
 * sits in its year) and stops there.
 */
export function FuturesWatcher() {
  const { contracts, isLoading, error } = useFuturesWatchlist();

  const indexFutures = contracts.filter((c) => c.category === "index");
  const commodityFutures = contracts.filter((c) => c.category === "commodity");

  // Nine contracts, recomputed only when a poll delivers a fresh array — a memo would cost more
  // machinery than the passes it saves.
  const withChange = contracts.filter((c) => c.changePercent != null);
  const up = withChange.filter((c) => c.changePercent! > 0).length;
  const down = withChange.filter((c) => c.changePercent! < 0).length;
  const biggestMover = withChange.reduce<FutureContract | null>(
    (max, c) => (max == null || Math.abs(c.changePercent!) > Math.abs(max.changePercent!) ? c : max),
    null,
  );

  if (error) return <Banner tone="error" message={`Couldn't load futures data: ${error}`} />;

  if (isLoading && contracts.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PulseBar up={up} down={down} biggestMover={biggestMover} />
        <GlossaryDisclosure label="What am I looking at?" items={GLOSSARY} variant="popover" />
      </div>

      <ContractSection title="Index Futures" contracts={indexFutures} />
      <ContractSection title="Commodities" contracts={commodityFutures} />
    </div>
  );
}

/** One-line read on the whole board, so the first thing you see is a conclusion, not nine numbers. */
function PulseBar({
  up,
  down,
  biggestMover,
}: {
  up: number;
  down: number;
  biggestMover: FutureContract | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border-base bg-surface px-3 py-2 text-xs">
      <span className="flex items-center gap-1 font-medium text-gain">
        <ArrowUpRight size={13} aria-hidden="true" />
        {up} up
      </span>
      <span className="flex items-center gap-1 font-medium text-loss">
        <ArrowDownRight size={13} aria-hidden="true" />
        {down} down
      </span>
      {biggestMover && (
        <span className="text-muted">
          Biggest mover: <span className="font-medium text-foreground">{biggestMover.name}</span>{" "}
          <span className={toneFor(directionOf(biggestMover.changePercent))}>
            {formatSignedPercent(biggestMover.changePercent)}
          </span>
        </span>
      )}
    </div>
  );
}

/** Flat and unknown both read as neutral — only a real move earns a colour. */
function toneFor(direction: ReturnType<typeof directionOf>): string {
  return direction === "up" ? "text-gain" : direction === "down" ? "text-loss" : "text-muted";
}

function ContractSection({ title, contracts }: { title: string; contracts: FutureContract[] }) {
  if (contracts.length === 0) return null;

  return (
    <section className="space-y-2.5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-strong uppercase">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {contracts.map((contract) => (
          <ContractCard key={contract.symbol} contract={contract} />
        ))}
      </div>
    </section>
  );
}

function ContractCard({ contract }: { contract: FutureContract }) {
  const direction = directionOf(contract.changePercent);
  const Icon = direction === "up" ? ArrowUpRight : ArrowDownRight;
  const tone = toneFor(direction);

  return (
    <article
      className={clsx(
        "rounded-xl border border-border-base bg-surface p-4 shadow-sm transition-colors",
        // A hairline of the day's colour on the leading edge — direction readable while scanning
        // the grid, without repainting the whole card.
        direction === "up" && "border-l-2 border-l-gain",
        direction === "down" && "border-l-2 border-l-loss",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="truncate text-sm font-semibold">{contract.name}</h4>
        <span className="shrink-0 text-xs text-muted">{contract.symbol}</span>
      </div>

      <p className="mt-0.5 truncate text-xs text-muted">{contract.description}</p>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular">
          {formatPrice(contract.price, contract.currency)}
        </span>
        <span className={clsx("inline-flex items-center gap-0.5 text-sm font-semibold tabular", tone)}>
          {direction !== "flat" && <Icon size={14} aria-hidden="true" />}
          {formatSignedPercent(contract.changePercent)}
        </span>
      </div>

      <YearRange contract={contract} />
    </article>
  );
}

/**
 * Where today's price sits inside the last year, as a dot on a line. One visual answers "is this
 * high or low right now" — a question no single price can answer on its own — and the
 * near-the-edge badge only appears when the answer is actually noteworthy.
 */
function YearRange({ contract }: { contract: FutureContract }) {
  const { fiftyTwoWeekLow: low, fiftyTwoWeekHigh: high, price, currency } = contract;

  if (low == null || high == null || price == null || high <= low) return null;

  const position = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
  const edge = position >= 90 ? "Near 52-week high" : position <= 10 ? "Near 52-week low" : null;

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-muted">52-week range</span>
        {edge && (
          <span
            className={clsx(
              "rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
              position >= 90 ? "bg-gain-soft text-gain" : "bg-loss-soft text-loss",
            )}
          >
            {edge}
          </span>
        )}
      </div>

      <div className="relative mt-2 h-1.5 rounded-full bg-surface-muted">
        <div
          className="absolute top-1/2 size-3 rounded-full border-2 border-surface bg-accent shadow-sm"
          style={{ left: `${position}%`, transform: "translate(-50%, -50%)" }}
          aria-hidden="true"
        />
      </div>

      <div className="mt-1.5 flex justify-between text-xs text-muted tabular">
        <span>{formatPrice(low, currency)}</span>
        <span>{formatPrice(high, currency)}</span>
      </div>
    </div>
  );
}
