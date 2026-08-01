import { apiError, apiOk } from "@/lib/api";
import { getMarketOverview } from "@/lib/market-service";

/**
 * GET /api/market — public, no auth required. Index trend and daily top-10 gainers/losers for
 * the US and Indian markets, for the logged-out landing page.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return apiOk(await getMarketOverview());
  } catch (err) {
    return apiError(err, "Failed to load market overview");
  }
}
