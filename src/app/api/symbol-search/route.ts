import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { apiError, apiOk } from "@/lib/api";
import { cached } from "@/lib/cache";
import { searchSymbols } from "@/lib/providers/yahoo";

/**
 * GET /api/symbol-search?q=apple — company-name/ticker autocomplete for the "add holding" and
 * "add to watchlist" forms.
 *
 * Gated behind auth like the other data-fetching routes, mainly to keep this from being an open
 * proxy onto Yahoo's search endpoint for anyone who finds the URL. A short TTL cache absorbs the
 * repeat queries a user's own keystrokes produce (the client also debounces, but two users
 * typing "Apple" within the same 5 minutes shouldn't cost two upstream calls either).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SEARCH_TTL_MS = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return apiOk({ results: [] });
  }

  try {
    const { value: results } = await cached(`symbol-search:${query.toLowerCase()}`, SEARCH_TTL_MS, () =>
      searchSymbols(query),
    );
    return apiOk({ results });
  } catch (err) {
    return apiError(err, `Failed to search for "${query}"`);
  }
}
