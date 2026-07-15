import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api";
import { isValidRange } from "@/lib/ranges";
import { findHolding, getStockDetail } from "@/lib/stock-service";

/**
 * GET /api/stock/[symbol]?range=1M — everything the detail page needs, in one payload.
 *
 * Like the portfolio endpoint, this is the Node backend: the Yahoo client and the Google
 * scraper stay behind it and the browser only ever receives finished JSON.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/stock/[symbol]">) {
  const { symbol } = await ctx.params;

  // Only symbols we actually hold are addressable. This is both a product decision (the page
  // shows your position in the stock) and a safety one: the ticker is interpolated into an
  // outbound URL, so resolving it against a known list means an arbitrary user-supplied string
  // can never reach Yahoo or Google.
  const holding = findHolding(symbol);

  if (!holding) {
    return NextResponse.json(
      { error: "Unknown symbol", detail: `${symbol} is not one of your holdings.` },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const requested = request.nextUrl.searchParams.get("range") ?? "1M";
  const range = isValidRange(requested) ? requested : "1M";

  try {
    return apiOk(await getStockDetail(holding, range));
  } catch (err) {
    return apiError(err, `Failed to load stock data for ${symbol}`);
  }
}
