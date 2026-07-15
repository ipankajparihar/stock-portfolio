/**
 * How often each feed is refreshed.
 *
 * These live apart from both the server hub and the client hook because the two now sit on
 * opposite ends of a stream and must agree: the hub schedules against them, and the status bar
 * draws its countdown ring against them. A cadence that disagreed across that boundary would
 * show a ring that empties before (or long after) the data it's promising actually lands.
 */

/** Prices. Matches the server's quote TTL, so a cycle and a cache expiry line up. */
export const QUOTE_INTERVAL_MS = 15_000;

/**
 * The full payload, fundamentals included. P/E and EPS move when a company reports, not tick by
 * tick, and the scrape behind them is cached for 30 minutes per symbol (staggered), so this
 * picks each one up promptly after it expires without ever being the thing that triggers it.
 */
export const FULL_INTERVAL_MS = 5 * 60_000;
