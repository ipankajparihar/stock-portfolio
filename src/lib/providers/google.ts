import * as cheerio from "cheerio";
import type { Exchange, Fundamentals } from "@/lib/types";

/**
 * Google Finance — source of the P/E Ratio and Latest Earnings.
 *
 * ## On the lack of an official API
 * Google shut down the Google Finance API in 2012 and never replaced it. There is no
 * endpoint, no key, no terms under which this data is served programmatically — so the
 * only route to P/E and earnings is scraping the public quote page
 * (`google.com/finance/quote/SYMBOL:EXCHANGE`).
 *
 * That has a specific, well-known failure mode: **Google's CSS class names are minified
 * and rotate without warning.** A scraper pinned to `.KxsRFb`/`.SwQK7` works until the
 * day it silently returns nothing for every stock.
 *
 * So this parser is deliberately written in two layers:
 *
 *   1. **Fast path** — the current class structure (`.KxsRFb` rows of label/value).
 *   2. **Resilient path** — if the fast path yields nothing, find the leaf element whose
 *      *text* is literally "P/E ratio" and read its sibling. Labels are user-visible copy;
 *      they change far less often than minified class hashes.
 *
 * When both fail we return nulls rather than throwing, and the UI renders an explicit
 * "unavailable" state. Degrading one column beats taking down the dashboard.
 *
 * This module only ever runs on the server — never ship a scraper to the browser
 * (it would be blocked by CORS and would leak our request pattern to users).
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const REQUEST_TIMEOUT_MS = 8_000;

/** Result of scraping one quote page. `null` fields mean "Google didn't give us this". */
export async function fetchFundamentals(
  symbol: string,
  exchange: Exchange,
): Promise<Fundamentals> {
  const url = `https://www.google.com/finance/quote/${encodeURIComponent(symbol)}:${exchange}`;

  const res = await fetchWithTimeout(url);

  if (!res.ok) {
    // 404 = Google doesn't list this ticker (our symbol is wrong, or it's delisted).
    // 429 = we're being rate-limited and should back off.
    throw new Error(
      res.status === 429
        ? `Google Finance rate-limited the request for ${symbol} (HTTP 429)`
        : `Google Finance returned HTTP ${res.status} for ${symbol}`,
    );
  }

  return parseQuotePage(await res.text());
}

/**
 * Exported for unit testing against saved HTML fixtures — the only way to catch a
 * Google DOM change without hitting the network.
 */
export function parseQuotePage(html: string): Fundamentals {
  const $ = cheerio.load(html);
  const stats = extractStats($);

  return {
    peRatio: parseNumeric(stats["P/E ratio"]),
    // Google labels trailing EPS simply "EPS" and formats it as "₹49.28".
    latestEarnings: parseNumeric(stats["EPS"]),
    earningsEvent: extractEarningsEvent($),

    // Kept as Google's own display strings: these are already human-formatted ("1.59%",
    // "Jun 19, 2026") and parsing them into numbers only to reformat them would add a
    // failure mode for no gain.
    dividendYield: stats["Dividend"] ?? null,
    quarterlyDividend: parseNumeric(stats["Quarterly dividend"]),
    exDividendDate: stats["Ex-dividend date"] ?? null,
  };
}

/**
 * Pull the label→value key stats off the page.
 *
 * Google renders the stats block twice (desktop + mobile layouts), so the first
 * occurrence of each label wins and later duplicates are ignored.
 */
function extractStats($: cheerio.CheerioAPI): Record<string, string> {
  const stats: Record<string, string> = {};

  // --- Fast path: current class structure ---
  $(".KxsRFb").each((_, el) => {
    const label = $(el).find(".SwQK7").text().trim();
    const value = $(el).find(".dO6ijd").text().trim();
    if (label && value && !(label in stats)) stats[label] = value;
  });

  if (Object.keys(stats).length > 0) return stats;

  // --- Resilient path: match on visible label text, ignore class names entirely ---
  // Google's markup pairs a label leaf with its value as the immediate next sibling.
  const WANTED = new Set([
    "P/E ratio",
    "EPS",
    "Dividend",
    "Quarterly dividend",
    "Ex-dividend date",
  ]);

  $("div, span, td").each((_, el) => {
    const $el = $(el);
    if ($el.children().length > 0) return; // leaf nodes only

    const label = $el.text().trim();
    if (!WANTED.has(label) || label in stats) return;

    const value = $el.next().text().trim() || $el.parent().next().text().trim();
    if (value) stats[label] = value;
  });

  return stats;
}

/**
 * Google shows an earnings banner above the chart, e.g.
 *   "Q1 2027 earnings • released • EPS beat +2.54% • Revenue beat +0.32%"
 *   "Q1 2027 earnings • in 5 days"
 * This is richer than the bare EPS number, so we surface it alongside.
 * Text-matched rather than class-matched, for the same durability reasons as above.
 */
function extractEarningsEvent($: cheerio.CheerioAPI): string | null {
  const body = $("body").text();
  const match = body.match(/Q[1-4]\s+\d{4}\s+earnings\s*•\s*([\s\S]{0,80}?)(?:See\s|chevron)/i);
  if (!match) return null;

  const event = match[1]
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[•\s]+$/, "");

  return event || null;
}

/**
 * Parse Google's display-formatted numbers: "₹49.28", "16.59", "1,020.50", "-", "—".
 * Returns null for anything that isn't a real number, so missing data never becomes NaN.
 */
function parseNumeric(raw: string | undefined): number | null {
  if (!raw) return null;

  // Strip currency symbols, thousands separators, and whitespace.
  const cleaned = raw.replace(/[₹$,\s]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "—") return null;

  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  // Without a timeout a hung scrape would stall the whole dashboard request.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
      },
      // We do our own TTL caching; don't let Next layer another cache underneath.
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Google Finance timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
