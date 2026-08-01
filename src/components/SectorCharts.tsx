"use client";

import { memo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { sectorColorVar } from "@/lib/chart-colors";
import {
  formatCompactSignedCurrency,
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  formatSignedPercent,
} from "@/lib/format";
import type { SectorGroup } from "@/lib/types";

/**
 * Two sector views, each matched to the job its data actually does.
 *
 * **Allocation is part-to-whole** → a single horizontal stacked bar, not a pie or donut.
 * A donut is only defensible for a glanceable split of very different magnitudes; these
 * sector weights are close together (29% / 26% / 20% / 14% / 12%), and comparing similar
 * angles is precisely what a pie is worst at. A stacked bar compares them on one shared
 * length axis, and long names like "Power & Infrastructure" get room to breathe.
 *
 * **Gain/loss is polarity** (above/below zero) → a diverging bar on a single axis, anchored
 * to a zero reference line, so "which sectors are underwater" is answerable at a glance.
 *
 * Colour rules, both charts:
 *  - Sector identity uses the validated categorical palette (never green/red — those mean
 *    gain/loss here, and a status colour must not impersonate a series).
 *  - The gain/loss chart *does* use gain/loss colours, because there the colour genuinely
 *    encodes good/bad — and every bar is direct-labeled with a signed value, so the meaning
 *    survives without colour.
 */

interface SectorChartsProps {
  sectors: SectorGroup[];
  currency: string;
}

export const SectorCharts = memo(function SectorCharts({ sectors, currency }: SectorChartsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <AllocationBar sectors={sectors} />
      <GainLossBar sectors={sectors} currency={currency} />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Allocation — part-to-whole
// ---------------------------------------------------------------------------

/**
 * A single stacked bar. Deliberately plain CSS rather than a chart library: one stacked bar
 * doesn't need an SVG runtime, and hand-rolling it gives exact control over the 2px surface
 * gaps between segments (a gap, not a border — borders on adjacent fills muddy the colours).
 */
function AllocationBar({ sectors }: { sectors: SectorGroup[] }) {
  const total = sectors.reduce((sum, s) => sum + s.investment, 0);

  return (
    <figure className="rounded-xl border border-border-base bg-surface p-4 shadow-sm">
      <figcaption className="mb-3">
        <h3 className="text-sm font-semibold">Allocation by Sector</h3>
        <p className="text-xs text-muted">Share of total invested capital</p>
      </figcaption>

      {/* The bar. `gap-0.5` is the 2px surface gap between segments. */}
      <div
        className="flex h-9 w-full gap-0.5 overflow-hidden rounded-lg"
        role="img"
        aria-label={`Sector allocation: ${sectors
          .map((s) => `${s.sector} ${formatPercent(s.portfolioPercent)}`)
          .join(", ")}`}
      >
        {sectors.map((sector) => {
          const share = total === 0 ? 0 : (sector.investment / total) * 100;

          return (
            <div
              key={sector.sector}
              className="group relative flex items-center justify-center first:rounded-l-lg last:rounded-r-lg"
              style={{ width: `${share}%`, backgroundColor: sectorColorVar(sector.sector) }}
              title={`${sector.sector} · ${formatPercent(sector.portfolioPercent)} · ${formatCurrency(sector.investment)}`}
            >
              {/* Only label in-segment when it actually fits — a clipped label is worse than
                  none. A share threshold alone isn't enough: 13% of a 350px phone bar is
                  ~45px, too narrow for "13.58%". So labels are also suppressed below `sm`,
                  where the legend carries every value anyway. */}
              {share > 12 && (
                <span className="hidden px-1 text-xs font-semibold text-white tabular drop-shadow-sm sm:inline">
                  {formatPercent(sector.portfolioPercent)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* The legend doubles as the relief for the light-mode contrast WARN: every segment's
          identity and value is readable as text, never colour-alone. */}
      <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {sectors.map((sector) => (
          <li key={sector.sector} className="flex items-center gap-2 text-xs">
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: sectorColorVar(sector.sector) }}
              aria-hidden="true"
            />
            <span className="truncate text-muted-strong">{sector.sector}</span>
            <span className="ml-auto shrink-0 font-semibold tabular">
              {formatPercent(sector.portfolioPercent)}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Gain / loss — polarity
// ---------------------------------------------------------------------------

interface GainLossDatum {
  sector: string;
  gainLoss: number;
  gainLossPercent: number;
  investment: number;
  presentValue: number;
}

function GainLossBar({ sectors, currency }: { sectors: SectorGroup[]; currency: string }) {
  // Sorted worst → best so the eye travels down a monotonic ramp rather than a jumble.
  const data: GainLossDatum[] = [...sectors]
    .sort((a, b) => a.gainLoss - b.gainLoss)
    .map((s) => ({
      sector: s.sector,
      gainLoss: s.gainLoss,
      gainLossPercent: s.gainLossPercent,
      investment: s.investment,
      presentValue: s.presentValue,
    }));

  // Symmetric domain about zero, so a ₹1L gain and a ₹1L loss draw the same length —
  // an asymmetric domain would visually exaggerate whichever side is larger.
  //
  // The 1.9× headroom is load-bearing, not cosmetic. Value labels sit *outside* the bar ends,
  // and the longest bar is by definition at the domain edge — so the domain has to reserve
  // room for its label. Sized for the worst case (a ~390px phone, where the plot is only
  // ~240px wide): the longest bar takes ~53% of a half-axis, leaving enough for a compact
  // label to clear the sector names on the negative side.
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.gainLoss)), 1);
  const domain: [number, number] = [-maxAbs * 1.9, maxAbs * 1.9];

  return (
    <figure className="rounded-xl border border-border-base bg-surface p-4 shadow-sm">
      <figcaption className="mb-3">
        <h3 className="text-sm font-semibold">Gain / Loss by Sector</h3>
        <p className="text-xs text-muted">Present value less invested capital</p>
      </figcaption>

      {/* Height covers the plot AND the axis band, so the card never grows a nested scrollbar. */}
      <ResponsiveContainer width="100%" height={Math.max(150, data.length * 34 + 20)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }}>
          <XAxis type="number" domain={domain} hide />
          <YAxis
            type="category"
            dataKey="sector"
            width={104}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-strong)", fontSize: 10 }}
          />

          {/* The zero baseline — the whole point of a diverging chart. Solid hairline. */}
          <ReferenceLine x={0} stroke="var(--border-strong)" strokeWidth={1} />

          <Tooltip
            cursor={{ fill: "var(--surface-muted)" }}
            content={<ChartTooltip currency={currency} />}
          />

          <Bar dataKey="gainLoss" radius={4} barSize={16} isAnimationActive={false}>
            {data.map((d) => (
              <Cell
                key={d.sector}
                fill={d.gainLoss >= 0 ? "var(--gain)" : "var(--loss)"}
              />
            ))}

            {/* Direct labels: colour is never the only carrier of sign — the +/- is right there.
                Compact notation ("-₹68.9K") keeps the label short enough to sit outside the
                bar end without colliding with the sector names on a narrow viewport; the exact
                figure lives in the tooltip and the table.
                Recharts hands the formatter a loose `RenderableText`, so coerce rather than
                assume a number — a non-numeric value renders as an em dash, never "NaN". */}
            <LabelList
              dataKey="gainLoss"
              position="right"
              formatter={(value: unknown) =>
                typeof value === "number" ? formatCompactSignedCurrency(value, currency) : "—"
              }
              style={{ fill: "var(--muted-strong)", fontSize: 10, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Themed tooltip — Recharts' default is a white box that's unreadable in dark mode. */
function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: { payload: GainLossDatum }[];
  currency: string;
}) {
  if (!active || !payload?.length) return null;

  const d = payload[0].payload;

  return (
    <div className="rounded-lg border border-border-base bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{d.sector}</p>

      <dl className="space-y-0.5 text-muted">
        <Row label="Invested" value={formatCurrency(d.investment, currency)} />
        <Row label="Present" value={formatCurrency(d.presentValue, currency)} />
        <Row
          label="Gain / Loss"
          value={`${formatSignedCurrency(d.gainLoss, currency)} (${formatSignedPercent(d.gainLossPercent)})`}
          tone={d.gainLoss >= 0 ? "gain" : "loss"}
        />
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "gain" | "loss";
}) {
  return (
    <div className="flex justify-between gap-6">
      <dt>{label}</dt>
      <dd
        className={
          tone === "gain"
            ? "font-semibold text-gain tabular"
            : tone === "loss"
              ? "font-semibold text-loss tabular"
              : "font-medium text-foreground tabular"
        }
      >
        {value}
      </dd>
    </div>
  );
}
