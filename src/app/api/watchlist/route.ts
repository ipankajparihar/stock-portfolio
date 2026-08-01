import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiError, apiOk } from "@/lib/api";
import { getWatchlistWithQuotes } from "@/lib/watchlist-service";

/**
 * GET /api/watchlist — the signed-in user's watchlist with a live quote per symbol.
 *
 * Same shape as `/api/portfolio`: a Node route handler behind the provider client, polled by
 * the client on the same cadence as the portfolio dashboard so a watched price feels just as
 * alive as an owned one.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return apiOk(await getWatchlistWithQuotes(session.user.id));
  } catch (err) {
    return apiError(err, "Failed to load watchlist");
  }
}
