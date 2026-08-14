import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { portfolioSnapshots } from "@/db/schema";
import type { Market } from "@/lib/types";

export interface SnapshotInput {
  market: Market;
  currency: string;
  investment: number;
  presentValue: number;
  realizedGain: number;
}

export interface PortfolioSnapshot extends SnapshotInput {
  asOf: string;
}

/** Today's date in the market's own zone — a snapshot should be dated by its trading day. */
function todayInMarket(market: Market): string {
  const timeZone = market === "IN" ? "Asia/Kolkata" : "America/New_York";
  // en-CA formats as YYYY-MM-DD, which is exactly the `date` column's shape.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/**
 * Records what the portfolio is worth today, one row per market per day.
 *
 * Upserted on read rather than written by a cron: it needs no scheduling infrastructure, and the
 * unique `(userId, market, asOf)` constraint makes repeat page loads idempotent — the last load of
 * the day wins, which is the closest thing to a closing mark we can get for free.
 *
 * The honest limitation is that it only records on days the user opens the app; gaps are real and
 * a chart must interpolate or show them. A scheduled job can replace this later without touching
 * the table. Snapshots cannot be backfilled, which is why this ships now rather than with the chart.
 */
export async function recordSnapshots(userId: string, inputs: SnapshotInput[]): Promise<void> {
  if (inputs.length === 0) return;

  const values = inputs.map((input) => ({
    userId,
    market: input.market,
    currency: input.currency,
    asOf: todayInMarket(input.market),
    investment: input.investment,
    presentValue: input.presentValue,
    realizedGain: input.realizedGain,
  }));

  await db
    .insert(portfolioSnapshots)
    .values(values)
    .onConflictDoUpdate({
      target: [portfolioSnapshots.userId, portfolioSnapshots.market, portfolioSnapshots.asOf],
      set: {
        investment: sql`excluded."investment"`,
        presentValue: sql`excluded."presentValue"`,
        realizedGain: sql`excluded."realizedGain"`,
      },
    });
}

/** Chronological history for charting, oldest first. */
export async function getSnapshots(userId: string): Promise<PortfolioSnapshot[]> {
  const rows = await db.query.portfolioSnapshots.findMany({
    where: eq(portfolioSnapshots.userId, userId),
    orderBy: (t, { asc }) => [asc(t.asOf)],
  });

  return rows.map((row) => ({
    market: row.market,
    currency: row.currency,
    asOf: row.asOf,
    investment: row.investment,
    presentValue: row.presentValue,
    realizedGain: row.realizedGain,
  }));
}
