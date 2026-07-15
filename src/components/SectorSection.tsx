"use client";

import { memo } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { PortfolioTable } from "@/components/PortfolioTable";
import { GainLoss } from "@/components/ui/GainLoss";
import { directionOf, formatCurrency, formatPercent } from "@/lib/format";
import type { SectorGroup } from "@/lib/types";

/**
 * One sector: a summary bar plus its holdings.
 *
 * The summary bar is the point of the whole grouping feature — it must answer
 * "how is Technology doing?" without the user adding up the rows themselves. So the
 * sector's Investment / Present Value / Gain-Loss sit in the header, and the header stays
 * readable when the section is collapsed.
 *
 * Collapsible because twenty rows across five sectors is a lot of vertical scroll; folding
 * away the sectors you're not looking at turns the page into a sector-level overview.
 */

interface SectorSectionProps {
  group: SectorGroup;
  isExpanded: boolean;
  onToggle: (sector: string) => void;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
}

export const SectorSection = memo(function SectorSection({
  group,
  isExpanded,
  onToggle,
  sorting,
  onSortingChange,
}: SectorSectionProps) {
  const direction = directionOf(group.gainLoss);
  const panelId = `sector-panel-${slug(group.sector)}`;

  return (
    <section className="overflow-hidden rounded-xl border border-border-base bg-surface shadow-sm">
      <h3>
        <button
          type="button"
          onClick={() => onToggle(group.sector)}
          aria-expanded={isExpanded}
          aria-controls={panelId}
          className={clsx(
            "flex w-full flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 text-left transition-colors",
            "hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
            // A hairline in the sector's colour — a peripheral cue for how it's doing,
            // readable even when you're not looking directly at the numbers.
            direction === "up"
              ? "border-l-4 border-l-gain"
              : direction === "down"
                ? "border-l-4 border-l-loss"
                : "border-l-4 border-l-border-strong",
          )}
        >
          {/* Sector name + holding count */}
          <span className="flex min-w-[190px] items-center gap-2">
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={clsx(
                "shrink-0 text-muted transition-transform duration-200",
                !isExpanded && "-rotate-90",
              )}
            />
            <span className="font-semibold">{group.sector}</span>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">
              {group.rows.length}
            </span>
          </span>

          {/* Subtotals — the reason this header exists */}
          <span className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Stat label="Investment" value={formatCurrency(group.investment)} />
            <Stat label="Present Value" value={formatCurrency(group.presentValue)} />

            <span className="flex flex-col">
              <span className="text-[11px] tracking-wide text-muted uppercase">Gain / Loss</span>
              <GainLoss value={group.gainLoss} percent={group.gainLossPercent} />
            </span>

            <Stat label="Weight" value={formatPercent(group.portfolioPercent)} />
          </span>
        </button>
      </h3>

      {/* Kept mounted-but-hidden rather than unmounted, so collapsing a section doesn't
          throw away its table state (sort position, flash refs) and re-mount on expand. */}
      <div id={panelId} hidden={!isExpanded}>
        <PortfolioTable
          rows={group.rows}
          sorting={sorting}
          onSortingChange={onSortingChange}
        />
      </div>
    </section>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[11px] tracking-wide text-muted uppercase">{label}</span>
      <span className="text-sm font-semibold tabular">{value}</span>
    </span>
  );
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
