import YahooFinance from "yahoo-finance2";
import type {
  ChartPoint,
  CompanyProfile,
  LiveQuote,
  PriceHistory,
  QuoteDetail,
  RangeKey,
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

/** Yahoo addresses Indian equities as `SYMBOL.NS` (NSE) / `SYMBOL.BO` (BSE). */
export function toYahooSymbol(symbol: string, exchange: "NSE" | "BSE"): string {
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
  holdings: { symbol: string; exchange: "NSE" | "BSE" }[],
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
  exchange: "NSE" | "BSE",
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
  exchange: "NSE" | "BSE",
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
  exchange: "NSE" | "BSE",
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
  exchange: "NSE" | "BSE",
  lookbackDays: number,
  interval: "5m" | "15m" | "1d" | "1wk",
) {
  return yf.chart(toYahooSymbol(symbol, exchange), {
    period1: new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000),
    interval,
  });
}

function numberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function toEpochMs(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number" && Number.isFinite(v)) {
    // Heuristic: values below ~1e12 are seconds, not milliseconds.
    return v < 1e12 ? v * 1000 : v;
  }
  return null;
}
