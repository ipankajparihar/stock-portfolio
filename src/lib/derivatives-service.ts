import { cached } from "@/lib/cache";
import { isFuturesMarketOpen, isMarketOpen } from "@/lib/market-hours";
import { fetchFuturesQuotes, fetchOptionChain } from "@/lib/providers/yahoo";
import type { FutureContract, OptionChainResponse } from "@/lib/types";

/**
 * Futures and options data — public, no auth, same for every visitor (like `/api/market`).
 *
 * TTLs stretch while the relevant market is shut, the same way every other service here resolves
 * freshness. The two halves need different clocks: US equity options trade exactly the equity
 * session, while CME futures run ~23 hours a day and only truly halt over the weekend.
 */
const OPEN_TTL_MS = 60_000;
const CLOSED_TTL_MS = 30 * 60_000;

/**
 * Indian derivatives aren't available from this provider at all — not "this stock has no options"
 * but "this data source carries none". Catching it here means the message says so, and that we
 * don't spend an upstream round-trip discovering it every time.
 */
const UNSUPPORTED_SUFFIX = /\.(NS|BO)$/i;

export class UnsupportedDerivativesMarket extends Error {
  constructor(symbol: string) {
    super(
      `Options data for ${symbol} isn't available — this data source covers US-listed stocks and ETFs only, not NSE/BSE derivatives.`,
    );
    this.name = "UnsupportedDerivativesMarket";
  }
}

export async function getFuturesWatchlist(): Promise<FutureContract[]> {
  const ttl = isFuturesMarketOpen() ? OPEN_TTL_MS : CLOSED_TTL_MS;
  const { value } = await cached("derivatives:futures", ttl, fetchFuturesQuotes);
  return value;
}

export async function getOptionChain(
  symbol: string,
  expiration?: string,
): Promise<OptionChainResponse | null> {
  if (UNSUPPORTED_SUFFIX.test(symbol)) throw new UnsupportedDerivativesMarket(symbol);

  const ttl = isMarketOpen("US") ? OPEN_TTL_MS : CLOSED_TTL_MS;
  const key = `derivatives:options:${symbol.toUpperCase()}:${expiration ?? "default"}`;
  const { value } = await cached(key, ttl, () => fetchOptionChain(symbol, expiration));
  return value;
}
