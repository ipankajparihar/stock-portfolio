import type { NextRequest } from "next/server";
import { subscribe } from "@/lib/portfolio-hub";

/**
 * GET /api/portfolio/stream — the live feed. Server-Sent Events, not polling.
 *
 * ## Why SSE and not a WebSocket
 *
 * A WebSocket is bidirectional, and this connection has nothing to say upstream — the browser
 * never sends anything, it only listens. Paying for a protocol upgrade to get a channel we'd use
 * in one direction would mean running a custom Node server (Next's Route Handlers cannot hold a
 * socket open across the response boundary), which in turn rules out serverless deployment.
 *
 * SSE gives us the half we actually need over plain HTTP, inside a normal Route Handler, and
 * throws in the one thing we'd otherwise hand-roll: `EventSource` reconnects on its own, with
 * backoff, when the connection drops. That is the whole of what a WebSocket would have bought
 * here, minus the custom server.
 *
 * ## What comes down it
 *
 * Two named events, on the schedule the hub owns:
 *   - `portfolio` — the whole payload, fundamentals included. Always the *first* frame, so the
 *     stream doubles as the initial load and the client makes no separate request to boot.
 *   - `quotes`    — a lean price patch, every 15s, spliced in client-side by `applyQuoteTick`.
 *   - `error`     — assembly failed upstream. Sent rather than going quiet, because a stream
 *     that stops emitting looks exactly like a market that stopped moving.
 */

// A live stream is per-request by definition; never prerender it.
export const dynamic = "force-dynamic";

// The hub holds a process-local clock and the scraper needs Node APIs, so pin it off the edge.
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // The browser can vanish at any moment (tab closed, laptop slept, network dropped). Once
      // it has, `enqueue` throws — so writes are gated on a flag we own rather than on catching
      // that throw after the fact, and the first sign of a dead client tears the subscription
      // down. Leaking a listener per dropped tab would keep the hub's clock running forever.
      let open = true;

      const unsubscribe = subscribe(({ event, frame }) => {
        if (!open) return;

        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(frame)}\n\n`));
        } catch {
          close();
        }
      });

      function close() {
        if (!open) return;
        open = false;

        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime — nothing to do.
        }
      }

      // Fires when the client disconnects. This is what lets the hub notice the last listener
      // leaving and stop touching Yahoo altogether.
      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // `no-transform` and the nginx hint matter as much as `no-store`: a proxy that buffers
      // this response to "optimise" it turns a live feed into a request that never completes.
      "Cache-Control": "no-store, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
