import { HOLDINGS } from "@/data/holdings";
import { cached, errorMessage, type CacheResult } from "@/lib/cache";
import { mapLimit } from "@/lib/limit";
import { fetchFundamentals } from "@/lib/providers/google";
import { fetchQuotes } from "@/lib/providers/yahoo";
import type {
  FieldStatus,
  Fundamentals,
  Holding,
  LiveQuote,
  PortfolioResponse,
  PortfolioRow,
  QuoteTick,
  QuoteTickRow,
  SectorGroup,
  Totals,
} from "@/lib/types";

/**
 * Assembles the portfolio: fetch → merge → derive → group.
 * All of this runs server-side; the browser only ever sees the finished JSON.
 *
 * Two entry points, matching the two clocks the dashboard runs on:
 *
 *   - `getPortfolio()` — everything. The initial load, and an occasional full refresh.
 *   - `getQuotes()`    — prices and the figures derived from them, nothing else. The live poll.
 *
 * They share every line of derivation below, so the fast path can never disagree with the
 * slow one about what a present value or a sector subtotal is.
 */

/**
 * ## Cache tuning — the core rate-limit defence
 *
 * Two TTLs, because the two feeds change at very different speeds — and the client's two
 * poll cadences are deliberately built to match them:
 *
 * - **Quotes (15s)** — the whole point of the dashboard is a live price, so this tracks the
 *   fast poll. One *batched* Yahoo call covers all N holdings, so a 15s poll is ~4 upstream
 *   requests/minute regardless of portfolio size.
 *
 * - **Fundamentals (30min)** — P/E and EPS are recomputed when a company reports, not
 *   tick-by-tick. Scraping them every 15s would mean N page-fetches per cycle for data
 *   that is identical 99.9% of the time — the fastest possible route to an IP ban.
 *   At 30min, 20 holdings cost ~40 Google fetches/hour instead of ~4,800.
 *
 * The fast poll hits `getQuotes()`, which doesn't consult the Google cache at all, so the
 * 15s cadence can never so much as glance at the scraper. Extra tabs cost nothing either:
 * concurrent requests share one in-flight fetch via the cache.
 */
const QUOTE_TTL_MS = 15_000;
const FUNDAMENTALS_TTL_MS = 30 * 60 * 1000;

/** Keep the scraper's footprint browser-like rather than bot-like. */
const GOOGLE_CONCURRENCY = 4;

export async function getPortfolio(): Promise<PortfolioResponse> {
  const quoteWarnings: string[] = [];
  const fundamentalsWarnings: string[] = [];

  // Both feeds are independent — fetch them in parallel rather than serially.
  // Each degrades to a warning rather than an exception, so a total failure of one provider
  // still renders the other's columns.
  const [quotes, fundamentals] = await Promise.all([
    loadQuotes(quoteWarnings),
    loadFundamentals(fundamentalsWarnings),
  ]);

  const rows = HOLDINGS.map((holding) =>
    buildRow(holding, quotes, fundamentals?.get(holding.id) ?? null),
  );

  // Portfolio weight is share of total *investment* — i.e. how the capital was allocated.
  const totalInvestment = sum(rows.map((r) => r.investment));
  for (const row of rows) {
    row.portfolioPercent = pct(row.investment, totalInvestment);
  }

  return {
    sectors: groupBySector(rows, totalInvestment),
    totals: computeTotals(rows, totalInvestment),
    updatedAt: Date.now(),
    fundamentalsUpdatedAt: oldestFetchedAt(fundamentals),
    marketState: deriveMarketState(quotes?.value),
    quoteWarnings,
    fundamentalsWarnings,
  };
}

/**
 * Prices only — the payload behind the live poll.
 *
 * Fundamentals are not loaded at all here, and that is the point. Nothing Google supplies
 * (P/E, EPS, the earnings event) can be moved by a price tick, and the client is already
 * holding the last copy, so re-sending it four times a minute buys nothing. Skipping the
 * scrape entirely also means the fast path touches exactly one upstream feed.
 *
 * Rows are returned as a lean patch keyed by holding id rather than as whole rows: the
 * client splices it into the full payload it already has.
 */
export async function getQuotes(): Promise<QuoteTick> {
  const warnings: string[] = [];
  const quotes = await loadQuotes(warnings);

  // `null` fundamentals: the derived columns below don't read them, and the lean row shape
  // drops the fundamentals fields anyway.
  const rows = HOLDINGS.map((holding) => buildRow(holding, quotes, null));
  const totalInvestment = sum(rows.map((r) => r.investment));

  return {
    rows: rows.map(toQuoteTickRow),
    sectorTotals: sectorTotals(rows, totalInvestment),
    totals: computeTotals(rows, totalInvestment),
    updatedAt: Date.now(),
    marketState: deriveMarketState(quotes?.value),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/**
 * One batched Yahoo call for every holding, behind a 15s TTL.
 *
 * Provider failure is degraded into `warnings` rather than thrown: a portfolio with no live
 * prices still has purchase data worth rendering.
 */
async function loadQuotes(
  warnings: string[],
): Promise<CacheResult<Map<string, LiveQuote>> | null> {
  const quotes = await cached("yahoo:quotes", QUOTE_TTL_MS, () => fetchQuotes(HOLDINGS)).catch(
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
 * Per-symbol caching means one failing ticker doesn't invalidate the other nineteen, and
 * a newly-added holding doesn't force a full re-scrape.
 *
 * Keyed by holding id and returned as a map so callers never re-derive the mapping.
 */
async function loadFundamentals(
  warnings: string[],
): Promise<Map<string, CacheResult<Fundamentals>> | null> {
  let settled;
  try {
    settled = await mapLimit(HOLDINGS, GOOGLE_CONCURRENCY, (holding) =>
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
    if (result.ok) map.set(HOLDINGS[i].id, result.value);
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
    portfolioPercent: 0, // Set once the portfolio total is known.

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
 * The same subtotals `groupBySector` computes, without the rows.
 *
 * A quote tick doesn't re-send the rows — the client already has them — but the sector
 * subtotals it *does* send must be computed by the identical code path, or the header of a
 * sector and the rows inside it would drift apart between full refreshes. Sector ordering
 * is by investment, which a price can't change, so the tick carries no ordering either.
 */
function sectorTotals(
  rows: PortfolioRow[],
  totalInvestment: number,
): Record<string, Totals> {
  const totals: Record<string, Totals> = {};

  for (const [sector, sectorRows] of bucketBySector(rows)) {
    totals[sector] = computeTotals(sectorRows, totalInvestment);
  }

  return totals;
}

/** Strips a fully-derived row down to the fields a price tick is allowed to move. */
function toQuoteTickRow(row: PortfolioRow): QuoteTickRow {
  return {
    id: row.id,
    cmp: row.cmp,
    dayChange: row.dayChange,
    dayChangePercent: row.dayChangePercent,
    presentValue: row.presentValue,
    gainLoss: row.gainLoss,
    gainLossPercent: row.gainLossPercent,
    quoteStatus: row.quoteStatus,
  };
}

/**
 * Subtotals for a set of rows. Used for both sector groups and the grand total.
 *
 * `presentValue` deliberately sums only rows that *have* a price: if one quote is missing,
 * the subtotal reflects the positions we can actually value rather than silently counting
 * the missing one as ₹0, which would invent a fake loss.
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
