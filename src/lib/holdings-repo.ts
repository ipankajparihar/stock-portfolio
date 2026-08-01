import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { holdingLots, watchlist } from "@/db/schema";
import type { Exchange, Holding, HoldingLot, Market, WatchlistEntry } from "@/lib/types";

/**
 * Reads every purchase lot for a user and collapses lots on the same `(symbol, exchange)`
 * into one aggregated `Holding` — the shape the derivation pipeline in `portfolio-service.ts`
 * already expects. Quantity sums; purchase price becomes the weighted-average cost.
 */
export async function getUserHoldings(userId: string): Promise<Holding[]> {
  const lots = await db.query.holdingLots.findMany({
    where: eq(holdingLots.userId, userId),
  });

  const byPosition = new Map<string, HoldingLot[]>();
  for (const lot of lots) {
    const key = `${lot.symbol}:${lot.exchange}`;
    const bucket = byPosition.get(key);
    if (bucket) bucket.push(toHoldingLot(lot));
    else byPosition.set(key, [toHoldingLot(lot)]);
  }

  return [...byPosition.entries()].map(([id, positionLots]) => {
    const quantity = sum(positionLots.map((l) => l.quantity));
    const totalCost = sum(positionLots.map((l) => l.quantity * l.purchasePrice));
    const [first] = positionLots;

    return {
      id,
      name: first.name,
      symbol: first.symbol,
      exchange: first.exchange,
      market: first.market,
      currency: first.currency,
      sector: first.sector,
      purchasePrice: quantity === 0 ? 0 : totalCost / quantity,
      quantity,
    };
  });
}

export async function getUserLots(userId: string): Promise<HoldingLot[]> {
  const lots = await db.query.holdingLots.findMany({
    where: eq(holdingLots.userId, userId),
    orderBy: (t, { desc }) => [desc(t.purchaseDate)],
  });
  return lots.map(toHoldingLot);
}

export interface NewHoldingLot {
  symbol: string;
  exchange: Exchange;
  market: Market;
  name: string;
  sector: string;
  quantity: number;
  purchasePrice: number;
  currency: string;
  purchaseDate: string;
}

export async function addHoldingLot(userId: string, lot: NewHoldingLot): Promise<void> {
  await db.insert(holdingLots).values({ userId, ...lot });
}

export async function removeHoldingLot(userId: string, lotId: string): Promise<void> {
  await db
    .delete(holdingLots)
    .where(and(eq(holdingLots.id, lotId), eq(holdingLots.userId, userId)));
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export async function getUserWatchlist(userId: string): Promise<WatchlistEntry[]> {
  const rows = await db.query.watchlist.findMany({
    where: eq(watchlist.userId, userId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    exchange: r.exchange as Exchange,
    market: r.market,
    name: r.name,
  }));
}

export interface NewWatchlistEntry {
  symbol: string;
  exchange: Exchange;
  market: Market;
  name: string;
}

export async function addToWatchlist(userId: string, entry: NewWatchlistEntry): Promise<void> {
  await db
    .insert(watchlist)
    .values({ userId, ...entry })
    .onConflictDoNothing();
}

export async function removeFromWatchlist(userId: string, entryId: string): Promise<void> {
  await db
    .delete(watchlist)
    .where(and(eq(watchlist.id, entryId), eq(watchlist.userId, userId)));
}

function toHoldingLot(row: typeof holdingLots.$inferSelect): HoldingLot {
  return {
    id: row.id,
    symbol: row.symbol,
    exchange: row.exchange as Exchange,
    market: row.market,
    name: row.name,
    sector: row.sector,
    quantity: row.quantity,
    purchasePrice: row.purchasePrice,
    currency: row.currency,
    purchaseDate: row.purchaseDate,
  };
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
