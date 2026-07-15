/**
 * A tiny in-memory TTL cache with stale-while-error semantics.
 *
 * Scraped/unofficial endpoints fail intermittently and rate-limit aggressively, so
 * two behaviours matter more than raw hit rate:
 *
 *   1. Requests for the same key made concurrently share one in-flight promise
 *      (dogpile prevention). Twenty rows asking for the same quote batch at the
 *      same instant must produce exactly one upstream call.
 *   2. If a refresh throws, the previous value is served instead of an error, and
 *      flagged `stale`. A blank price column is a worse user experience than a
 *      price that is thirty seconds old.
 *
 * Process-local by design: it lives in the Node server, never the browser, so
 * scraping credentials/behaviour are never exposed client-side. For a multi-instance
 * deployment this would be swapped for Redis behind the same interface.
 */

interface Entry<T> {
  value: T;
  /** Epoch ms the value was fetched. */
  fetchedAt: number;
  /** In-flight refresh, if one is running. Shared by concurrent callers. */
  inflight: Promise<T> | null;
}

/** What a cache read produced, and how much to trust it. */
export interface CacheResult<T> {
  value: T;
  fetchedAt: number;
  /** True when the refresh failed and this is a previously-cached value. */
  stale: boolean;
  /** Populated when `stale` is true. */
  error: string | null;
}

const store = new Map<string, Entry<unknown>>();

/**
 * Return a cached value, refreshing it via `loader` when older than `ttlMs`.
 *
 * Throws only when there is no usable value at all — i.e. the loader failed *and*
 * nothing was previously cached. Otherwise a stale value is returned with
 * `stale: true` so the caller can surface that in the UI.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<CacheResult<T>> {
  const now = Date.now();
  const entry = store.get(key) as Entry<T> | undefined;
  const isFresh = entry && now - entry.fetchedAt < ttlMs;

  if (entry && isFresh) {
    return { value: entry.value, fetchedAt: entry.fetchedAt, stale: false, error: null };
  }

  // Dogpile prevention: join the refresh already in flight rather than starting another.
  if (entry?.inflight) {
    try {
      const value = await entry.inflight;
      return { value, fetchedAt: store.get(key)!.fetchedAt, stale: false, error: null };
    } catch (err) {
      // The shared refresh failed. Fall through to serve this entry's stale value.
      return {
        value: entry.value,
        fetchedAt: entry.fetchedAt,
        stale: true,
        error: errorMessage(err),
      };
    }
  }

  const inflight = loader();

  // Register the in-flight promise so concurrent callers join instead of duplicating.
  // Keep any existing value around so a failure can still fall back to it.
  store.set(key, {
    value: entry?.value as T,
    fetchedAt: entry?.fetchedAt ?? 0,
    inflight,
  });

  try {
    const value = await inflight;
    store.set(key, { value, fetchedAt: Date.now(), inflight: null });
    return { value, fetchedAt: Date.now(), stale: false, error: null };
  } catch (err) {
    if (entry && entry.fetchedAt > 0) {
      // Serve the last good value rather than failing the whole dashboard.
      store.set(key, { value: entry.value, fetchedAt: entry.fetchedAt, inflight: null });
      return {
        value: entry.value,
        fetchedAt: entry.fetchedAt,
        stale: true,
        error: errorMessage(err),
      };
    }
    // Nothing cached and the loader failed — the caller must handle this.
    store.delete(key);
    throw err;
  }
}

/** The one place an unknown thrown value becomes a string. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Test/debug helper — drops all cached entries. */
export function clearCache(): void {
  store.clear();
}
