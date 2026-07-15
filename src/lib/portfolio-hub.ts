import { FULL_INTERVAL_MS, QUOTE_INTERVAL_MS } from "@/lib/cadence";
import { errorMessage } from "@/lib/cache";
import { getPortfolio, getQuotes } from "@/lib/portfolio-service";
import type { PortfolioResponse, QuoteTick, StreamFrame } from "@/lib/types";

/**
 * The single upstream clock, shared by every connected browser.
 *
 * ## Why this exists
 *
 * Before, each tab ran its own timers and made its own requests: twenty tabs meant twenty
 * request cycles, and the server's TTL cache was the only thing standing between that and
 * twenty times the upstream traffic. The cache did its job, but the browser was still paying
 * for a request every 15 seconds, and the design only worked because a cache was quietly
 * absorbing the waste.
 *
 * Now the *server* holds one clock. It refreshes on its own schedule and pushes the result to
 * whoever is listening. A tab does not ask for data; it is told. Twenty tabs cost exactly what
 * one tab costs.
 *
 * ## The subscriber count is the on-switch
 *
 * The clock runs only while someone is actually listening. The last browser to disconnect stops
 * it, and the first to connect starts it again. This is what replaces the old "pause when the
 * tab is hidden" rule, and it's strictly stronger: before, a hidden tab stopped polling but the
 * server had no idea anyone had gone away. Now nobody watching means genuinely zero upstream
 * traffic — a dashboard left open on a forgotten monitor overnight costs nothing once its tab
 * is backgrounded and the browser drops the stream.
 *
 * ## Process-local, like the cache
 *
 * One hub per Node process. Behind a multi-instance deployment each instance would run its own
 * clock — same trade-off `cache.ts` already makes, and the fix is the same one: move the fan-out
 * to Redis pub/sub behind this same `subscribe` interface. Nothing outside this file would change.
 */

/**
 * What a subscriber is handed. The event name tells it which payload it got.
 *
 * The failure event is `upstream-error`, deliberately not `error`: `EventSource` already fires
 * a built-in `error` event when the *connection* drops, and a listener registered for that name
 * would receive both — conflating "the server couldn't reach Yahoo" (data problem, connection
 * fine, keep listening) with "the stream is down" (connection problem, no data at all). They
 * want opposite responses, so they get distinct names.
 */
export type PortfolioEvent =
  | { event: "portfolio"; frame: StreamFrame<PortfolioResponse> }
  | { event: "quotes"; frame: StreamFrame<QuoteTick> }
  | { event: "upstream-error"; frame: StreamFrame<{ message: string }> };

type Listener = (event: PortfolioEvent) => void;

const listeners = new Set<Listener>();

let timer: ReturnType<typeof setInterval> | null = null;
let cycling = false;

/** The last full payload, replayed to every new subscriber so a fresh tab paints immediately. */
let lastPortfolio: PortfolioResponse | null = null;
/** Epoch ms `lastPortfolio` was built — drives when the next *full* refresh is due. */
let lastFullAt = 0;
/** Epoch ms the next cycle is expected to run. Sent to clients so their countdown is honest. */
let nextTickAt = 0;

/**
 * Start listening. Returns the unsubscribe function.
 *
 * A new subscriber is brought up to date immediately rather than being left staring at a
 * skeleton until the next cycle: if a recent full payload exists it's replayed at once, and if
 * it doesn't, one is fetched. Either way the caller gets a `portfolio` event as its first frame,
 * so the client needs no separate initial request — the stream *is* the initial load.
 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  if (lastPortfolio) {
    listener({ event: "portfolio", frame: { data: lastPortfolio, nextTickAt } });
  } else {
    // No snapshot yet — this is the first subscriber since the process started (or since the
    // last one left and the clock stopped). Kick a cycle to build one.
    void cycle();
  }

  // First one in turns the clock on.
  if (!timer) {
    timer = setInterval(() => void cycle(), QUOTE_INTERVAL_MS);
    nextTickAt = Date.now() + QUOTE_INTERVAL_MS;
    console.log("[hub] clock started — upstream refresh every %dms", QUOTE_INTERVAL_MS);
  }

  return () => {
    listeners.delete(listener);

    // Last one out turns it off. No listeners means no reason to touch Yahoo at all.
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
      console.log("[hub] clock stopped — no listeners, upstream traffic is now zero");
    }
  };
}

/**
 * One turn of the clock: fetch, then push to everyone.
 *
 * Which of the two payloads gets built is decided here rather than by two independent timers.
 * A full refresh carries fresh prices anyway, so running a quote cycle alongside it would fetch
 * prices we already have — the same reasoning the client's two clocks used, now in one place.
 */
async function cycle(): Promise<void> {
  // A slow upstream must delay the next cycle, not stack another one behind it.
  if (cycling) return;
  cycling = true;

  try {
    const needsFull = !lastPortfolio || Date.now() - lastFullAt >= FULL_INTERVAL_MS;

    if (needsFull) {
      const portfolio = await getPortfolio();
      lastPortfolio = portfolio;
      lastFullAt = Date.now();
      nextTickAt = lastFullAt + QUOTE_INTERVAL_MS;

      broadcast({ event: "portfolio", frame: { data: portfolio, nextTickAt } });
    } else {
      const quotes = await getQuotes();
      nextTickAt = Date.now() + QUOTE_INTERVAL_MS;

      broadcast({ event: "quotes", frame: { data: quotes, nextTickAt } });
    }
  } catch (err) {
    // Only reached if assembly itself failed — a provider being down is already degraded into
    // warnings by the service layer. Tell the clients rather than going silent on them: a stream
    // that simply stops emitting is indistinguishable from a quiet market.
    nextTickAt = Date.now() + QUOTE_INTERVAL_MS;
    broadcast({
      event: "upstream-error",
      frame: { data: { message: errorMessage(err) }, nextTickAt },
    });
  } finally {
    cycling = false;
  }
}

function broadcast(event: PortfolioEvent): void {
  for (const listener of listeners) {
    // One subscriber blowing up (a closed stream mid-write, say) must not rob the others of
    // this frame — and it must not kill the clock.
    try {
      listener(event);
    } catch {
      listeners.delete(listener);
    }
  }
}
