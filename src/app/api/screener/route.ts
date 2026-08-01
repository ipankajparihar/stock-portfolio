import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { apiError, apiOk } from "@/lib/api";
import { getScreenedStocks } from "@/lib/screener-service";
import type { Market, ScreenerFilters } from "@/lib/types";

/**
 * GET /api/screener?market=US&priceMin=&priceMax=&peMin=&peMax=&changeMin=&changeMax=
 *                   &volumeMin=&nearHigh=1&nearLow=1
 *
 * The watchlist's "find stocks by filter" tool. Gated behind auth like the other data routes —
 * this feeds straight into a user's own watchlist, so it's a personalized tool, not a public one.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const market: Market = params.get("market") === "US" ? "US" : "IN";

  const filters: ScreenerFilters = {
    priceMin: parseNumber(params.get("priceMin")),
    priceMax: parseNumber(params.get("priceMax")),
    changePercentMin: parseNumber(params.get("changeMin")),
    changePercentMax: parseNumber(params.get("changeMax")),
    peMin: parseNumber(params.get("peMin")),
    peMax: parseNumber(params.get("peMax")),
    volumeMin: parseNumber(params.get("volumeMin")),
    nearHigh: params.get("nearHigh") === "1",
    nearLow: params.get("nearLow") === "1",
  };

  try {
    const results = await getScreenedStocks(market, filters);
    return apiOk({ results });
  } catch (err) {
    return apiError(err, "Failed to run the stock screener");
  }
}

function parseNumber(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}
