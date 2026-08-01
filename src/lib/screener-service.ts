import { cached } from "@/lib/cache";
import { isMarketOpen } from "@/lib/market-hours";
import { fetchScreenerCandidates } from "@/lib/providers/yahoo";
import type { Market, ScreenedStock, ScreenerFilters } from "@/lib/types";

/**
 * The candidate pool is the expensive, shared part — one upstream fetch per market, cached for
 * every user regardless of what they're filtering by. Filtering itself is just an array scan
 * over that cached pool, so a user narrowing/widening filters costs nothing upstream.
 *
 * Outside trading hours the candidate list can't have moved, so it's held far longer — no
 * point re-screening a closed market every minute.
 */
const OPEN_TTL_MS = 60_000;
const CLOSED_TTL_MS = 30 * 60_000;

const NEAR_THRESHOLD_PERCENT = 5;

export async function getScreenedStocks(
  market: Market,
  filters: ScreenerFilters,
): Promise<ScreenedStock[]> {
  const ttl = isMarketOpen(market) ? OPEN_TTL_MS : CLOSED_TTL_MS;

  const { value: candidates } = await cached(`screener:${market}`, ttl, () =>
    fetchScreenerCandidates(market),
  );

  return candidates.filter((stock) => matchesFilters(stock, filters));
}

function matchesFilters(stock: ScreenedStock, filters: ScreenerFilters): boolean {
  if (filters.priceMin != null && (stock.price == null || stock.price < filters.priceMin)) return false;
  if (filters.priceMax != null && (stock.price == null || stock.price > filters.priceMax)) return false;

  if (
    filters.changePercentMin != null &&
    (stock.changePercent == null || stock.changePercent < filters.changePercentMin)
  ) {
    return false;
  }
  if (
    filters.changePercentMax != null &&
    (stock.changePercent == null || stock.changePercent > filters.changePercentMax)
  ) {
    return false;
  }

  if (filters.peMin != null && (stock.peRatio == null || stock.peRatio < filters.peMin)) return false;
  if (filters.peMax != null && (stock.peRatio == null || stock.peRatio > filters.peMax)) return false;

  if (filters.volumeMin != null && (stock.volume == null || stock.volume < filters.volumeMin)) return false;

  if (filters.nearHigh && (stock.percentFromHigh == null || stock.percentFromHigh < -NEAR_THRESHOLD_PERCENT)) {
    return false;
  }
  if (filters.nearLow && (stock.percentFromLow == null || stock.percentFromLow > NEAR_THRESHOLD_PERCENT)) {
    return false;
  }

  return true;
}
