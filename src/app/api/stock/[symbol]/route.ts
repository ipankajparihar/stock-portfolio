import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { apiError, apiOk } from "@/lib/api";
import { getUserHoldings } from "@/lib/holdings-repo";
import { isValidRange } from "@/lib/ranges";
import { findUserSymbol, getStockDetail } from "@/lib/stock-service";

/**
 * GET /api/stock/[symbol]?range=1M — everything the detail page needs, in one payload.
 *
 * Like the portfolio endpoint, this is the Node backend: the Yahoo client and the Google
 * scraper stay behind it and the browser only ever receives finished JSON.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/stock/[symbol]">) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol } = await ctx.params;

  // Only symbols already in the user's own holdings or watchlist are addressable. This is both
  // a product decision (the page shows your position) and a safety one: the ticker is
  // interpolated into an outbound URL, so resolving it against data the user themselves added
  // means an arbitrary string can never reach Yahoo or Google.
  const entry = await findUserSymbol(session.user.id, symbol);

  if (!entry) {
    return NextResponse.json(
      { error: "Unknown symbol", detail: `${symbol} is not in your holdings or watchlist.` },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const requested = request.nextUrl.searchParams.get("range") ?? "1M";
  const range = isValidRange(requested) ? requested : "1M";

  try {
    const holdings = await getUserHoldings(session.user.id);
    return apiOk(await getStockDetail(entry, holdings, range));
  } catch (err) {
    return apiError(err, `Failed to load stock data for ${symbol}`);
  }
}
