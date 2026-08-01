import { cached, errorMessage } from "@/lib/cache";
import { getUserHoldings, getUserWatchlist } from "@/lib/holdings-repo";
import { isMarketOpen } from "@/lib/market-hours";
import { fetchFundamentals } from "@/lib/providers/google";
import { fetchHistory, fetchProfile, fetchQuoteDetail } from "@/lib/providers/yahoo";
import type { Exchange, Holding, Market, PositionSummary, RangeKey, StockDetailResponse } from "@/lib/types";

/**
 * Assembles the stock detail page: quote + price history + fundamentals + company profile,
 * plus the user's own position in the stock, if they hold it.
 *
 * A symbol is only addressable here if it's already in the user's own holdings or watchlist —
 * both of which carry their own `exchange`/`market`, so an arbitrary user-supplied string never
 * reaches the Yahoo/Google interpolation below. This mirrors the original single-portfolio
 * design's safety property (only *known* symbols are resolvable) while extending it to
 * anything the user has explicitly added, not just what they own.
 *
 * ## Cache TTLs
 * Each feed is cached for as long as it is actually *valid*, which differs wildly:
 *
 * - **Quote (15s)** — the live price; matches the dashboard's poll interval.
 * - **Intraday history (60s)** — a 5-minute candle can't meaningfully change more than once
 *   a minute, so re-fetching it every 15s alongside the quote would be pure waste. The header
 *   price still updates every 15s; only the line lags by up to a minute.
 * - **Daily history (30min)** — daily candles don't change intraday at all. The only thing
 *   that moves is the final point, and the header carries the live number anyway.
 * - **Fundamentals (30min)** — shared with the dashboard's cache entry, so opening a detail
 *   page for a stock already on the dashboard costs *zero* extra Google requests.
 * - **Profile (24h)** — sector, industry and headcount change on the order of years.
 */

const QUOTE_TTL_MS = 15_000;
/** Nothing is trading, so the last quote *is* the current one until the next session opens. */
const QUOTE_CLOSED_TTL_MS = 30 * 60_000;
const INTRADAY_HISTORY_TTL_MS = 60_000;
const DAILY_HISTORY_TTL_MS = 30 * 60 * 1000;
const FUNDAMENTALS_TTL_MS = 30 * 60 * 1000;
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ResolvedSymbol {
  symbol: string;
  name: string;
  exchange: Exchange;
  market: Market;
  sector: string;
  /** Present only when the user holds this symbol — null for a watchlist-only entry. */
  holding: Holding | null;
}

/** Resolve a ticker against the user's own holdings, then their watchlist. Null if neither. */
export async function findUserSymbol(userId: string, symbol: string): Promise<ResolvedSymbol | null> {
  const needle = symbol.trim().toUpperCase();

  const holdings = await getUserHoldings(userId);
  const holding = holdings.find((h) => h.symbol.toUpperCase() === needle);
  if (holding) {
    return {
      symbol: holding.symbol,
      name: holding.name,
      exchange: holding.exchange,
      market: holding.market,
      sector: holding.sector,
      holding,
    };
  }

  const watchlist = await getUserWatchlist(userId);
  const entry = watchlist.find((w) => w.symbol.toUpperCase() === needle);
  if (entry) {
    return {
      symbol: entry.symbol,
      name: entry.name,
      exchange: entry.exchange,
      market: entry.market,
      sector: "Watchlist",
      holding: null,
    };
  }

  return null;
}

export async function getStockDetail(
  entry: ResolvedSymbol,
  allHoldings: Holding[],
  range: RangeKey,
): Promise<StockDetailResponse> {
  const warnings: string[] = [];
  const { symbol, exchange } = entry;
  const quoteTtl = isMarketOpen(entry.market) ? QUOTE_TTL_MS : QUOTE_CLOSED_TTL_MS;

  // Four independent feeds — fetch them concurrently, and let each fail on its own without
  // taking the page down. A missing chart shouldn't cost you the P/E, and vice versa.
  const [quote, history, fundamentals, profile] = await Promise.all([
    cached(`yahoo:quote-detail:${symbol}:${exchange}`, quoteTtl, () =>
      fetchQuoteDetail(symbol, exchange),
    )
      .then((r) => r.value)
      .catch((err: unknown) => {
        warnings.push(`Live price unavailable (${errorMessage(err)}).`);
        return null;
      }),

    cached(
      `yahoo:history:${symbol}:${exchange}:${range}`,
      // Intraday candles move; daily ones are settled. No reason to re-fetch them alike — and
      // an intraday candle stops moving too once the session it belongs to has closed.
      range === "1D" || range === "5D" ? Math.max(INTRADAY_HISTORY_TTL_MS, quoteTtl) : DAILY_HISTORY_TTL_MS,
      () => fetchHistory(symbol, exchange, range),
    )
      .then((r) => r.value)
      .catch((err: unknown) => {
        warnings.push(`Price history unavailable (${errorMessage(err)}).`);
        return null;
      }),

    // NOTE: same cache key the dashboard uses, so this is usually a free hit.
    cached(`google:${symbol}:${exchange}`, FUNDAMENTALS_TTL_MS, () =>
      fetchFundamentals(symbol, exchange),
    )
      .then((r) => r.value)
      .catch((err: unknown) => {
        warnings.push(`P/E and earnings unavailable (${errorMessage(err)}).`);
        return null;
      }),

    cached(`yahoo:profile:${symbol}:${exchange}`, PROFILE_TTL_MS, () =>
      fetchProfile(symbol, exchange, entry.name),
    )
      .then((r) => r.value)
      .catch(() => null), // Background colour only — not worth warning the user about.
  ]);

  return {
    symbol,
    name: entry.name,
    exchange,
    sector: entry.sector,

    quote,
    history,
    fundamentals,
    profile,
    position: entry.holding ? buildPosition(entry.holding, allHoldings, quote?.cmp ?? null) : null,

    updatedAt: Date.now(),
    warnings,
  };
}

/**
 * The user's position in this stock.
 *
 * `portfolioPercent` is weight by *invested capital within the same market* — the same
 * definition the dashboard's "Portfolio %" column uses. Mixing in another market's holdings
 * would let a US position's weight be diluted by an unrelated INR total.
 */
function buildPosition(
  holding: Holding,
  allHoldings: Holding[],
  cmp: number | null,
): PositionSummary {
  const investment = holding.purchasePrice * holding.quantity;
  const presentValue = cmp === null ? null : cmp * holding.quantity;
  const gainLoss = presentValue === null ? null : presentValue - investment;

  const marketInvestment = allHoldings
    .filter((h) => h.market === holding.market)
    .reduce((sum, h) => sum + h.purchasePrice * h.quantity, 0);

  return {
    purchasePrice: holding.purchasePrice,
    quantity: holding.quantity,
    investment,
    presentValue,
    gainLoss,
    gainLossPercent:
      gainLoss === null || investment === 0 ? null : (gainLoss / investment) * 100,
    portfolioPercent: marketInvestment === 0 ? 0 : (investment / marketInvestment) * 100,
  };
}
