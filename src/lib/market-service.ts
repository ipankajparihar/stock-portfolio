import { cached, errorMessage } from "@/lib/cache";
import { isMarketOpen } from "@/lib/market-hours";
import {
  fetchCommodityQuotes,
  fetchCryptoQuotes,
  fetchIndexQuotes,
  fetchMovers,
} from "@/lib/providers/yahoo";
import type { IndexQuote, Market, MarketOverviewResponse, MarketSnapshot } from "@/lib/types";

/**
 * The public landing page's data: index trend plus daily top-10 gainers/losers for US and
 * India, plus a global crypto and commodities watch. No auth required — this is the same for
 * every visitor, so it's cached hard relative to the per-user portfolio feed.
 *
 * Outside a market's own trading hours its prices are not moving — the last trade *is* the
 * current price until the next session opens — so there is nothing to gain from re-fetching it
 * every minute. `resolveTtl` stretches the cache out while a market is closed; crypto and
 * commodities trade 24/7 and always use the short TTL.
 */
const OPEN_TTL_MS = 60_000;
const CLOSED_TTL_MS = 30 * 60_000;

const MARKETS: Market[] = ["US", "IN"];

function resolveTtl(market: Market): number {
  return isMarketOpen(market) ? OPEN_TTL_MS : CLOSED_TTL_MS;
}

export async function getMarketOverview(): Promise<MarketOverviewResponse> {
  const warnings: string[] = [];

  const [markets, crypto, commodities] = await Promise.all([
    Promise.all(MARKETS.map((market) => loadMarketSnapshot(market, warnings))),
    loadQuoteList("crypto", fetchCryptoQuotes, OPEN_TTL_MS, warnings),
    loadQuoteList("commodities", fetchCommodityQuotes, OPEN_TTL_MS, warnings),
  ]);

  return {
    markets,
    crypto,
    commodities,
    updatedAt: Date.now(),
    warnings,
  };
}

async function loadMarketSnapshot(market: Market, warnings: string[]): Promise<MarketSnapshot> {
  const ttl = resolveTtl(market);

  const [indices, gainers, losers] = await Promise.all([
    cached(`market:indices:${market}`, ttl, () => fetchIndexQuotes(market))
      .then((r) => r.value)
      .catch((err: unknown) => {
        warnings.push(`${market} index data unavailable (${errorMessage(err)}).`);
        return [];
      }),

    cached(`market:gainers:${market}`, ttl, () => fetchMovers(market, "gainers"))
      .then((r) => r.value)
      .catch((err: unknown) => {
        warnings.push(`${market} top gainers unavailable (${errorMessage(err)}).`);
        return [];
      }),

    cached(`market:losers:${market}`, ttl, () => fetchMovers(market, "losers"))
      .then((r) => r.value)
      .catch((err: unknown) => {
        warnings.push(`${market} top losers unavailable (${errorMessage(err)}).`);
        return [];
      }),
  ]);

  return { market, indices, gainers, losers };
}

async function loadQuoteList(
  label: string,
  fetcher: () => Promise<IndexQuote[]>,
  ttl: number,
  warnings: string[],
): Promise<IndexQuote[]> {
  return cached(`market:${label}`, ttl, fetcher)
    .then((r) => r.value)
    .catch((err: unknown) => {
      warnings.push(`${label} data unavailable (${errorMessage(err)}).`);
      return [];
    });
}
