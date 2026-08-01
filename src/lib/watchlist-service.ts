import { cached, errorMessage } from "@/lib/cache";
import { getUserWatchlist } from "@/lib/holdings-repo";
import { isAnyMarketOpen } from "@/lib/market-hours";
import { fetchQuotes } from "@/lib/providers/yahoo";
import type { WatchlistEntry } from "@/lib/types";

const QUOTE_TTL_MS = 15_000;
/** Nothing is trading, so the last quote *is* the current one until the next session opens. */
const QUOTE_CLOSED_TTL_MS = 30 * 60_000;

/**
 * A watchlist row carries every field the sortable table needs — open, previous close, the
 * 52-week range, P/E — even though the card grid only renders a few of them. All of it comes
 * off the same batched Yahoo quote `fetchQuotes` already makes, so adding these fields costs
 * nothing extra upstream.
 */
export interface WatchlistRow extends WatchlistEntry {
  cmp: number | null;
  dayChangePercent: number | null;
  currency: string;
  open: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  peRatio: number | null;
  volume: number | null;
}

export interface WatchlistResponse {
  rows: WatchlistRow[];
  warning: string | null;
  updatedAt: number;
}

/** The user's watchlist, enriched with a live quote per symbol. */
export async function getWatchlistWithQuotes(userId: string): Promise<WatchlistResponse> {
  const entries = await getUserWatchlist(userId);
  if (entries.length === 0) return { rows: [], warning: null, updatedAt: Date.now() };

  const ttl = isAnyMarketOpen(entries.map((e) => e.market)) ? QUOTE_TTL_MS : QUOTE_CLOSED_TTL_MS;

  let warning: string | null = null;
  const quotes = await cached(`yahoo:watchlist-quotes:${userId}`, ttl, () =>
    fetchQuotes(entries),
  ).catch((err: unknown) => {
    warning = `Live prices are unavailable (${errorMessage(err)}).`;
    return null;
  });

  const rows = entries.map((entry) => {
    const quote = quotes?.value.get(entry.symbol) ?? null;
    return {
      ...entry,
      cmp: quote?.cmp ?? null,
      dayChangePercent: quote?.dayChangePercent ?? null,
      currency: quote?.currency ?? (entry.market === "IN" ? "INR" : "USD"),
      open: quote?.open ?? null,
      previousClose: quote?.previousClose ?? null,
      dayHigh: quote?.dayHigh ?? null,
      dayLow: quote?.dayLow ?? null,
      fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: quote?.fiftyTwoWeekLow ?? null,
      peRatio: quote?.peRatio ?? null,
      volume: quote?.volume ?? null,
    };
  });

  return { rows, warning, updatedAt: Date.now() };
}
