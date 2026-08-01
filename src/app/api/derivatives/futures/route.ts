import { apiError, apiOk } from "@/lib/api";
import { getFuturesWatchlist } from "@/lib/derivatives-service";

/** GET /api/derivatives/futures — public, no auth, same for every visitor. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return apiOk({ contracts: await getFuturesWatchlist() });
  } catch (err) {
    return apiError(err, "Failed to load futures data");
  }
}
