"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Wallet, X } from "lucide-react";
import { addTrade, type AddTradeFormState } from "@/app/actions/holdings";
import { SymbolSearchInput } from "@/components/SymbolSearchInput";
import { formatQuantity } from "@/lib/format";
import type { Exchange, Holding, Market, SymbolSearchResult, TradeSide } from "@/lib/types";

const EXCHANGES_BY_MARKET: Record<Market, Exchange[]> = {
  US: ["NASDAQ", "NYSE"],
  IN: ["NSE", "BSE"],
};

const INITIAL_STATE: AddTradeFormState = {};

/**
 * Records a trade — buy or sell.
 *
 * The two sides need different affordances. A buy is open-ended, so the symbol search is the fast
 * path: pick a company and symbol, exchange, market and sector fill themselves in. A sell can only
 * ever be against something already held, so the search is replaced by a picker of open positions
 * and the identity fields lock — you cannot sell a company you don't own, and typing its details
 * again would only invite a typo that silently creates a second position.
 */
export function AddTradeForm({
  onClose,
  openPositions,
}: {
  onClose?: () => void;
  openPositions: Holding[];
}) {
  const [state, action, pending] = useActionState(addTrade, INITIAL_STATE);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const hasSubmitted = useRef(false);

  const [side, setSide] = useState<TradeSide>("BUY");
  const [market, setMarket] = useState<Market>("IN");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");

  const selectedPosition =
    side === "SELL" ? openPositions.find((p) => p.symbol === symbol && p.exchange === exchange) : undefined;

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

  function onSelectPosition(id: string) {
    const position = openPositions.find((p) => p.id === id);
    if (!position) return;
    setMarket(position.market);
    setExchange(position.exchange);
    setSymbol(position.symbol);
    setName(position.name);
    setSector(position.sector);
  }

  function switchSide(next: TradeSide) {
    setSide(next);
    // The identity fields mean different things per side, so start clean rather than carrying a
    // half-filled buy into a sell.
    setSymbol("");
    setName("");
    setSector("");
  }

  const locked = side === "SELL";

  return (
    <div className="rounded-xl border border-border-base bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Wallet size={17} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Record a trade</h2>
            <p className="text-xs text-muted">
              {side === "BUY"
                ? "Search by company name or ticker to fill the rest in."
                : "Pick one of your open positions to sell from."}
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

      <div
        role="radiogroup"
        aria-label="Trade side"
        className="mb-4 inline-flex rounded-lg border border-border-base bg-surface-muted p-0.5"
      >
        {(["BUY", "SELL"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={side === option}
            onClick={() => switchSide(option)}
            disabled={option === "SELL" && openPositions.length === 0}
            title={
              option === "SELL" && openPositions.length === 0
                ? "Nothing to sell yet — record a buy first."
                : undefined
            }
            className={clsx(
              "rounded-md px-4 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              side === option
                ? option === "BUY"
                  ? "bg-gain-soft text-gain"
                  : "bg-loss-soft text-loss"
                : "text-muted hover:text-foreground",
            )}
          >
            {option === "BUY" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      <form ref={formRef} action={action} className="space-y-3">
        <input type="hidden" name="side" value={side} />

        {side === "BUY" ? (
          <Field label="Search company or ticker">
            <SymbolSearchInput onSelect={onSelectSymbol} />
          </Field>
        ) : (
          <Field label="Position to sell">
            <select
              value={selectedPosition?.id ?? ""}
              onChange={(e) => onSelectPosition(e.target.value)}
              required
              className="input"
            >
              <option value="" disabled>
                Choose a holding…
              </option>
              {openPositions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name} ({position.symbol}) — {formatQuantity(position.quantity)} held
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Market">
            <select
              name="market"
              value={market}
              disabled={locked}
              onChange={(e) => {
                const next = e.target.value as Market;
                setMarket(next);
                setExchange(EXCHANGES_BY_MARKET[next][0]);
              }}
              className="input disabled:opacity-60"
            >
              <option value="IN">India</option>
              <option value="US">United States</option>
            </select>
          </Field>

          <Field label="Exchange">
            <select
              name="exchange"
              value={exchange}
              disabled={locked}
              onChange={(e) => setExchange(e.target.value as Exchange)}
              className="input disabled:opacity-60"
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
              readOnly={locked}
              placeholder="e.g. AAPL"
              className="input read-only:opacity-60"
            />
          </Field>

          <Field label="Company name">
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              readOnly={locked}
              placeholder="e.g. Apple Inc."
              className="input read-only:opacity-60"
            />
          </Field>

          <Field label="Sector">
            <input
              name="sector"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              required
              readOnly={locked}
              placeholder="e.g. Technology"
              className="input read-only:opacity-60"
            />
          </Field>

          <Field
            label="Quantity"
            hint={
              selectedPosition ? `Max ${formatQuantity(selectedPosition.quantity)}` : undefined
            }
          >
            <input
              name="quantity"
              type="number"
              step="any"
              min="0"
              max={selectedPosition?.quantity}
              required
              className="input"
            />
          </Field>

          <Field label={side === "BUY" ? "Buy price" : "Sell price"}>
            <input name="price" type="number" step="any" min="0" required className="input" />
          </Field>

          <Field label="Trade date">
            <input name="tradeDate" type="date" required className="input" />
          </Field>

          <Field label="Fees" hint="Optional">
            <input name="fees" type="number" step="any" min="0" placeholder="0" className="input" />
          </Field>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : side === "BUY" ? "Add buy" : "Add sell"}
          </button>
          {state.error && <p className="text-sm text-loss">{state.error}</p>}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted uppercase">{label}</span>
        {hint && <span className="text-xs font-normal text-muted normal-case">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
