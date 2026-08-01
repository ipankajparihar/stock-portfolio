import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api";
import { getOptionChain, UnsupportedDerivativesMarket } from "@/lib/derivatives-service";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/derivatives/options?symbol=AAPL&expiration=2026-08-03 — public, no auth.
 *
 * `expiration` is optional; omitted, Yahoo's nearest expiration is used. `symbol` is passed
 * straight to Yahoo's options endpoint — unlike the portfolio/watchlist routes, there's no
 * user-owned symbol list to validate against here, since this never touches a user's data.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim();
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400, headers: NO_STORE });
  }

  const expiration = request.nextUrl.searchParams.get("expiration") ?? undefined;

  try {
    const chain = await getOptionChain(symbol, expiration);
    if (!chain) {
      return NextResponse.json(
        { error: "No options available", detail: `${symbol} has no listed options.` },
        { status: 404, headers: NO_STORE },
      );
    }
    return apiOk(chain);
  } catch (err) {
    if (err instanceof UnsupportedDerivativesMarket) {
      return NextResponse.json(
        { error: "Unsupported market", detail: err.message },
        { status: 404, headers: NO_STORE },
      );
    }
    return apiError(err, `Failed to load options for ${symbol}`);
  }
}
