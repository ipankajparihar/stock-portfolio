"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Receipt } from "lucide-react";
import clsx from "clsx";
import { GainLoss } from "@/components/ui/GainLoss";
import { formatCurrency, formatQuantity } from "@/lib/format";
import type { ClosedPosition, RealizedSummary } from "@/lib/types";

/**
 * Positions the user has sold out of, wholly or in part.
 *
 * Collapsed by default and hidden entirely until there is a sale to show: for someone who has only
 * ever bought, an empty "realized" panel is noise. The short/long-term split is surfaced because it
 * is the number that decides the tax bill, and it is invisible in a plain total.
 */
export function RealizedPanel({
  realized,
  closedPositions,
  currency,
}: {
  realized: RealizedSummary;
  closedPositions: ClosedPosition[];
  currency: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (realized.saleCount === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border-base bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-muted"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <Receipt size={15} className="text-muted" aria-hidden="true" />
          Realized P&amp;L
          <span className="font-normal text-muted">
            {realized.saleCount} sale{realized.saleCount === 1 ? "" : "s"}
          </span>
        </span>
        <GainLoss
          value={realized.realizedGain}
          percent={realized.realizedGainPercent}
          currency={currency}
          size="sm"
        />
      </button>

      <div hidden={!isOpen}>
        <div className="grid grid-cols-2 gap-px border-y border-border-base bg-border-base sm:grid-cols-4">
          <Stat label="Proceeds" value={formatCurrency(realized.proceeds, currency)} />
          <Stat label="Cost basis" value={formatCurrency(realized.costBasis, currency)} />
          <Stat
            label="Short-term"
            value={formatCurrency(realized.shortTermGain, currency)}
            tone={realized.shortTermGain}
          />
          <Stat
            label="Long-term"
            value={formatCurrency(realized.longTermGain, currency)}
            tone={realized.longTermGain}
          />
        </div>

        <div className="thin-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-base text-xs font-semibold text-muted-strong">
                <th className="px-4 py-2 text-left">Symbol</th>
                <th className="px-4 py-2 text-right">Qty sold</th>
                <th className="px-4 py-2 text-right">Proceeds</th>
                <th className="px-4 py-2 text-right">Cost basis</th>
                <th className="px-4 py-2 text-right">Realized</th>
                <th className="px-4 py-2 text-left">Last sale</th>
              </tr>
            </thead>
            <tbody>
              {closedPositions.map((position) => (
                <tr key={position.id} className="border-b border-border-base last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{position.name}</span>
                    <span className="ml-1.5 text-xs text-muted">{position.symbol}</span>
                    {!position.isFullyClosed && (
                      <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-xs text-muted">
                        partial
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {formatQuantity(position.quantitySold)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {formatCurrency(position.proceeds, position.currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular text-muted">
                    {formatCurrency(position.costBasis, position.currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <GainLoss
                      value={position.realizedGain}
                      percent={position.realizedGainPercent}
                      currency={position.currency}
                      size="sm"
                      hideIcon
                    />
                  </td>
                  <td className="px-4 py-2.5 text-muted">{position.lastSellDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="bg-surface px-4 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={clsx(
          "mt-0.5 text-sm font-semibold tabular",
          tone != null && tone > 0 && "text-gain",
          tone != null && tone < 0 && "text-loss",
        )}
      >
        {value}
      </p>
    </div>
  );
}
