/**
 * Core domain model for the portfolio dashboard.
 *
 * The pipeline is: Holding (static, from the sheet)
 *                → LiveQuote  (Yahoo: CMP)
 *                + Fundamentals (Google: P/E, latest earnings)
 *                → PortfolioRow (all derived metrics computed server-side)
 *                → SectorGroup (rows bucketed by sector + subtotals)
 */

/** Which national market a holding, watchlist entry, or movers list belongs to. */
export type Market = "US" | "IN";

/** A single *aggregated* position — one or more purchase lots collapsed to one row. */
export interface Holding {
  /** Stable id used as the React key and cache key: `${symbol}:${exchange}`. */
  id: string;
  /** Display name of the stock. */
  name: string;
  /** Base ticker, e.g. "HDFCBANK" or "AAPL". Provider-specific suffixes are added per provider. */
  symbol: string;
  /** Exchange the position is held on. */
  exchange: Exchange;
  /** Which national market this belongs to — drives currency formatting and grouping. */
  market: Market;
  /** ISO currency code the price/values are denominated in, e.g. "INR" or "USD". */
  currency: string;
  /** Sector bucket used for grouping and subtotals. */
  sector: string;
  /** Weighted-average purchase price per share across all lots. */
  purchasePrice: number;
  /** Total shares held, summed across all lots. */
  quantity: number;
}

export type Exchange = "NSE" | "BSE" | "NASDAQ" | "NYSE";

/** One manual buy exactly as entered by the user — the row stored in `holding_lot`. */
export interface HoldingLot {
  id: string;
  symbol: string;
  exchange: Exchange;
  market: Market;
  name: string;
  sector: string;
  quantity: number;
  purchasePrice: number;
  currency: string;
  /** ISO date string, e.g. "2026-01-15". */
  purchaseDate: string;
}

/** A saved watchlist entry — no position, just a symbol the user wants to track. */
export interface WatchlistEntry {
  id: string;
  symbol: string;
  exchange: Exchange;
  market: Market;
  name: string;
}

/** One autocomplete candidate from the company-name search box. */
export interface SymbolSearchResult {
  symbol: string;
  name: string;
  exchange: Exchange;
  market: Market;
  /** Null when Yahoo's search response didn't include a sector for this symbol. */
  sector: string | null;
}

/**
 * Filters for the stock screener. All optional — an unset bound means "no restriction on that
 * side of the range." `nearHigh`/`nearLow` are boolean presets (within 5% of the 52-week
 * extreme) rather than raw percentages, matching how screeners like Finviz surface this.
 */
export interface ScreenerFilters {
  priceMin?: number;
  priceMax?: number;
  changePercentMin?: number;
  changePercentMax?: number;
  peMin?: number;
  peMax?: number;
  volumeMin?: number;
  nearHigh?: boolean;
  nearLow?: boolean;
}

/** One screener result row — enough to display, compare, and add straight to a watchlist. */
export interface ScreenedStock {
  symbol: string;
  name: string;
  exchange: Exchange;
  market: Market;
  currency: string;
  price: number | null;
  changePercent: number | null;
  peRatio: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  /** % above(+)/below(-) the 52-week high — Yahoo computes this for us. */
  percentFromHigh: number | null;
  percentFromLow: number | null;
  volume: number | null;
}

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

  // --- Extras: all present on the same batched Yahoo quote, at no extra cost. ---
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  /** Trailing P/E, straight from Yahoo's quote — not the Google-scraped figure used elsewhere. */
  peRatio: number | null;
  volume: number | null;
  marketCap: number | null;
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

/**
 * One market's slice of a user's portfolio — its own sectors and totals.
 *
 * US and Indian holdings are denominated in different currencies, so a single blended grand
 * total across both would be meaningless. Each market gets its own subtotal instead; there is
 * no cross-market total anywhere in this app.
 */
export interface MarketGroup extends Totals {
  market: Market;
  currency: string;
  sectors: SectorGroup[];
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
  averageVolume: number | null;
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
  marketGroups: MarketGroup[];
  /** Epoch ms the prices here were assembled. */
  updatedAt: number;
  /**
   * Epoch ms the oldest fundamentals in this payload were scraped — i.e. the worst-case age
   * of the P/E and earnings columns. Null when the whole feed is unavailable.
   */
  fundamentalsUpdatedAt: number | null;
  /** Aggregate market state across quotes, e.g. "REGULAR" or "CLOSED". */
  marketState: string | null;
  quoteWarnings: string[];
  fundamentalsWarnings: string[];
}

// ---------------------------------------------------------------------------
// Public market overview — no auth required
// ---------------------------------------------------------------------------

/** A benchmark index quote, e.g. NIFTY 50 or the S&P 500. */
export interface IndexQuote {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

/** One row in a top-10 daily gainers/losers list. */
export interface MoverQuote {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  currency: string;
}

/** One market's slice of the public overview — indices plus its daily movers. */
export interface MarketSnapshot {
  market: Market;
  indices: IndexQuote[];
  gainers: MoverQuote[];
  losers: MoverQuote[];
}

/** The payload returned by GET /api/market. */
export interface MarketOverviewResponse {
  markets: MarketSnapshot[];
  /** Top cryptocurrencies by market cap — global and 24/7, so shown outside the US/India toggle. */
  crypto: IndexQuote[];
  /** Major commodity futures (gold, oil, …) — also global. */
  commodities: IndexQuote[];
  updatedAt: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Futures & options
// ---------------------------------------------------------------------------

/**
 * A continuous futures contract — the front-month ticker Yahoo quotes, not a specific expiry.
 * Yahoo's free API has no chain of dated contracts per instrument, unlike equity options below;
 * this is the honest ceiling of what's available without a licensed exchange feed.
 */
export interface FutureContract {
  symbol: string;
  name: string;
  /** Plain-language note on what the contract tracks, curated app-side rather than from Yahoo. */
  description: string;
  category: "index" | "commodity";
  price: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  currency: string;
}

/** One call or put contract at a given strike. */
export interface OptionContract {
  contractSymbol: string;
  strike: number;
  lastPrice: number | null;
  bid: number | null;
  ask: number | null;
  change: number | null;
  percentChange: number | null;
  volume: number | null;
  openInterest: number | null;
  impliedVolatility: number | null;
  inTheMoney: boolean;
}

/** A real options chain — calls and puts for one underlying, at one expiration. */
export interface OptionChainResponse {
  symbol: string;
  name: string;
  underlyingPrice: number | null;
  underlyingChangePercent: number | null;
  currency: string;
  /** Every expiration Yahoo lists, as ISO date strings — drives the date-picker. */
  expirationDates: string[];
  /** Which of `expirationDates` this chain's calls/puts belong to. */
  expiration: string;
  calls: OptionContract[];
  puts: OptionContract[];
}
