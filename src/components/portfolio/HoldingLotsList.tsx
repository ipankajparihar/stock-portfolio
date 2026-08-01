"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Receipt, Trash2 } from "lucide-react";
import { deleteHoldingLot } from "@/app/actions/holdings";
import { formatPrice, formatQuantity } from "@/lib/format";
import type { HoldingLot } from "@/lib/types";

const MARKET_LABEL: Record<string, string> = { US: "United States", IN: "India" };

/** Every purchase lot exactly as recorded — the raw data `AddHoldingForm` writes. */
export function HoldingLotsList({
  lots,
  onAddClick,
}: {
  lots: HoldingLot[];
  onAddClick?: () => void;
}) {
  if (lots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center">
        <span className="mx-auto inline-flex size-10 items-center justify-center rounded-full bg-surface-muted text-muted">
          <Receipt size={18} aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm font-medium">No purchases recorded yet</p>
        <p className="mt-1 text-sm text-muted">Every purchase you add appears here.</p>
        {onAddClick && (
          <button
            type="button"
            onClick={onAddClick}
            className="mt-4 rounded-lg border border-border-base px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
          >
            Record your first purchase
          </button>
        )}
      </div>
    );
  }

  const symbolCount = new Set(lots.map((l) => `${l.symbol}:${l.exchange}`)).size;

  return (
    <div className="overflow-hidden rounded-xl border border-border-base bg-surface shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-border-base bg-surface-muted px-4 py-2.5 text-xs text-muted">
        <Receipt size={13} aria-hidden="true" />
        {lots.length} purchase{lots.length === 1 ? "" : "s"} across {symbolCount} symbol
        {symbolCount === 1 ? "" : "s"}
      </div>

      <div className="thin-scroll overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-base text-xs font-semibold text-muted-strong">
              <th className="px-4 py-2 text-left">Symbol</th>
              <th className="px-4 py-2 text-left">Market</th>
              <th className="px-4 py-2 text-right">Quantity</th>
              <th className="px-4 py-2 text-right">Price</th>
              <th className="px-4 py-2 text-left">Purchase date</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => (
              <LotRow key={lot.id} lot={lot} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LotRow({ lot }: { lot: HoldingLot }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onDelete() {
    startTransition(async () => {
      await deleteHoldingLot(lot.id);
      router.refresh();
    });
  }

  return (
    <tr className="group border-b border-border-base transition-colors last:border-0 hover:bg-surface-muted">
      <td className="px-4 py-2.5">
        <span className="font-medium">{lot.name}</span>
        <span className="ml-1.5 text-xs text-muted">{lot.symbol}</span>
      </td>
      <td className="px-4 py-2.5">
        <span className="rounded border border-border-base bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-muted-strong">
          {lot.exchange}
        </span>
        <span className="ml-1.5 text-xs text-muted">{MARKET_LABEL[lot.market] ?? lot.market}</span>
      </td>
      <td className="px-4 py-2.5 text-right tabular">{formatQuantity(lot.quantity)}</td>
      <td className="px-4 py-2.5 text-right tabular font-medium">
        {formatPrice(lot.purchasePrice, lot.currency)}
      </td>
      <td className="px-4 py-2.5 text-muted">{lot.purchaseDate}</td>
      <td className="px-4 py-2.5 text-right">
        <button
          type="button"
          disabled={isPending}
          onClick={onDelete}
          aria-label={`Delete purchase of ${lot.symbol} on ${lot.purchaseDate}`}
          className="rounded p-1.5 text-muted opacity-0 transition-opacity hover:bg-loss-soft hover:text-loss focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none group-hover:opacity-100 disabled:opacity-50"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
