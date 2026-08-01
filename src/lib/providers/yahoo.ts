import YahooFinance from "yahoo-finance2";
import type {
  ChartPoint,
  CompanyProfile,
  Exchange,
  FutureContract,
  IndexQuote,
  LiveQuote,
  Market,
  MoverQuote,
  OptionChainResponse,
  OptionContract,
  PriceHistory,
  QuoteDetail,
  RangeKey,
  ScreenedStock,
  SymbolSearchResult,
} from "@/lib/types";

/**
 * Yahoo Finance — source of the Current Market Price (CMP).
 *
 * ## On the lack of an official API
 * Yahoo retired its public quote API years ago; there is no documented, supported,
 * key-based endpoint. `yahoo-finance2` wraps the same undocumented JSON endpoints the
 * Yahoo web app calls, handling the cookie/crumb auth dance for us. That makes it the
 * most reliable option available, but it is explicitly *unofficial*:
 *
 *   - Yahoo can change or gate these endpoints without notice.
 *   - Sustained polling can get an IP soft-blocked.
 *   - The data is "as-is" and carries no accuracy guarantee (see DISCLAIMER in README).
 *
 * We mitigate by (a) batching every symbol into a single upstream request, and
 * (b) serving through the TTL cache so the poll interval never maps 1:1 to upstream calls.
 * This module only ever runs on the server.
 */

// `suppressNotices` silences the library's console survey/ripHistorical banners.
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/**
 * Yahoo addresses Indian equities as `SYMBOL.NS` (NSE) / `SYMBOL.BO` (BSE).
 * US equities (NASDAQ/NYSE) are addressed by their bare ticker — no suffix.
 */
export function toYahooSymbol(symbol: string, exchange: Exchange): string {
  if (exchange === "NASDAQ" || exchange === "NYSE") return symbol;
  return `${symbol}.${exchange === "BSE" ? "BO" : "NS"}`;
}

/**
 * Fetch quotes for many symbols in ONE upstream request.
 *
 * Batching is the single most important rate-limit mitigation here: polling 20 rows
 * every 15s is 1 request per cycle, not 20. Returns a map keyed by the *base* symbol
 * (e.g. "HDFCBANK") so callers don't deal with Yahoo's suffixes.
 *
 * Individual symbols Yahoo doesn't recognise are simply absent from the map; the caller
 * decides how to present that. A total failure throws, and the cache layer above turns
 * that into stale-but-usable data where possible.
 */
export async function fetchQuotes(
  holdings: { symbol: string; exchange: Exchange }[],
): Promise<Map<string, LiveQuote>> {
  if (holdings.length === 0) return new Map();

  const yahooSymbols = holdings.map((h) => toYahooSymbol(h.symbol, h.exchange));

  const results = await yf.quote(yahooSymbols);
  // The library returns a single object when given one symbol, an array otherwise.
  const list = Array.isArray(results) ? results : [results];

  const map = new Map<string, LiveQuote>();

  for (const q of list) {
    if (!q?.symbol) continue;

    const price = q.regularMarketPrice;
    // A quote with no price is useless to us — treat it as missing rather than
    // letting `undefined` flow downstream into NaN arithmetic.
    if (typeof price !== "number" || !Number.isFinite(price)) continue;

    // Strip the exchange suffix to recover the base symbol we were asked about.
    const base = q.symbol.replace(/\.(NS|BO)$/i, "");

    map.set(base, {
      cmp: price,
      dayChange: numberOrNull(q.regularMarketChange),
      dayChangePercent: numberOrNull(q.regularMarketChangePercent),
      currency: q.currency ?? "INR",
      // Yahoo reports seconds in some paths and a Date in others; normalise to epoch ms.
      marketTime: toEpochMs(q.regularMarketTime),
      marketState: q.marketState ?? null,

      previousClose: numberOrNull(q.regularMarketPreviousClose),
      open: numberOrNull(q.regularMarketOpen),
      dayHigh: numberOrNull(q.regularMarketDayHigh),
      dayLow: numberOrNull(q.regularMarketDayLow),
      fiftyTwoWeekHigh: numberOrNull(q.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: numberOrNull(q.fiftyTwoWeekLow),
      peRatio: numberOrNull(q.trailingPE),
      volume: numberOrNull(q.regularMarketVolume),
      marketCap: numberOrNull(q.marketCap),
    });
  }

  return map;
}

// ---------------------------------------------------------------------------
// Stock detail page
// ---------------------------------------------------------------------------

/**
 * Each range picks a candle interval that keeps the line readable.
 *
 * The interval is the whole trick: a 5-year window at 1-day granularity is ~1,250 points
 * drawn into ~600px — more points than pixels, so the extra detail is invisible noise that
 * only costs payload and render time. Coarser candles over longer windows keep every range
 * at roughly 50–400 points.
 */
const RANGE_CONFIG: Record<RangeKey, { days: number; interval: "5m" | "15m" | "1d" | "1wk" }> = {
  "1D": { days: 1, interval: "5m" },
  "5D": { days: 5, interval: "15m" },
  "1M": { days: 31, interval: "1d" },
  "6M": { days: 183, interval: "1d" },
  "1Y": { days: 365, interval: "1d" },
  "5Y": { days: 1826, interval: "1wk" },
};

/** Fetch the price history for one window. */
export async function fetchHistory(
  symbol: string,
  exchange: Exchange,
  range: RangeKey,
): Promise<PriceHistory> {
  const { days, interval } = RANGE_CONFIG[range];

  // Markets close over weekends and holidays, so a "1 day" window asked for literally can
  // land entirely inside a gap and return nothing. Over-fetch, then trim to the last session.
  const lookbackDays = range === "1D" ? 5 : range === "5D" ? 10 : days;

  const result = await yfChart(symbol, exchange, lookbackDays, interval);

  let points: ChartPoint[] = (result.quotes ?? [])
    .filter((q) => q.date instanceof Date && typeof q.close === "number" && Number.isFinite(q.close))
    .map((q) => ({ t: (q.date as Date).getTime(), close: q.close as number }));

  // For the intraday ranges, keep only the most recent session(s) — otherwise the over-fetch
  // above would draw several days onto a chart labelled "1D".
  if (range === "1D") points = lastSessions(points, 1);
  if (range === "5D") points = lastSessions(points, 5);

  if (points.length === 0) {
    return { range, points: [], baseline: null, change: null, changePercent: null, high: null, low: null };
  }

  const closes = points.map((p) => p.close);
  const last = closes[closes.length - 1];

  // 1D is conventionally measured against the *previous close*, not the first tick of the day
  // — otherwise an opening gap silently disappears from the reported change.
  const baseline =
    range === "1D"
      ? (numberOrNull(result.meta?.chartPreviousClose) ?? closes[0])
      : closes[0];

  const change = last - baseline;

  return {
    range,
    points,
    baseline,
    change,
    changePercent: baseline === 0 ? null : (change / baseline) * 100,
    high: Math.max(...closes),
    low: Math.min(...closes),
  };
}

/** Group points by calendar day and keep the last `n` days that actually traded. */
function lastSessions(points: ChartPoint[], n: number): ChartPoint[] {
  const byDay = new Map<string, ChartPoint[]>();

  for (const point of points) {
    const day = new Date(point.t).toISOString().slice(0, 10);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(point);
    else byDay.set(day, [point]);
  }

  const days = [...byDay.keys()].sort().slice(-n);
  return days.flatMap((day) => byDay.get(day) ?? []);
}

/** The extended quote shown in the detail page's stat grid. */
export async function fetchQuoteDetail(
  symbol: string,
  exchange: Exchange,
): Promise<QuoteDetail> {
  const q = await yf.quote(toYahooSymbol(symbol, exchange));

  const price = q?.regularMarketPrice;
  if (typeof price !== "number" || !Number.isFinite(price)) {
    throw new Error(`Yahoo has no quote for ${symbol}`);
  }

  return {
    cmp: price,
    dayChange: numberOrNull(q.regularMarketChange),
    dayChangePercent: numberOrNull(q.regularMarketChangePercent),
    currency: q.currency ?? "INR",
    marketTime: toEpochMs(q.regularMarketTime),
    marketState: q.marketState ?? null,

    previousClose: numberOrNull(q.regularMarketPreviousClose),
    open: numberOrNull(q.regularMarketOpen),
    dayHigh: numberOrNull(q.regularMarketDayHigh),
    dayLow: numberOrNull(q.regularMarketDayLow),
    peRatio: numberOrNull(q.trailingPE),
    volume: numberOrNull(q.regularMarketVolume),
    averageVolume: numberOrNull(q.averageDailyVolume3Month),
    marketCap: numberOrNull(q.marketCap),
    fiftyTwoWeekHigh: numberOrNull(q.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: numberOrNull(q.fiftyTwoWeekLow),
  };
}

/** Company background. Cached hard — this changes on the order of years, not seconds. */
export async function fetchProfile(
  symbol: string,
  exchange: Exchange,
  fallbackName: string,
): Promise<CompanyProfile> {
  const summary = await yf.quoteSummary(toYahooSymbol(symbol, exchange), {
    modules: ["summaryProfile", "price"],
  });

  const profile = summary.summaryProfile;

  return {
    name: summary.price?.longName ?? summary.price?.shortName ?? fallbackName,
    sector: profile?.sector ?? null,
    industry: profile?.industry ?? null,
    website: profile?.website ?? null,
    employees: numberOrNull(profile?.fullTimeEmployees),
    description: profile?.longBusinessSummary ?? null,
  };
}

function yfChart(
  symbol: string,
  exchange: Exchange,
  lookbackDays: number,
  interval: "5m" | "15m" | "1d" | "1wk",
) {
  return yf.chart(toYahooSymbol(symbol, exchange), {
    period1: new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000),
    interval,
  });
}

// ---------------------------------------------------------------------------
// Public market overview
// ---------------------------------------------------------------------------

/** Benchmark indices shown on the public landing page, per market. */
const INDEX_SYMBOLS: Record<Market, { symbol: string; name: string }[]> = {
  US: [
    { symbol: "^GSPC", name: "S&P 500" },
    { symbol: "^DJI", name: "Dow Jones" },
    { symbol: "^IXIC", name: "Nasdaq Composite" },
  ],
  IN: [
    { symbol: "^NSEI", name: "Nifty 50" },
    { symbol: "^BSESN", name: "BSE Sensex" },
  ],
};

/** Top cryptocurrencies by market cap. Trade 24/7, so unlike equities there's no "market" split. */
const CRYPTO_SYMBOLS = [
  { symbol: "BTC-USD", name: "Bitcoin" },
  { symbol: "ETH-USD", name: "Ethereum" },
  { symbol: "BNB-USD", name: "BNB" },
  { symbol: "SOL-USD", name: "Solana" },
  { symbol: "XRP-USD", name: "XRP" },
  { symbol: "DOGE-USD", name: "Dogecoin" },
];

/**
 * Major commodity futures — also global, so shown independently of the US/India toggle.
 *
 * `description` is app-curated copy, not something Yahoo returns: a bare ticker like `HG=F`
 * teaches a newcomer nothing, so it travels with the contract the same way `category` does.
 * Keeping it here means adding a contract is a one-line change in one file.
 */
const COMMODITY_SYMBOLS = [
  { symbol: "GC=F", name: "Gold", description: "Gold, per troy ounce" },
  { symbol: "SI=F", name: "Silver", description: "Silver, per troy ounce" },
  { symbol: "CL=F", name: "Crude Oil (WTI)", description: "US crude oil, per barrel" },
  { symbol: "NG=F", name: "Natural Gas", description: "Natural gas, per million BTU" },
  { symbol: "HG=F", name: "Copper", description: "Copper, per pound" },
];

/**
 * A curated universe of large, liquid NSE-listed stocks (roughly the Nifty 50).
 *
 * Yahoo's `screener` module's predefined scrIds (`day_gainers`, `day_losers`, `most_actives`)
 * do **not** actually respect the `region` parameter for India — verified empirically: passing
 * `region: "IN"` returns the identical US result set as `region: "US"`. The documented example
 * of regional screening only holds for a few markets (GB, DE, …); India isn't one of them.
 *
 * There's no reliable server-side "give me Indian gainers" query available through this
 * library, so instead this fetches live quotes for a fixed, known-Indian symbol list and
 * derives gainers/losers/screening ourselves — the same technique `fetchQuotes` already uses
 * for portfolio holdings, just over a broader, curated set rather than what one user owns.
 */
const NSE_UNIVERSE = [
  "RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY", "HINDUNILVR", "ITC", "SBIN",
  "BHARTIARTL", "BAJFINANCE", "KOTAKBANK", "LT", "AXISBANK", "ASIANPAINT", "MARUTI",
  "SUNPHARMA", "TITAN", "ULTRACEMCO", "WIPRO", "NESTLEIND", "HCLTECH", "M&M",
  "BAJAJFINSV", "ADANIENT", "ADANIPORTS", "ONGC", "NTPC", "POWERGRID", "TATASTEEL",
  "TATAMOTORS", "JSWSTEEL", "COALINDIA", "GRASIM", "HINDALCO", "DRREDDY", "CIPLA",
  "EICHERMOT", "BRITANNIA", "DIVISLAB", "APOLLOHOSP", "BAJAJ-AUTO", "HEROMOTOCO",
  "INDUSINDBK", "SBILIFE", "HDFCLIFE", "TECHM", "UPL", "BPCL", "SHREECEM", "DMART",
];

/** Fetches live quotes for a fixed NSE symbol list, all fields fully populated. */
async function fetchNseUniverseQuotes() {
  const results = await yf.quote(NSE_UNIVERSE.map((s) => `${s}.NS`));
  return Array.isArray(results) ? results : [results];
}

/** Batches a quote lookup for a fixed symbol list into the `IndexQuote` shape. */
async function fetchQuoteList(defs: { symbol: string; name: string }[]): Promise<IndexQuote[]> {
  const results = await yf.quote(defs.map((d) => d.symbol));
  const list = Array.isArray(results) ? results : [results];
  const bySymbol = new Map(list.map((q) => [q.symbol, q]));

  return defs.map((def) => {
    const q = bySymbol.get(def.symbol);
    return {
      symbol: def.symbol,
      name: def.name,
      price: numberOrNull(q?.regularMarketPrice),
      change: numberOrNull(q?.regularMarketChange),
      changePercent: numberOrNull(q?.regularMarketChangePercent),
    };
  });
}

export function fetchIndexQuotes(market: Market): Promise<IndexQuote[]> {
  return fetchQuoteList(INDEX_SYMBOLS[market]);
}

export function fetchCryptoQuotes(): Promise<IndexQuote[]> {
  return fetchQuoteList(CRYPTO_SYMBOLS);
}

export function fetchCommodityQuotes(): Promise<IndexQuote[]> {
  return fetchQuoteList(COMMODITY_SYMBOLS);
}

/**
 * Top daily gainers/losers for a market.
 *
 * US: via the `screener` module — `screener({ scrIds: "day_gainers" | "day_losers" })` is the
 * documented replacement for the deprecated `dailyGainers`/`dailyLosers` functions, and this
 * canned screen genuinely reflects the US market.
 *
 * India: `screener`'s region param doesn't work for IN (see `NSE_UNIVERSE` above), so this
 * instead quotes the curated NSE list and sorts by today's change itself.
 */
export async function fetchMovers(
  market: Market,
  direction: "gainers" | "losers",
): Promise<MoverQuote[]> {
  if (market === "IN") {
    const quotes = await fetchNseUniverseQuotes();
    const sorted = quotes
      .filter((q) => typeof q.regularMarketPrice === "number" && typeof q.regularMarketChangePercent === "number")
      .sort((a, b) =>
        direction === "gainers"
          ? (b.regularMarketChangePercent ?? 0) - (a.regularMarketChangePercent ?? 0)
          : (a.regularMarketChangePercent ?? 0) - (b.regularMarketChangePercent ?? 0),
      )
      .slice(0, 10);

    return sorted.map((q) => ({
      symbol: q.symbol.replace(/\.NS$/i, ""),
      name: q.longName ?? q.shortName ?? q.symbol,
      price: numberOrNull(q.regularMarketPrice),
      changePercent: numberOrNull(q.regularMarketChangePercent),
      currency: q.currency ?? "INR",
    }));
  }

  const result = await yf.screener({
    scrIds: direction === "gainers" ? "day_gainers" : "day_losers",
    region: "US",
    count: 10,
  });

  return result.quotes
    .filter((q) => typeof q.regularMarketPrice === "number")
    .map((q) => ({
      symbol: q.symbol,
      name: q.shortName ?? q.symbol,
      price: numberOrNull(q.regularMarketPrice),
      changePercent: numberOrNull(q.regularMarketChangePercent),
      currency: q.currency ?? "USD",
    }));
}

// ---------------------------------------------------------------------------
// Stock screener — the watchlist's "find stocks by filter" tool
// ---------------------------------------------------------------------------

/** The subset of fields present on both Yahoo's screener quotes and its plain quote objects. */
interface QuoteLike {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  trailingPE?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHighChangePercent?: number;
  fiftyTwoWeekLowChangePercent?: number;
  regularMarketVolume?: number;
  currency?: string;
  exchange?: string;
}

function toScreenedStock(q: QuoteLike, exchange: Exchange, market: Market): ScreenedStock {
  return {
    symbol: q.symbol.replace(/\.NS$/i, ""),
    name: q.longName ?? q.shortName ?? q.symbol,
    exchange,
    market,
    currency: q.currency ?? (market === "IN" ? "INR" : "USD"),
    price: numberOrNull(q.regularMarketPrice),
    changePercent: numberOrNull(q.regularMarketChangePercent),
    peRatio: numberOrNull(q.trailingPE),
    fiftyTwoWeekHigh: numberOrNull(q.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: numberOrNull(q.fiftyTwoWeekLow),
    // Unlike `regularMarketChangePercent` (already whole-percent, e.g. 30.56 = 30.56%), these
    // two fields come back as fractions (e.g. -0.1886 = -18.86%) — scale them to match.
    percentFromHigh: toPercent(q.fiftyTwoWeekHighChangePercent),
    percentFromLow: toPercent(q.fiftyTwoWeekLowChangePercent),
    volume: numberOrNull(q.regularMarketVolume),
  };
}

/**
 * The screener's candidate universe for a market — unfiltered. Filters are applied afterward,
 * in `screener-service.ts`, over this same cached pool, so different users screening with
 * different criteria never cost a second upstream fetch.
 *
 * US: pools three canned screens (gainers, losers, most active) for breadth beyond just the
 * top 10 movers, de-duplicated by symbol. India: the curated NSE list, for the same region
 * limitation `fetchMovers` works around above.
 */
export async function fetchScreenerCandidates(market: Market): Promise<ScreenedStock[]> {
  if (market === "IN") {
    const quotes = await fetchNseUniverseQuotes();
    return quotes
      .filter((q) => "symbol" in q && typeof q.regularMarketPrice === "number")
      .map((q) => toScreenedStock(q as QuoteLike, "NSE", "IN"));
  }

  const [gainers, losers, active] = await Promise.all([
    yf.screener({ scrIds: "day_gainers", region: "US", count: 100 }),
    yf.screener({ scrIds: "day_losers", region: "US", count: 100 }),
    yf.screener({ scrIds: "most_actives", region: "US", count: 100 }),
  ]);

  const bySymbol = new Map<string, QuoteLike>();
  for (const result of [gainers, losers, active]) {
    for (const q of result.quotes) {
      if (!bySymbol.has(q.symbol)) bySymbol.set(q.symbol, q);
    }
  }

  const out: ScreenedStock[] = [];
  for (const [symbol, q] of bySymbol) {
    if (typeof q.regularMarketPrice !== "number") continue;

    const exchange = mapExchange(undefined, q.exchange);
    if (!exchange) continue;

    out.push(toScreenedStock({ ...q, symbol }, exchange, "US"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Symbol search — the "add holding" autocomplete
// ---------------------------------------------------------------------------

/**
 * Maps Yahoo's exchange display name (or, failing that, its raw exchange code) to one of the
 * four exchanges this app actually supports. Returns null for anything else — an LSE or TSX
 * result, say — so the caller can drop it rather than offer a holding we have no currency or
 * quote-suffix rules for.
 */
function mapExchange(exchDisp: string | undefined, exchangeCode: string | undefined): Exchange | null {
  switch (exchDisp) {
    case "NASDAQ":
      return "NASDAQ";
    case "NYSE":
      return "NYSE";
    case "NSE":
      return "NSE";
    case "BSE":
      return "BSE";
  }

  // `exchDisp` is occasionally missing; the raw code is more stable but less readable, so it's
  // only the fallback.
  switch (exchangeCode) {
    case "NMS":
    case "NGM":
    case "NCM":
      return "NASDAQ";
    case "NYQ":
      return "NYSE";
    case "NSI":
      return "NSE";
    case "BSE":
      return "BSE";
    default:
      return null;
  }
}

const MARKET_FOR_EXCHANGE: Record<Exchange, Market> = {
  NASDAQ: "US",
  NYSE: "US",
  NSE: "IN",
  BSE: "IN",
};

/**
 * Company-name (or ticker) autocomplete for the "add holding"/"add to watchlist" forms.
 *
 * Yahoo's search endpoint returns a mix of equities, ETFs, mutual funds, and non-Yahoo
 * (Crunchbase-only) entities with no tradable symbol at all — this keeps only real equities on
 * one of the four exchanges the app supports, so every suggestion is one the rest of the form
 * can actually act on.
 */
export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
  if (query.trim().length < 2) return [];

  const result = await yf.search(query, { quotesCount: 8, newsCount: 0 });

  const out: SymbolSearchResult[] = [];
  for (const q of result.quotes) {
    if (!("isYahooFinance" in q) || !q.isYahooFinance) continue;
    if (!("quoteType" in q) || q.quoteType !== "EQUITY") continue;

    const exchange = mapExchange(q.exchDisp, q.exchange);
    if (!exchange) continue;

    // Yahoo's search results carry the exchange suffix directly on NSE/BSE symbols
    // ("TCS.NS") but not on US ones. Strip it — `toYahooSymbol` adds its own suffix from the
    // `exchange` field wherever this result ends up, and a stored "TCS.NS" would double up
    // into "TCS.NS.NS" the next time a quote is fetched.
    const symbol = q.symbol.replace(/\.(NS|BO)$/i, "");

    out.push({
      symbol,
      name: q.longname ?? q.shortname ?? q.symbol,
      exchange,
      market: MARKET_FOR_EXCHANGE[exchange],
      sector: ("sectorDisp" in q ? q.sectorDisp : undefined) ?? ("sector" in q ? q.sector : undefined) ?? null,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Futures & options
// ---------------------------------------------------------------------------

/**
 * Continuous futures contracts Yahoo quotes directly — the front-month ticker, not a dated
 * contract. There is no chain of expiries available per instrument through this API, unlike
 * equity options below; a curated watchlist of the major contracts is the honest ceiling here.
 */
const INDEX_FUTURES = [
  { symbol: "ES=F", name: "S&P 500 E-Mini", description: "The S&P 500 — 500 large US companies" },
  { symbol: "NQ=F", name: "Nasdaq 100 E-Mini", description: "The Nasdaq-100 — US mega-cap tech" },
  { symbol: "YM=F", name: "Dow Jones Mini", description: "The Dow Jones — 30 US blue chips" },
  { symbol: "RTY=F", name: "Russell 2000 E-Mini", description: "The Russell 2000 — US small caps" },
];

export async function fetchFuturesQuotes(): Promise<FutureContract[]> {
  // Commodity contracts are the same five tickers the market page's commodity watch uses, so
  // they share one definition table rather than a second copy that can drift out of sync.
  const defs = [
    ...INDEX_FUTURES.map((d) => ({ ...d, category: "index" as const })),
    ...COMMODITY_SYMBOLS.map((d) => ({ ...d, category: "commodity" as const })),
  ];

  const results = await yf.quote(defs.map((d) => d.symbol));
  const list = Array.isArray(results) ? results : [results];
  const bySymbol = new Map(list.map((q) => [q.symbol, q]));

  return defs.map((def) => {
    const q = bySymbol.get(def.symbol);
    return {
      symbol: def.symbol,
      name: def.name,
      description: def.description,
      category: def.category,
      price: numberOrNull(q?.regularMarketPrice),
      changePercent: numberOrNull(q?.regularMarketChangePercent),
      dayHigh: numberOrNull(q?.regularMarketDayHigh),
      dayLow: numberOrNull(q?.regularMarketDayLow),
      fiftyTwoWeekHigh: numberOrNull(q?.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: numberOrNull(q?.fiftyTwoWeekLow),
      currency: q?.currency ?? "USD",
    };
  });
}

/**
 * A real options chain — Yahoo genuinely supports this, but only for US-listed optionable
 * equities and ETFs (verified empirically: NSE symbols and raw indices like `^NSEI`/`^GSPC`
 * return zero expirations; index exposure needs a proxy ETF like SPY/QQQ/DIA instead).
 *
 * Passing `expirationIso` keeps the response light: Yahoo still returns the full
 * `expirationDates` list (so the date-picker has every option), but `options[]` itself holds
 * only the requested date's calls/puts rather than all ~20 expirations at once.
 */
export async function fetchOptionChain(
  symbol: string,
  expirationIso?: string,
): Promise<OptionChainResponse | null> {
  const result = await yf.options(
    symbol,
    expirationIso ? { date: new Date(expirationIso) } : undefined,
  );

  const chain = result.options[0];
  if (!chain) return null;

  return {
    symbol: result.underlyingSymbol,
    name: result.quote.longName ?? result.quote.shortName ?? result.underlyingSymbol,
    underlyingPrice: numberOrNull(result.quote.regularMarketPrice),
    underlyingChangePercent: numberOrNull(result.quote.regularMarketChangePercent),
    currency: result.quote.currency ?? "USD",
    expirationDates: result.expirationDates.map((d) => d.toISOString().slice(0, 10)),
    expiration: new Date(chain.expirationDate).toISOString().slice(0, 10),
    calls: chain.calls.map(toOptionContract),
    puts: chain.puts.map(toOptionContract),
  };
}

function toOptionContract(c: {
  contractSymbol: string;
  strike: number;
  lastPrice: number;
  bid?: number;
  ask?: number;
  change: number;
  percentChange?: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
  inTheMoney: boolean;
}): OptionContract {
  return {
    contractSymbol: c.contractSymbol,
    strike: c.strike,
    lastPrice: numberOrNull(c.lastPrice),
    bid: numberOrNull(c.bid),
    ask: numberOrNull(c.ask),
    change: numberOrNull(c.change),
    percentChange: numberOrNull(c.percentChange),
    volume: numberOrNull(c.volume),
    openInterest: numberOrNull(c.openInterest),
    impliedVolatility: toPercent(c.impliedVolatility),
    inTheMoney: c.inTheMoney,
  };
}

function numberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Scales a fractional change (0.1886 = 18.86%) into the whole-percent units the app uses everywhere else. */
function toPercent(v: unknown): number | null {
  const n = numberOrNull(v);
  return n === null ? null : n * 100;
}

function toEpochMs(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number" && Number.isFinite(v)) {
    // Heuristic: values below ~1e12 are seconds, not milliseconds.
    return v < 1e12 ? v * 1000 : v;
  }
  return null;
}
