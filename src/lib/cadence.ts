/**
 * How often the client polls `/api/portfolio`.
 *
 * Matches the server's quote TTL in `portfolio-service.ts`, so a poll and a cache expiry line
 * up — polling faster than the cache refreshes would just re-serve the same cached response.
 */
export const QUOTE_INTERVAL_MS = 15_000;

/**
 * How often the public market/derivatives pages poll. Matches the open-market TTLs in
 * `market-service.ts` and `derivatives-service.ts` for the same reason.
 */
export const MARKET_INTERVAL_MS = 60_000;
