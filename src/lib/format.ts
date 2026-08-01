/**
 * Display formatting.
 *
 * Most figures in this app are INR, so every currency formatter defaults to it and uses the
 * Indian numbering system (₹14,72,893 — lakhs/crores grouping, not ₹1,472,893). US holdings
 * pass `currency: "USD"`, which switches both the symbol and the grouping to `en-US`.
 *
 * Null is a first-class case throughout: a missing price must render as "—", never as
 * "₹0" or "NaN". In a financial table those would be read as real values.
 */

const EM_DASH = "—";

/** `en-IN` grouping for INR, `en-US` for everything else — each currency reads the way its market expects. */
function localeFor(currencyCode: string): string {
  return currencyCode === "INR" ? "en-IN" : "en-US";
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function currencyFormatter(
  currencyCode: string,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `${currencyCode}:${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(localeFor(currencyCode), {
      style: "currency",
      currency: currencyCode,
      ...options,
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

const decimal = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("en-IN");

/** Whole units — for investments, present values, totals. */
export function formatCurrency(value: number | null | undefined, currency = "INR"): string {
  return isNum(value)
    ? currencyFormatter(currency, { maximumFractionDigits: 0 }).format(value)
    : EM_DASH;
}

/** 2dp precision — for per-share prices, where cents/paise actually matter. */
export function formatPrice(value: number | null | undefined, currency = "INR"): string {
  return isNum(value)
    ? currencyFormatter(currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        value,
      )
    : EM_DASH;
}

/** Signed currency, e.g. "+₹24,565" / "-$9,444" — the sign carries meaning here. */
export function formatSignedCurrency(value: number | null | undefined, currency = "INR"): string {
  if (!isNum(value)) return EM_DASH;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${currencyFormatter(currency, { maximumFractionDigits: 0 }).format(Math.abs(value))}`;
}

/** Signed percentage, e.g. "+9.38%". */
export function formatSignedPercent(value: number | null | undefined): string {
  if (!isNum(value)) return EM_DASH;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${decimal.format(Math.abs(value))}%`;
}

/**
 * Compact signed currency for chart labels, e.g. "+₹35.3K" / "-$1.2M".
 *
 * Chart plots are narrow — a full "-₹68,886" label on a short bar either overlaps the axis
 * labels or gets clipped, which is the classic chart-label failure. Compact notation gives the
 * market's own scale (K → L → Cr for INR, K → M → B for USD) and roughly halves the label width.
 * The exact figure is always available in the tooltip and in the table.
 */
export function formatCompactSignedCurrency(
  value: number | null | undefined,
  currency = "INR",
): string {
  if (!isNum(value)) return EM_DASH;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const formatted = currencyFormatter(currency, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.abs(value));
  return `${sign}${spaceUnits(formatted)}`;
}

const compactNumber = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const croreNumber = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/**
 * Market cap, in crore — "₹7,89,123 Cr". INR only — the conventional Indian unit.
 *
 * `Intl` compact notation would render this as "₹7.9LCr" (lakh-crore), which is both
 * unreadable and not how any Indian exchange or broker quotes a market cap. Crore is the
 * conventional unit, so state it explicitly.
 */
export function formatCrore(value: number | null | undefined): string {
  if (!isNum(value)) return EM_DASH;
  return `₹${croreNumber.format(value / 1e7)} Cr`;
}

/**
 * Market cap for non-INR currencies — compact notation ("$2.8T", "$412.6B") is exactly how US
 * markets conventionally quote cap, unlike the INR case above.
 */
export function formatMarketCap(value: number | null | undefined, currency = "INR"): string {
  if (currency === "INR") return formatCrore(value);
  return isNum(value)
    ? spaceUnits(
        currencyFormatter(currency, { notation: "compact", maximumFractionDigits: 1 }).format(
          value,
        ),
      )
    : EM_DASH;
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
