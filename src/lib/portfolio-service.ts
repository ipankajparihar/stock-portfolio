import { cached, errorMessage, type CacheResult } from "@/lib/cache";
import { getUserHoldings } from "@/lib/holdings-repo";
import { mapLimit } from "@/lib/limit";
import { isAnyMarketOpen } from "@/lib/market-hours";
import { fetchFundamentals } from "@/lib/providers/google";
import { fetchQuotes } from "@/lib/providers/yahoo";
import type {
  FieldStatus,
  Fundamentals,
  Holding,
  LiveQuote,
  MarketGroup,
  PortfolioResponse,
  PortfolioRow,
  SectorGroup,
  Totals,
} from "@/lib/types";

/**
 * Assembles a user's portfolio: fetch → merge → derive → group.
 * All of this runs server-side; the browser only ever sees the finished JSON.
 *
 * Holdings come from `holdings-repo.ts`, which aggregates the user's manually-entered purchase
 * lots into one row per position. Everything below that is unchanged from the original
 * single-portfolio design: fetch quotes/fundamentals, merge onto each holding, derive the
 * per-row figures, then group.
 *
 * The one structural change is `groupByMarket`: US and Indian holdings are denominated in
 * different currencies, so subtotals are computed *within* each market rather than across all
 * of them — there is no single blended grand total anywhere in this payload.
 */

const QUOTE_TTL_MS = 15_000;
/** Nothing is trading, so the last quote *is* the current one until the next session opens. */
const QUOTE_CLOSED_TTL_MS = 30 * 60 * 1000;
const FUNDAMENTALS_TTL_MS = 30 * 60 * 1000;

/** Keep the scraper's footprint browser-like rather than bot-like. */
const GOOGLE_CONCURRENCY = 4;

export async function getPortfolio(userId: string): Promise<PortfolioResponse> {
  const quoteWarnings: string[] = [];
  const fundamentalsWarnings: string[] = [];

  const holdings = await getUserHoldings(userId);

  // Both feeds are independent — fetch them in parallel rather than serially.
  // Each degrades to a warning rather than an exception, so a total failure of one provider
  // still renders the other's columns.
  const [quotes, fundamentals] = await Promise.all([
    loadQuotes(holdings, quoteWarnings),
    loadFundamentals(holdings, fundamentalsWarnings),
  ]);

  const rows = holdings.map((holding) =>
    buildRow(holding, quotes, fundamentals?.get(holding.id) ?? null),
  );

  return {
    marketGroups: groupByMarket(rows),
    updatedAt: Date.now(),
    fundamentalsUpdatedAt: oldestFetchedAt(fundamentals),
    marketState: deriveMarketState(quotes?.value),
    quoteWarnings,
    fundamentalsWarnings,
  };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/**
 * One batched Yahoo call for every holding, keyed per-user so one user's portfolio never
 * serves another's cached prices.
 *
 * The TTL widens to 30 minutes when none of the user's markets are in their trading session —
 * a holding entirely in NSE stocks, checked at 9pm IST, has nothing to gain from a 15s poll
 * hitting Yahoo for a price that will not move again until the next session.
 */
async function loadQuotes(
  holdings: Holding[],
  warnings: string[],
): Promise<CacheResult<Map<string, LiveQuote>> | null> {
  if (holdings.length === 0) return null;

  const ttl = isAnyMarketOpen(holdings.map((h) => h.market)) ? QUOTE_TTL_MS : QUOTE_CLOSED_TTL_MS;

  const cacheKey = `yahoo:quotes:${holdings.map((h) => h.id).sort().join(",")}`;
  const quotes = await cached(cacheKey, ttl, () => fetchQuotes(holdings)).catch(
    (err: unknown) => {
      warnings.push(
        `Live prices are unavailable (${errorMessage(err)}). Showing purchase data only.`,
      );
      return null;
    },
  );

  if (quotes?.stale) {
    warnings.push(
      `Live prices are stale — the last refresh failed (${quotes.error}). Showing the most recent good prices.`,
    );
  }

  return quotes;
}

/**
 * Google has no batch endpoint, so each holding is scraped and cached under its own key.
 * Per-symbol caching means one failing ticker doesn't invalidate the others, and the cache is
 * shared across users who happen to hold the same stock.
 */
async function loadFundamentals(
  holdings: Holding[],
  warnings: string[],
): Promise<Map<string, CacheResult<Fundamentals>> | null> {
  if (holdings.length === 0) return null;

  let settled;
  try {
    settled = await mapLimit(holdings, GOOGLE_CONCURRENCY, (holding) =>
      cached(`google:${holding.symbol}:${holding.exchange}`, FUNDAMENTALS_TTL_MS, () =>
        fetchFundamentals(holding.symbol, holding.exchange),
      ),
    );
  } catch (err: unknown) {
    warnings.push(`P/E and earnings are unavailable (${errorMessage(err)}).`);
    return null;
  }

  const map = new Map<string, CacheResult<Fundamentals>>();
  settled.forEach((result, i) => {
    // A rejected entry means the scrape failed AND nothing was cached. The row renders
    // an "unavailable" P/E cell; it is not an error worth failing the dashboard over.
    if (result.ok) map.set(holdings[i].id, result.value);
  });

  return map;
}

/**
 * The worst-case age of the fundamentals in a payload.
 *
 * Each symbol is cached under its own key and so expires on its own schedule — after an hour
 * of uptime they're staggered across the 30-minute window. Reporting the *oldest* is the only
 * honest single number: "no P/E on screen is older than this".
 */
function oldestFetchedAt(
  fundamentals: Map<string, CacheResult<Fundamentals>> | null,
): number | null {
  if (!fundamentals?.size) return null;

  let oldest = Infinity;
  for (const result of fundamentals.values()) {
    oldest = Math.min(oldest, result.fetchedAt);
  }
  return Number.isFinite(oldest) ? oldest : null;
}

// ---------------------------------------------------------------------------
// Merge + derive
// ---------------------------------------------------------------------------

function buildRow(
  holding: Holding,
  quotes: CacheResult<Map<string, LiveQuote>> | null,
  fundamentals: CacheResult<Fundamentals> | null,
): PortfolioRow {
  const quote = quotes?.value.get(holding.symbol) ?? null;
  const cmp = quote?.cmp ?? null;

  const investment = holding.purchasePrice * holding.quantity;
  // Every CMP-derived field stays null (not 0, not NaN) when there's no price —
  // "unknown" and "zero" must not render the same way in a financial table.
  const presentValue = cmp === null ? null : cmp * holding.quantity;
  const gainLoss = presentValue === null ? null : presentValue - investment;

  return {
    ...holding,

    cmp,
    dayChange: quote?.dayChange ?? null,
    dayChangePercent: quote?.dayChangePercent ?? null,

    peRatio: fundamentals?.value.peRatio ?? null,
    latestEarnings: fundamentals?.value.latestEarnings ?? null,
    earningsEvent: fundamentals?.value.earningsEvent ?? null,

    investment,
    presentValue,
    gainLoss,
    gainLossPercent: gainLoss === null ? null : pct(gainLoss, investment),
    portfolioPercent: 0, // Set once the market's total is known — see groupByMarket.

    quoteStatus: statusFor(quotes, quote !== null, `No Yahoo quote for ${holding.symbol}`),
    fundamentalsStatus: statusFor(
      fundamentals,
      fundamentals?.value.peRatio != null || fundamentals?.value.latestEarnings != null,
      `Google Finance has no data for ${holding.symbol}`,
    ),
  };
}

/** Collapses cache state + presence-of-data into the provenance badge the UI renders. */
function statusFor(
  result: CacheResult<unknown> | null,
  hasData: boolean,
  missingMessage: string,
): FieldStatus {
  if (!result) {
    return { stale: false, failed: true, message: "Provider unavailable", fetchedAt: null };
  }
  if (!hasData) {
    return { stale: false, failed: true, message: missingMessage, fetchedAt: result.fetchedAt };
  }
  return {
    stale: result.stale,
    failed: false,
    message: result.stale ? `Last refresh failed: ${result.error}` : null,
    fetchedAt: result.fetchedAt,
  };
}

// ---------------------------------------------------------------------------
// Grouping + totals
// ---------------------------------------------------------------------------

/**
 * Buckets rows by market (and therefore currency), then by sector within each market.
 * `portfolioPercent` on every row and sector is computed against that market's own
 * investment total — weights never cross a currency boundary.
 */
function groupByMarket(rows: PortfolioRow[]): MarketGroup[] {
  const byMarket = new Map<string, PortfolioRow[]>();
  for (const row of rows) {
    const bucket = byMarket.get(row.market);
    if (bucket) bucket.push(row);
    else byMarket.set(row.market, [row]);
  }

  return [...byMarket.entries()]
    .map(([market, marketRows]) => {
      const totalInvestment = sum(marketRows.map((r) => r.investment));
      for (const row of marketRows) {
        row.portfolioPercent = pct(row.investment, totalInvestment);
      }

      return {
        market: market as Holding["market"],
        currency: marketRows[0].currency,
        sectors: groupBySector(marketRows, totalInvestment),
        ...computeTotals(marketRows, totalInvestment),
      };
    })
    .sort((a, b) => b.investment - a.investment);
}

function bucketBySector(rows: PortfolioRow[]): Map<string, PortfolioRow[]> {
  const buckets = new Map<string, PortfolioRow[]>();

  for (const row of rows) {
    const bucket = buckets.get(row.sector);
    if (bucket) bucket.push(row);
    else buckets.set(row.sector, [row]);
  }

  return buckets;
}

function groupBySector(rows: PortfolioRow[], totalInvestment: number): SectorGroup[] {
  return [...bucketBySector(rows).entries()]
    .map(([sector, sectorRows]) => ({
      sector,
      rows: sectorRows,
      ...computeTotals(sectorRows, totalInvestment),
    }))
    // Largest allocation first — the sectors carrying the most capital lead.
    .sort((a, b) => b.investment - a.investment);
}

/**
 * Subtotals for a set of rows. Used for both sector groups and a market's grand total.
 *
 * `presentValue` deliberately sums only rows that *have* a price: if one quote is missing,
 * the subtotal reflects the positions we can actually value rather than silently counting
 * the missing one as 0, which would invent a fake loss.
 */
function computeTotals(rows: PortfolioRow[], totalInvestment: number): Totals {
  const investment = sum(rows.map((r) => r.investment));

  const priced = rows.filter((r) => r.presentValue !== null);
  const presentValue = sum(priced.map((r) => r.presentValue as number));
  // Compare like with like: gain/loss is measured only against the priced rows' cost.
  const pricedInvestment = sum(priced.map((r) => r.investment));
  const gainLoss = presentValue - pricedInvestment;

  return {
    investment,
    presentValue,
    gainLoss,
    gainLossPercent: pct(gainLoss, pricedInvestment),
    portfolioPercent: pct(investment, totalInvestment),
  };
}

/** Yahoo reports market state per symbol; they agree in practice, so take the first. */
function deriveMarketState(quotes: Map<string, LiveQuote> | undefined): string | null {
  if (!quotes) return null;
  for (const quote of quotes.values()) {
    if (quote.marketState) return quote.marketState;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Small numeric helpers — all guard against divide-by-zero producing NaN/Infinity.
// ---------------------------------------------------------------------------

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100;
}
