/**
 * Core domain model for the portfolio dashboard.
 *
 * The pipeline is: Holding (static, from the sheet)
 *                → LiveQuote  (Yahoo: CMP)
 *                + Fundamentals (Google: P/E, latest earnings)
 *                → PortfolioRow (all derived metrics computed server-side)
 *                → SectorGroup (rows bucketed by sector + subtotals)
 */

/** A single position as recorded in the portfolio sheet. Never changes at runtime. */
export interface Holding {
  /** Stable id used as the React key and cache key. */
  id: string;
  /** "Particulars" in the sheet — the display name of the stock. */
  name: string;
  /** Base ticker, e.g. "HDFCBANK". Provider-specific suffixes are added per provider. */
  symbol: string;
  /** Exchange the position is held on. Drives the NSE/BSE column. */
  exchange: Exchange;
  /** Sector bucket used for grouping and subtotals. */
  sector: string;
  /** Average purchase price per share, in INR. */
  purchasePrice: number;
  /** Number of shares held. */
  quantity: number;
}

export type Exchange = "NSE" | "BSE";

/** Real-time market data from Yahoo Finance. */
export interface LiveQuote {
  /** Current Market Price. */
  cmp: number;
  /** Absolute change on the day, in INR. */
  dayChange: number | null;
  /** Percentage change on the day. */
  dayChangePercent: number | null;
  currency: string;
  /** Epoch ms of the last trade Yahoo reported. */
  marketTime: number | null;
  /** e.g. "REGULAR", "CLOSED", "PRE" — used to tell the user if the market is open. */
  marketState: string | null;
}

/** Fundamentals scraped from Google Finance. */
export interface Fundamentals {
  /** Price-to-earnings ratio. */
  peRatio: number | null;
  /** Latest reported earnings per share, in INR. */
  latestEarnings: number | null;
  /**
   * Human-readable earnings event, e.g.
   * "released • EPS beat +2.54% • Revenue beat +0.32%" or "in 5 days".
   * Google surfaces this above the chart; it's a bonus over the raw EPS figure.
   */
  earningsEvent: string | null;

  // --- Extras, used on the stock detail page only ---
  /** Dividend yield as Google renders it, e.g. "1.59%". Display-only. */
  dividendYield: string | null;
  /** Most recent quarterly dividend per share, in INR. */
  quarterlyDividend: number | null;
  /** Ex-dividend date as Google renders it, e.g. "Jun 19, 2026". Display-only. */
  exDividendDate: string | null;
}

/**
 * Why a field might be missing or untrustworthy. Surfaced in the UI rather than
 * silently swallowed, because scraped data is expected to fail intermittently.
 */
export interface FieldStatus {
  /** Data was served from cache after a failed refresh — it's older than the TTL. */
  stale: boolean;
  /** The provider failed outright and no cached value exists. */
  failed: boolean;
  /** Operator-facing reason, shown in a tooltip. */
  message: string | null;
  /** Epoch ms the value was actually fetched. */
  fetchedAt: number | null;
}

/** A fully-enriched row: the sheet's data plus live data plus everything derived. */
export interface PortfolioRow extends Holding {
  // --- Live (Yahoo) ---
  cmp: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;

  // --- Fundamentals (Google) ---
  peRatio: number | null;
  latestEarnings: number | null;
  earningsEvent: string | null;

  // --- Derived ---
  /** purchasePrice × quantity */
  investment: number;
  /** cmp × quantity. Null when CMP is unavailable. */
  presentValue: number | null;
  /** presentValue − investment. Null when CMP is unavailable. */
  gainLoss: number | null;
  /** gainLoss as a % of investment. */
  gainLossPercent: number | null;
  /** This position's investment as a % of total portfolio investment. */
  portfolioPercent: number;

  // --- Provenance ---
  quoteStatus: FieldStatus;
  fundamentalsStatus: FieldStatus;
}

/** Aggregated totals — used for both sector subtotals and the portfolio grand total. */
export interface Totals {
  investment: number;
  presentValue: number;
  gainLoss: number;
  gainLossPercent: number;
  /** Share of the total portfolio investment. */
  portfolioPercent: number;
}

/** A sector bucket with its constituent rows and subtotals. */
export interface SectorGroup extends Totals {
  sector: string;
  rows: PortfolioRow[];
}

// ---------------------------------------------------------------------------
// Stock detail page
// ---------------------------------------------------------------------------

/** The selectable history windows on the detail chart. */
export type RangeKey = "1D" | "5D" | "1M" | "6M" | "1Y" | "5Y";

/** One point on the price history line. */
export interface ChartPoint {
  /** Epoch ms of the candle. */
  t: number;
  /** Closing price of the candle. */
  close: number;
}

/** A price history window, plus the summary stats derived from it. */
export interface PriceHistory {
  range: RangeKey;
  points: ChartPoint[];
  /**
   * The baseline the window is measured against — the previous close for 1D, or the first
   * point's price otherwise. The chart draws a reference line here so "up or down over this
   * window" is answerable without doing arithmetic.
   */
  baseline: number | null;
  /** Change across the window (last − baseline). */
  change: number | null;
  changePercent: number | null;
  /** Highest and lowest close within the window — used to scale the y-axis. */
  high: number | null;
  low: number | null;
}

/** Intraday detail Yahoo gives us beyond the bare CMP. */
export interface QuoteDetail extends LiveQuote {
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  averageVolume: number | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

/** Company background, from Yahoo's profile module. */
export interface CompanyProfile {
  name: string;
  sector: string | null;
  industry: string | null;
  website: string | null;
  employees: number | null;
  description: string | null;
}

/** What the holding is currently worth — only present when the stock is actually owned. */
export interface PositionSummary {
  purchasePrice: number;
  quantity: number;
  investment: number;
  presentValue: number | null;
  gainLoss: number | null;
  gainLossPercent: number | null;
  portfolioPercent: number;
}

/** The payload returned by GET /api/stock/[symbol]. */
export interface StockDetailResponse {
  symbol: string;
  name: string;
  exchange: Exchange;
  sector: string;

  quote: QuoteDetail | null;
  history: PriceHistory | null;
  fundamentals: Fundamentals | null;
  profile: CompanyProfile | null;
  /** Null when the symbol isn't one of our holdings. */
  position: PositionSummary | null;

  updatedAt: number;
  warnings: string[];
}

/** The complete API payload returned by GET /api/portfolio. */
export interface PortfolioResponse {
  sectors: SectorGroup[];
  totals: Totals;
  /** Epoch ms the *prices* here were assembled. Moves on every quote tick. */
  updatedAt: number;
  /**
   * Epoch ms the oldest fundamentals in this payload were scraped — i.e. the worst-case age
   * of the P/E and earnings columns. Null when the whole feed is unavailable.
   */
  fundamentalsUpdatedAt: number | null;
  /** Aggregate market state across quotes, e.g. "REGULAR" or "CLOSED". */
  marketState: string | null;
  /**
   * Provider-level problems worth telling the user about, split by the feed they came from.
   * Two lists rather than one because the two feeds refresh on different clocks: a quote tick
   * replaces `quoteWarnings` and must leave the fundamentals warnings — which it knows nothing
   * about — untouched. A single merged list makes that impossible to do correctly.
   *
   * Row-level issues live in each row's `quoteStatus` / `fundamentalsStatus`.
   */
  quoteWarnings: string[];
  fundamentalsWarnings: string[];
}

// ---------------------------------------------------------------------------
// The fast poll
// ---------------------------------------------------------------------------

/** The price-driven slice of a row — every field a quote tick is allowed to move. */
export interface QuoteTickRow {
  id: string;
  cmp: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
  presentValue: number | null;
  gainLoss: number | null;
  gainLossPercent: number | null;
  quoteStatus: FieldStatus;
}

/**
 * The payload returned by GET /api/portfolio/quotes — polled every ~15s.
 *
 * Deliberately *not* a whole `PortfolioResponse`. It omits everything a price move cannot
 * change — names, quantities, exchanges, sectors, P/E, earnings, portfolio weights — so the
 * live poll carries a fraction of the bytes, never re-scrapes Google, and gives the client a
 * patch it can splice into what it already holds instead of a wholesale replacement.
 */
export interface QuoteTick {
  rows: QuoteTickRow[];
  /** Sector subtotals, keyed by sector name: present value and gain/loss move with price. */
  sectorTotals: Record<string, Totals>;
  totals: Totals;
  updatedAt: number;
  marketState: string | null;
  /** Problems with the price feed only. Fundamentals aren't touched by this path. */
  warnings: string[];
}

/**
 * One frame pushed down the SSE stream.
 *
 * `nextTickAt` is the server telling the client when to expect the *next* frame. The client no
 * longer schedules anything, so it cannot work this out for itself — and it needs it, because
 * the status bar still draws a countdown ring. Without it a tab connecting midway through a
 * cycle would show a ring that empties several seconds before the data actually arrives.
 */
export interface StreamFrame<T> {
  data: T;
  /** Epoch ms the server expects to push the next frame. */
  nextTickAt: number;
}
