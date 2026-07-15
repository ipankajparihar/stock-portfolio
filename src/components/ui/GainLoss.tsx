import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import clsx from "clsx";
import { directionOf, formatSignedCurrency, formatSignedPercent } from "@/lib/format";

/**
 * The single source of truth for how a gain/loss figure looks.
 *
 * Every green/red decision in the app routes through here, so a "gain" is the same colour
 * in a table cell, a sector subtotal, and a summary card. Duplicating this logic per
 * component is how dashboards end up with three subtly different greens.
 *
 * Colour is never the *only* signal: an arrow (↗ ↘) and an explicit +/- sign carry the
 * same information, so the table still reads correctly for red-green colour blindness —
 * which affects a meaningful share of any finance audience.
 */

interface GainLossProps {
  value: number | null;
  /** Optional % shown beneath/beside the rupee figure. */
  percent?: number | null;
  size?: "sm" | "md" | "lg";
  /** Render as a filled pill — used where the figure is the headline, not a table cell. */
  pill?: boolean;
  /** Hide the directional arrow (e.g. in dense table cells). */
  hideIcon?: boolean;
  className?: string;
}

export function GainLoss({
  value,
  percent,
  size = "sm",
  pill = false,
  hideIcon = false,
  className,
}: GainLossProps) {
  const direction = directionOf(value);

  const tone = {
    up: "text-gain",
    down: "text-loss",
    flat: "text-muted",
    unknown: "text-muted",
  }[direction];

  const pillTone = {
    up: "bg-gain-soft border-gain-border",
    down: "bg-loss-soft border-loss-border",
    flat: "bg-surface-muted border-border-base",
    unknown: "bg-surface-muted border-border-base",
  }[direction];

  const textSize = { sm: "text-sm", md: "text-base", lg: "text-2xl" }[size];
  const iconSize = { sm: 14, md: 16, lg: 22 }[size];

  const Icon =
    direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 font-semibold tabular",
        textSize,
        tone,
        pill && `rounded-lg border px-2.5 py-1 ${pillTone}`,
        className,
      )}
      // Screen readers get the direction as a word — they can't see the colour or arrow.
      aria-label={
        direction === "unknown"
          ? "Value unavailable"
          : `${direction === "up" ? "Gain" : direction === "down" ? "Loss" : "No change"} of ${formatSignedCurrency(value)}`
      }
    >
      {!hideIcon && direction !== "unknown" && (
        <Icon size={iconSize} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />
      )}

      <span>{formatSignedCurrency(value)}</span>

      {percent != null && (
        <span className={clsx("font-medium opacity-75", size === "lg" ? "text-base" : "text-xs")}>
          ({formatSignedPercent(percent)})
        </span>
      )}
    </span>
  );
}
