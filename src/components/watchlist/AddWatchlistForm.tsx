"use client";

import { useActionState, useState } from "react";
import { Eye, X } from "lucide-react";
import { addWatchlistEntry, type AddWatchlistFormState } from "@/app/actions/watchlist";
import { SymbolSearchInput } from "@/components/SymbolSearchInput";
import type { Exchange, Market, SymbolSearchResult } from "@/lib/types";

const EXCHANGES_BY_MARKET: Record<Market, Exchange[]> = {
  US: ["NASDAQ", "NYSE"],
  IN: ["NSE", "BSE"],
};

const INITIAL_STATE: AddWatchlistFormState = {};

/**
 * The search box is the fast path: pick a company and its symbol, exchange, and market fill
 * themselves in below. Those fields stay live inputs, not read-only labels, so a wrong or
 * missing match is a quick edit rather than a blocker — same pattern as `AddHoldingForm`.
 *
 * Left open after a successful add rather than auto-closing: watching five stocks in one sitting
 * shouldn't mean reopening this panel five times.
 */
export function AddWatchlistForm({ onClose }: { onClose?: () => void }) {
  const [state, action, pending] = useActionState(addWatchlistEntry, INITIAL_STATE);

  const [market, setMarket] = useState<Market>("IN");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");

  function onSelectSymbol(result: SymbolSearchResult) {
    setMarket(result.market);
    setExchange(result.exchange);
    setSymbol(result.symbol);
    setName(result.name);
  }

  return (
    <div className="rounded-xl border border-border-base bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Eye size={17} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Add a stock to watch</h2>
            <p className="text-xs text-muted">Search by company name or ticker to fill the rest in.</p>
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

      <form action={action} className="space-y-3">
        <Field label="Search company or ticker">
          <SymbolSearchInput onSelect={onSelectSymbol} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Market">
            <select
              name="market"
              value={market}
              onChange={(e) => {
                const next = e.target.value as Market;
                setMarket(next);
                setExchange(EXCHANGES_BY_MARKET[next][0]);
              }}
              className="input"
            >
              <option value="IN">India</option>
              <option value="US">United States</option>
            </select>
          </Field>

          <Field label="Exchange">
            <select
              name="exchange"
              value={exchange}
              onChange={(e) => setExchange(e.target.value as Exchange)}
              className="input"
            >
              {EXCHANGES_BY_MARKET[market].map((ex) => (
                <option key={ex} value={ex}>
                  {ex}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Symbol">
            <input
              name="symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              required
              placeholder="e.g. TSLA"
              className="input"
            />
          </Field>

          <Field label="Company name">
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Tesla Inc."
              className="input"
            />
          </Field>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Adding…" : "Add to watchlist"}
          </button>
          {state.error && <p className="text-sm text-loss">{state.error}</p>}
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted uppercase">{label}</span>
      {children}
    </label>
  );
}
