"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Receipt, Trash2 } from "lucide-react";
import { deleteTransaction } from "@/app/actions/holdings";
import { Banner } from "@/components/ui/Banner";
import { formatPrice, formatQuantity } from "@/lib/format";
import type { Transaction } from "@/lib/types";

const MARKET_LABEL: Record<string, string> = { US: "United States", IN: "India" };

/** Every trade exactly as recorded — the raw ledger `AddTradeForm` writes. */
export function TransactionsList({
  trades,
  onAddClick,
}: {
  trades: Transaction[];
  onAddClick?: () => void;
}) {
  // Deleting a buy that a later sell consumed is refused by the server; surface that here rather
  // than letting the rejection vanish silently.
  const [error, setError] = useState<string | null>(null);

  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center">
        <span className="mx-auto inline-flex size-10 items-center justify-center rounded-full bg-surface-muted text-muted">
          <Receipt size={18} aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm font-medium">No trades recorded yet</p>
        <p className="mt-1 text-sm text-muted">Every buy and sell you add appears here.</p>
        {onAddClick && (
          <button
            type="button"
            onClick={onAddClick}
            className="mt-4 rounded-lg border border-border-base px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
          >
            Record your first trade
          </button>
        )}
      </div>
    );
  }

  const symbolCount = new Set(trades.map((t) => `${t.symbol}:${t.exchange}`)).size;
  const buys = trades.filter((t) => t.side === "BUY").length;
  const sells = trades.length - buys;

  return (
    <div className="space-y-3">
      {error && <Banner tone="error" message={error} />}

      <div className="overflow-hidden rounded-xl border border-border-base bg-surface shadow-sm">
        <div className="flex items-center gap-1.5 border-b border-border-base bg-surface-muted px-4 py-2.5 text-xs text-muted">
          <Receipt size={13} aria-hidden="true" />
          {buys} buy{buys === 1 ? "" : "s"}
          {sells > 0 && `, ${sells} sell${sells === 1 ? "" : "s"}`} across {symbolCount} symbol
          {symbolCount === 1 ? "" : "s"}
        </div>

        <div className="thin-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-base text-xs font-semibold text-muted-strong">
                <th className="px-4 py-2 text-left">Side</th>
                <th className="px-4 py-2 text-left">Symbol</th>
                <th className="px-4 py-2 text-left">Market</th>
                <th className="px-4 py-2 text-right">Quantity</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-right">Fees</th>
                <th className="px-4 py-2 text-left">Trade date</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <TradeRow key={trade.id} trade={trade} onError={setError} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TradeRow({
  trade,
  onError,
}: {
  trade: Transaction;
  onError: (message: string | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isSell = trade.side === "SELL";

  function onDelete() {
    startTransition(async () => {
      onError(null);
      try {
        await deleteTransaction(trade.id);
        router.refresh();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Couldn't delete that trade.");
      }
    });
  }

  return (
    <tr className="group border-b border-border-base transition-colors last:border-0 hover:bg-surface-muted">
      <td className="px-4 py-2.5">
        <span
          className={clsx(
            "rounded px-1.5 py-0.5 text-xs font-semibold",
            isSell ? "bg-loss-soft text-loss" : "bg-gain-soft text-gain",
          )}
        >
          {isSell ? "SELL" : "BUY"}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <span className="font-medium">{trade.name}</span>
        <span className="ml-1.5 text-xs text-muted">{trade.symbol}</span>
      </td>
      <td className="px-4 py-2.5">
        <span className="rounded border border-border-base bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-muted-strong">
          {trade.exchange}
        </span>
        <span className="ml-1.5 text-xs text-muted">
          {MARKET_LABEL[trade.market] ?? trade.market}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right tabular">{formatQuantity(trade.quantity)}</td>
      <td className="px-4 py-2.5 text-right font-medium tabular">
        {formatPrice(trade.price, trade.currency)}
      </td>
      <td className="px-4 py-2.5 text-right tabular text-muted">
        {trade.fees > 0 ? formatPrice(trade.fees, trade.currency) : "—"}
      </td>
      <td className="px-4 py-2.5 text-muted">{trade.tradeDate}</td>
      <td className="px-4 py-2.5 text-right">
        <button
          type="button"
          disabled={isPending}
          onClick={onDelete}
          aria-label={`Delete ${trade.side.toLowerCase()} of ${trade.symbol} on ${trade.tradeDate}`}
          className="rounded p-1.5 text-muted opacity-0 transition-opacity hover:bg-loss-soft hover:text-loss focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none group-hover:opacity-100 disabled:opacity-50"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
