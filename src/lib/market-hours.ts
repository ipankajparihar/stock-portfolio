import type { Market } from "@/lib/types";

/**
 * Regular trading-session hours, in each exchange's own local time. Holidays aren't accounted
 * for — a closed market on a trading holiday just falls back to the "closed" TTL a bit early,
 * which is the safe direction to be wrong in (it costs a slightly-stale price, never a wasted
 * upstream call on a day the market never opens anyway).
 */
const SESSIONS: Record<Market, { timeZone: string; openMinute: number; closeMinute: number }> = {
  // NYSE/NASDAQ: 9:30 AM – 4:00 PM America/New_York.
  US: { timeZone: "America/New_York", openMinute: 9 * 60 + 30, closeMinute: 16 * 60 },
  // NSE/BSE: 9:15 AM – 3:30 PM Asia/Kolkata.
  IN: { timeZone: "Asia/Kolkata", openMinute: 9 * 60 + 15, closeMinute: 15 * 60 + 30 },
};

/** Weekday/hour/minute in a given IANA time zone, without pulling in a date library. */
function partsInZone(date: Date, timeZone: string): { weekday: string; minuteOfDay: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  const minuteOfDay = Number(get("hour")) * 60 + Number(get("minute"));

  return { weekday, minuteOfDay };
}

/** Whether `market`'s primary exchange is in its regular trading session right now. */
export function isMarketOpen(market: Market, now: Date = new Date()): boolean {
  const session = SESSIONS[market];
  const { weekday, minuteOfDay } = partsInZone(now, session.timeZone);

  if (weekday === "Sat" || weekday === "Sun") return false;
  return minuteOfDay >= session.openMinute && minuteOfDay < session.closeMinute;
}

/** True if any of the given markets is currently open — used when a request spans markets. */
export function isAnyMarketOpen(markets: Market[], now: Date = new Date()): boolean {
  return markets.some((m) => isMarketOpen(m, now));
}

const FUTURES_HALT_START = 17 * 60; // 5:00 PM ET — daily maintenance break begins.
const FUTURES_HALT_END = 18 * 60; // 6:00 PM ET — next session opens.

/**
 * CME futures keep their own clock: roughly Sunday 6 PM ET through Friday 5 PM ET, pausing for
 * an hour each evening. The equity session is the wrong predicate here — reusing `isMarketOpen("US")`
 * would freeze the cache through most of the hours futures actually trade. What this does buy is
 * the weekend halt, ~49 hours a week in which no upstream fetch can return a new price.
 */
export function isFuturesMarketOpen(now: Date = new Date()): boolean {
  const { weekday, minuteOfDay } = partsInZone(now, "America/New_York");

  if (weekday === "Sat") return false;
  if (weekday === "Sun") return minuteOfDay >= FUTURES_HALT_END;
  if (weekday === "Fri") return minuteOfDay < FUTURES_HALT_START;
  return minuteOfDay < FUTURES_HALT_START || minuteOfDay >= FUTURES_HALT_END;
}
