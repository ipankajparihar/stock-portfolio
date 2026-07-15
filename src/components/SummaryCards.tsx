"use client";

import { memo } from "react";
import { Briefcase, IndianRupee, PieChart, TrendingUp } from "lucide-react";
import clsx from "clsx";
import { GainLoss } from "@/components/ui/GainLoss";
import { directionOf, formatCurrency, formatPercent } from "@/lib/format";
import type { SectorGroup, Totals } from "@/lib/types";

/**
 * The at-a-glance layer: the four numbers an investor wants before reading any table.
 *
 * Ordered as a narrative — what I put in → what it's worth now → what that gained/lost →
 * how it's spread. The gain/loss card is the emotional one, so it gets the colour
 * treatment and the largest type; the others stay neutral so they don't compete.
 *
 * Takes `totals` and `sectors` rather than the whole `PortfolioResponse` on purpose: the memo
 * below is only worth anything if its props stay identical when nothing it draws has moved,
 * and the payload root changes on every quote tick (`updatedAt`) whether or not a price did.
 */

interface SummaryCardsProps {
  totals: Totals;
  sectors: SectorGroup[];
}

export const SummaryCards = memo(function SummaryCards({ totals, sectors }: SummaryCardsProps) {
  const direction = directionOf(totals.gainLoss);

  const bestSector = [...sectors].sort((a, b) => b.gainLossPercent - a.gainLossPercent)[0];
  const worstSector = [...sectors].sort((a, b) => a.gainLossPercent - b.gainLossPercent)[0];

  return (
    <section
      aria-label="Portfolio summary"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <Card
        icon={<IndianRupee size={18} />}
        label="Total Investment"
        hint={`Across ${sectors.reduce((n, s) => n + s.rows.length, 0)} holdings`}
      >
        <p className="text-2xl font-semibold tabular">{formatCurrency(totals.investment)}</p>
      </Card>

      <Card
        icon={<Briefcase size={18} />}
        label="Present Value"
        hint="Live, from Yahoo Finance"
      >
        <p className="text-2xl font-semibold tabular">{formatCurrency(totals.presentValue)}</p>
      </Card>

      <Card
        icon={<TrendingUp size={18} />}
        label="Total Gain / Loss"
        hint={
          direction === "up"
            ? "Portfolio is in profit"
            : direction === "down"
              ? "Portfolio is down"
              : "Break-even"
        }
        // The one card that earns a tinted background — it's the headline metric.
        tone={direction}
      >
        <GainLoss value={totals.gainLoss} percent={totals.gainLossPercent} size="lg" />
      </Card>

      <Card icon={<PieChart size={18} />} label="Sector Spread" hint={`${sectors.length} sectors`}>
        <div className="space-y-1 pt-0.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-muted">Best</span>
            <span className="truncate font-medium">{bestSector?.sector ?? "—"}</span>
            <span className="shrink-0 font-semibold tabular text-gain">
              {formatPercent(bestSector?.gainLossPercent)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-muted">Worst</span>
            <span className="truncate font-medium">{worstSector?.sector ?? "—"}</span>
            <span className="shrink-0 font-semibold tabular text-loss">
              {formatPercent(worstSector?.gainLossPercent)}
            </span>
          </div>
        </div>
      </Card>
    </section>
  );
});

interface CardProps {
  icon: React.ReactNode;
  label: string;
  hint: string;
  tone?: "up" | "down" | "flat" | "unknown";
  children: React.ReactNode;
}

function Card({ icon, label, hint, tone, children }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-xl border p-4 shadow-sm transition-colors",
        tone === "up"
          ? "border-gain-border bg-gain-soft"
          : tone === "down"
            ? "border-loss-border bg-loss-soft"
            : "border-border-base bg-surface",
      )}
    >
      <div className="flex items-center gap-2 text-muted">
        <span aria-hidden="true">{icon}</span>
        <h2 className="text-xs font-medium tracking-wide uppercase">{label}</h2>
      </div>

      <div className="mt-2">{children}</div>

      <p className="mt-1.5 text-xs text-muted">{hint}</p>
    </div>
  );
}
