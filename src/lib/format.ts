/**
 * Display formatting.
 *
 * Every figure in this app is INR, so amounts use the Indian numbering system
 * (₹14,72,893 — lakhs/crores grouping, not ₹1,472,893). `en-IN` gets this right.
 *
 * Null is a first-class case throughout: a missing price must render as "—", never as
 * "₹0" or "NaN". In a financial table those would be read as real values.
 */

const EM_DASH = "—";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const currencyPrecise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const decimal = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("en-IN");

/** Whole rupees — for investments, present values, totals. */
export function formatCurrency(value: number | null | undefined): string {
  return isNum(value) ? currency.format(value) : EM_DASH;
}

/** Paise precision — for per-share prices, where 2dp actually matters. */
export function formatPrice(value: number | null | undefined): string {
  return isNum(value) ? currencyPrecise.format(value) : EM_DASH;
}

/** Signed rupees, e.g. "+₹24,565" / "-₹9,444" — the sign carries meaning here. */
export function formatSignedCurrency(value: number | null | undefined): string {
  if (!isNum(value)) return EM_DASH;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${currency.format(Math.abs(value))}`;
}

/** Signed percentage, e.g. "+9.38%". */
export function formatSignedPercent(value: number | null | undefined): string {
  if (!isNum(value)) return EM_DASH;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${decimal.format(Math.abs(value))}%`;
}

/**
 * Compact signed rupees for chart labels, e.g. "+₹35.3K" / "-₹1.2L".
 *
 * Chart plots are narrow — a full "-₹68,886" label on a short bar either overlaps the axis
 * labels or gets clipped, which is the classic chart-label failure. `en-IN` compact notation
 * gives the Indian lakh/crore scale (K → L → Cr) and roughly halves the label width.
 * The exact figure is always available in the tooltip and in the table below.
 */
const compactCurrency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCompactSignedCurrency(value: number | null | undefined): string {
  if (!isNum(value)) return EM_DASH;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${spaceUnits(compactCurrency.format(Math.abs(value)))}`;
}

const compactNumber = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const croreNumber = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/**
 * Market cap, in crore — "₹7,89,123 Cr".
 *
 * `Intl` compact notation would render this as "₹7.9LCr" (lakh-crore), which is both
 * unreadable and not how any Indian exchange or broker quotes a market cap. Crore is the
 * conventional unit, so state it explicitly.
 */
export function formatCrore(value: number | null | undefined): string {
  if (!isNum(value)) return EM_DASH;
  return `₹${croreNumber.format(value / 1e7)} Cr`;
}

/** Compact share counts — volume renders as "2.17 Cr", avg volume as "48.51 L". */
export function formatCompactNumber(value: number | null | undefined): string {
  return isNum(value) ? spaceUnits(compactNumber.format(value)) : EM_DASH;
}

/**
 * `en-IN` compact notation jams the unit against the digits ("1.24Cr", "48.51L"), which reads
 * as a typo. Insert the space it's missing.
 */
function spaceUnits(formatted: string): string {
  return formatted.replace(/(\d)([A-Za-z])/, "$1 $2");
}

/** Unsigned percentage, e.g. "29.48%" — for portfolio weights, which are never negative. */
export function formatPercent(value: number | null | undefined): string {
  return isNum(value) ? `${decimal.format(value)}%` : EM_DASH;
}

/** Plain 2dp number — for P/E, which has no unit. */
export function formatRatio(value: number | null | undefined): string {
  return isNum(value) ? decimal.format(value) : EM_DASH;
}

/** Share counts — always whole. */
export function formatQuantity(value: number | null | undefined): string {
  return isNum(value) ? integer.format(value) : EM_DASH;
}

/** Compact "12s ago" / "4m ago" for the freshness indicator. */
export function formatRelativeTime(epochMs: number | null | undefined): string {
  if (!isNum(epochMs)) return EM_DASH;

  const seconds = Math.max(0, Math.round((Date.now() - epochMs) / 1000));
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  return `${Math.floor(minutes / 60)}h ago`;
}

export function formatClockTime(epochMs: number | null | undefined): string {
  if (!isNum(epochMs)) return EM_DASH;
  return new Date(epochMs).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

/**
 * Yahoo's `marketState` enum → something a human can read.
 * (PRE/POST are the pre- and post-market sessions; POSTPOST is after they close.)
 */
export function formatMarketState(state: string | null | undefined): {
  label: string;
  live: boolean;
} {
  switch (state) {
    case "REGULAR":
      return { label: "Market open", live: true };
    case "PRE":
      return { label: "Pre-market", live: false };
    case "POST":
    case "POSTPOST":
      return { label: "Post-market", live: false };
    case "CLOSED":
      return { label: "Market closed", live: false };
    default:
      return { label: "Market status unknown", live: false };
  }
}

/** Narrows out null/undefined/NaN in one place, so callers don't each reinvent it. */
function isNum(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Semantic direction of a gain/loss figure. Drives every green/red decision in the UI. */
export type Direction = "up" | "down" | "flat" | "unknown";

export function directionOf(value: number | null | undefined): Direction {
  if (!isNum(value)) return "unknown";
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}
