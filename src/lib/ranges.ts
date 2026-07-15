import type { RangeKey } from "@/lib/types";

/**
 * The chart's time windows.
 *
 * These live in their own module — free of any server import — because both the client (the
 * range tabs) and the server (validating `?range=`) need them. Exporting them from
 * `stock-service` instead would drag `yahoo-finance2` and its Node built-ins into the browser
 * bundle, which fails the build outright.
 */
export const VALID_RANGES: RangeKey[] = ["1D", "5D", "1M", "6M", "1Y", "5Y"];

/** Narrows an untrusted query-string value to a real range, so `?range=` can't inject anything. */
export function isValidRange(value: string): value is RangeKey {
  return (VALID_RANGES as string[]).includes(value);
}
