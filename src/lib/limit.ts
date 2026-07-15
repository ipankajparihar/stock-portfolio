/**
 * Minimal concurrency limiter.
 *
 * Google Finance has no batch endpoint, so N holdings means N page fetches. Firing all
 * of them at once is the fastest way to get rate-limited (HTTP 429) or IP-blocked. This
 * caps how many are in flight at a time — the difference between "a browser-like burst"
 * and "an obvious scraper".
 *
 * Unlike `Promise.all`, one rejection does not cancel the rest: results come back
 * position-matched as settled outcomes, so a single bad ticker can't wipe out the other
 * nineteen rows.
 */

export type Settled<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

/**
 * Run `task` over every item with at most `concurrency` in flight.
 * Results are returned in input order, each independently settled.
 */
export async function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<Settled<R>[]> {
  const results = new Array<Settled<R>>(items.length);
  let cursor = 0;

  // Each worker pulls the next index off a shared cursor until the queue drains.
  // This keeps exactly `concurrency` requests in flight even when tasks finish unevenly.
  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;

      try {
        results[index] = { ok: true, value: await task(items[index], index) };
      } catch (err) {
        results[index] = {
          ok: false,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    worker,
  );

  await Promise.all(workers);
  return results;
}
