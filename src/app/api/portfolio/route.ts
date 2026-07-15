import { apiError, apiOk } from "@/lib/api";
import { getPortfolio } from "@/lib/portfolio-service";

/**
 * GET /api/portfolio — the full payload: holdings, live prices, and Google-scraped fundamentals.
 *
 * This is the Node backend. Everything that must not reach the browser lives behind it: the
 * Yahoo client, the Google scraper, its User-Agent and request cadence, and the shared cache.
 * The client receives finished JSON and never talks to a financial provider directly — which
 * also sidesteps CORS, since neither provider permits cross-origin browser calls.
 *
 * The dashboard no longer polls this — it listens to `/api/portfolio/stream`, which pushes both
 * the initial payload and every update. What's left for this endpoint is the one request the
 * client still makes on purpose: the user clicking Refresh. A click is a question, and the
 * stream only answers; so it keeps a plain request/response path of its own.
 *
 * Route Handlers are uncached by default in this Next version, which is what we want: caching
 * is our own TTL layer (15s quotes / 30min fundamentals).
 */

// Prices are per-request live data; never prerender this at build time.
export const dynamic = "force-dynamic";

// The scraper needs Node APIs and outbound fetch, so pin it off the edge runtime.
export const runtime = "nodejs";

export async function GET() {
  try {
    return apiOk(await getPortfolio());
  } catch (err) {
    return apiError(err, "Failed to load portfolio data");
  }
}
