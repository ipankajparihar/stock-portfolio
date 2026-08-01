import { apiError, apiOk } from "@/lib/api";
import { auth } from "@/auth";
import { getPortfolio } from "@/lib/portfolio-service";

/**
 * GET /api/portfolio — the signed-in user's own holdings: live prices from Yahoo Finance,
 * fundamentals scraped from Google Finance.
 *
 * This is the Node backend. Everything that must not reach the browser lives behind it: the
 * Yahoo client, the Google scraper, its User-Agent and request cadence, and the shared cache.
 * The client receives finished JSON and never talks to a financial provider directly — which
 * also sidesteps CORS, since neither provider permits cross-origin browser calls.
 *
 * Route Handlers are uncached by default in this Next version, which is what we want: caching
 * is our own TTL layer (15s quotes / 30min fundamentals).
 */

// Prices are per-request live data; never prerender this at build time.
export const dynamic = "force-dynamic";

// The scraper needs Node APIs and outbound fetch, so pin it off the edge runtime.
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return apiOk(await getPortfolio(session.user.id));
  } catch (err) {
    return apiError(err, "Failed to load portfolio data");
  }
}
