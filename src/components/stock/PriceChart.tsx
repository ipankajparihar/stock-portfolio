"use client";

import { memo, useCallback, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import clsx from "clsx";
import { directionOf, formatPrice } from "@/lib/format";
import type { ChartPoint, PriceHistory, RangeKey } from "@/lib/types";

/**
 * The price history chart.
 *
 * **Form:** trend over time → a line (area, for a single series). One series, so there is no
 * legend — the card title names it. The y-axis is *not* zero-based: a price chart anchored at
 * zero flattens every real move into a straight line near the top. That's the one legitimate
 * exception to "bars start at zero", and it only applies because this is a line, not a bar.
 *
 * **Baseline:** a solid hairline marks the window's starting price (previous close for 1D),
 * so "up or down over this window" is readable without arithmetic. Solid, not dashed —
 * a dashed rule reads as "projection" or "threshold" when it's neither.
 *
 * **Colour:** the line is green or red by the sign of the period change. That's a status
 * meaning (good/bad), not a series identity, and it never travels alone — the same sign is
 * spelled out as a labelled +/-% figure in the header above.
 *
 * **Interaction:** hovering moves a crosshair and lifts the hovered point to the parent, which
 * swaps the header price for the price at that moment — the behaviour every real finance app
 * has, and the reason a chart beats a table for "what happened at 2pm?".
 */

interface PriceChartProps {
  history: PriceHistory;
  range: RangeKey;
  isLoading: boolean;
  /** Lifted to the parent so the big header price tracks the cursor. */
  onHover: (point: ChartPoint | null) => void;
}

export const PriceChart = memo(function PriceChart({
  history,
  range,
  isLoading,
  onHover,
}: PriceChartProps) {
  const { points, baseline, change } = history;

  const direction = directionOf(change);
  const stroke = direction === "down" ? "var(--loss)" : "var(--gain)";

  // A unique gradient id per direction — two <linearGradient> elements sharing one id would
  // collide in the SVG defs and silently paint the wrong fill.
  const gradientId = `price-fill-${direction}`;

  /**
   * Pad the y-domain around the data's own range rather than letting Recharts pick.
   * The 8% padding keeps the line off the card edges; including the baseline in the extent
   * guarantees the reference line is actually inside the visible window (otherwise a window
   * that only moved in one direction would clip its own baseline out of view).
   */
  const domain = useMemo<[number, number]>(() => {
    const values = points.map((p) => p.close);
    if (baseline != null) values.push(baseline);

    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.08 || max * 0.02 || 1;

    return [min - pad, max + pad];
  }, [points, baseline]);

  const tickFormatter = useMemo(() => makeTickFormatter(range), [range]);

  // Recharts hands back the active *index*, not the datum, so resolve it against our own
  // array. That's also the safer direction — the index can't disagree with the data we drew.
  const handleMove = useCallback(
    (state: {
      // Recharts' own `TooltipIndex` widens to `string | null`, so accept both rather than
      // pinning to `number` — the coercion below narrows it back down safely.
      activeTooltipIndex?: number | string | null;
      isTooltipActive?: boolean;
    }) => {
      const index = Number(state?.activeTooltipIndex);

      if (!state?.isTooltipActive || !Number.isInteger(index)) {
        onHover(null);
        return;
      }

      onHover(points[index] ?? null);
    },
    [onHover, points],
  );

  const handleLeave = useCallback(() => onHover(null), [onHover]);

  if (points.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-lg border border-dashed border-border-strong text-sm text-muted">
        No price history available for this window.
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "transition-opacity duration-200",
        // Dim on range switch instead of unmounting to a skeleton — no layout jump.
        isLoading && "opacity-50",
      )}
    >
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Recessive grid: horizontal only (the y-value is what you read off it), solid hairline. */}
          <CartesianGrid
            horizontal
            vertical={false}
            stroke="var(--border)"
            strokeWidth={1}
          />

          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={tickFormatter}
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
          />

          <YAxis
            domain={domain}
            orientation="right"
            width={64}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatAxisPrice(v)}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
          />

          {/* The window's starting price. */}
          {baseline != null && (
            <ReferenceLine
              y={baseline}
              stroke="var(--border-strong)"
              strokeWidth={1}
              // Recharts renders ReferenceLine above the area by default; keep it quiet.
              ifOverflow="extendDomain"
            />
          )}

          <Tooltip
            content={<ChartTooltip range={range} />}
            // The crosshair. A vertical rule is the whole point of hovering a time series.
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
          />

          <Area
            // `linear`, never `monotone`. Spline interpolation invents a smooth curve between
            // closes — implying prices that were never traded, and rounding off the sharp
            // spikes that are precisely what you look at a price chart to see. On financial
            // data that isn't a style choice, it's a misrepresentation.
            type="linear"
            dataKey="close"
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            // Animating on every 15s poll would make the line visibly redraw itself.
            isAnimationActive={false}
            // A dot per point would be chaos at 250 points; show one only on hover.
            dot={false}
            activeDot={{
              r: 4,
              fill: stroke,
              // The 2px surface ring that separates an overlapping mark from what's beneath.
              stroke: "var(--surface)",
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

function ChartTooltip({
  active,
  payload,
  range,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  range?: RangeKey;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;

  return (
    <div className="rounded-lg border border-border-base bg-surface px-3 py-2 shadow-lg">
      <p className="text-sm font-semibold tabular">{formatPrice(point.close)}</p>
      <p className="text-xs text-muted">{formatTooltipTime(point.t, range ?? "1M")}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time formatting — the axis has to say something different per window
// ---------------------------------------------------------------------------

/**
 * Intraday windows want a clock; multi-year windows want a year. Showing "13 Jul" on every
 * tick of a 5Y chart, or a date on every tick of a 1D chart, is the usual way these get
 * unreadable.
 */
function makeTickFormatter(range: RangeKey): (t: number) => string {
  const date = new Date();

  switch (range) {
    case "1D":
      return (t) =>
        new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
    case "5D":
      return (t) =>
        new Date(t).toLocaleDateString("en-IN", { weekday: "short" });
    case "1M":
    case "6M":
      return (t) =>
        new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    case "1Y":
      return (t) => new Date(t).toLocaleDateString("en-IN", { month: "short" });
    case "5Y":
      return (t) => {
        const d = new Date(t);
        // Only the year matters over five years — but disambiguate the current year's months.
        return d.getFullYear() === date.getFullYear()
          ? d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
          : String(d.getFullYear());
      };
  }
}

function formatTooltipTime(t: number, range: RangeKey): string {
  const d = new Date(t);

  // Intraday points need the time of day; daily candles would just say "00:00".
  if (range === "1D" || range === "5D") {
    return d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Axis ticks are reference marks, not headline figures — keep them terse. */
function formatAxisPrice(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}
