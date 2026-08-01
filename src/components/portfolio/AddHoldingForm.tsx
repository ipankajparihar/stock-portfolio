"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, X } from "lucide-react";
import { addHolding, type AddHoldingFormState } from "@/app/actions/holdings";
import { SymbolSearchInput } from "@/components/SymbolSearchInput";
import type { Exchange, Market, SymbolSearchResult } from "@/lib/types";

const EXCHANGES_BY_MARKET: Record<Market, Exchange[]> = {
  US: ["NASDAQ", "NYSE"],
  IN: ["NSE", "BSE"],
};

const INITIAL_STATE: AddHoldingFormState = {};

/**
 * Records a manual purchase — symbol, quantity, price, and date.
 *
 * The search box at the top is the fast path: pick a company and its symbol, exchange, market,
 * and sector fill themselves in below. Those fields stay live inputs rather than read-only
 * labels, so a wrong or missing sector (Yahoo's search doesn't always return one) is a quick
 * edit, not a blocker.
 *
 * On a successful add the form clears itself and the page's server-rendered holdings list is
 * refreshed — recording five purchases in a row shouldn't mean re-typing the market/exchange
 * dropdowns five times or wondering whether the last one actually saved.
 */
export function AddHoldingForm({ onClose }: { onClose?: () => void }) {
  const [state, action, pending] = useActionState(addHolding, INITIAL_STATE);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const hasSubmitted = useRef(false);

  const [market, setMarket] = useState<Market>("IN");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");

  // `state` gets a fresh object identity every time the action resolves — including on the
  // very first mount, which this ref exists to skip. Anything after that is a real submission.
  useEffect(() => {
    if (!hasSubmitted.current) {
      hasSubmitted.current = true;
      return;
    }
    if (state.error) return;

    formRef.current?.reset();
    // Microtask, not the effect body: setting state directly here would cascade an extra
    // render straight out of this effect.
    queueMicrotask(() => {
      setSymbol("");
      setName("");
      setSector("");
    });
    router.refresh();
  }, [state, router]);

  function onSelectSymbol(result: SymbolSearchResult) {
    setMarket(result.market);
    setExchange(result.exchange);
    setSymbol(result.symbol);
    setName(result.name);
    if (result.sector) setSector(result.sector);
  }

  return (
    <div className="rounded-xl border border-border-base bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Wallet size={17} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Record a purchase</h2>
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

      <form ref={formRef} action={action} className="space-y-3">
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
              placeholder="e.g. AAPL"
              className="input"
            />
          </Field>

          <Field label="Company name">
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Apple Inc."
              className="input"
            />
          </Field>

          <Field label="Sector">
            <input
              name="sector"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              required
              placeholder="e.g. Technology"
              className="input"
            />
          </Field>

          <Field label="Quantity">
            <input name="quantity" type="number" step="any" min="0" required className="input" />
          </Field>

          <Field label="Purchase price">
            <input
              name="purchasePrice"
              type="number"
              step="any"
              min="0"
              required
              className="input"
            />
          </Field>

          <Field label="Purchase date">
            <input name="purchaseDate" type="date" required className="input" />
          </Field>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Adding…" : "Add holding"}
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
