import { NextResponse } from "next/server";
import { errorMessage } from "@/lib/cache";

/**
 * The failure response every route handler returns.
 *
 * All three routes reach this only when *assembly itself* fell over — a provider being down
 * is already degraded into `warnings` and per-field status by the service layer, and still
 * returns a 200 with whatever data survived. So a body here means something genuinely
 * unexpected broke, which is why it's a 502 and why the detail is logged server-side rather
 * than left to the client to reconstruct.
 *
 * Centralised so the status, the log, the body shape and the cache header can't drift apart
 * between endpoints — three hand-maintained copies of a response contract is how a client
 * ends up parsing `detail` on two routes and `message` on the third.
 */
export function apiError(err: unknown, summary: string): NextResponse {
  console.error(`[api] ${summary}:`, err);

  return NextResponse.json(
    { error: summary, detail: errorMessage(err) },
    { status: 502, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * The success response. `no-store` because the service layer's TTLs already own freshness —
 * a second, conflicting staleness window in a CDN or the browser would only fight them.
 */
export function apiOk<T>(payload: T): NextResponse {
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store, must-revalidate" },
  });
}
