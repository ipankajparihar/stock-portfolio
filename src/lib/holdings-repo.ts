import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { transactions, watchlist } from "@/db/schema";
import {
  averageOpenCost,
  groupTradesByInstrument,
  matchFifo,
  openQuantity,
} from "@/lib/fifo";
import type {
  ClosedPosition,
  Exchange,
  Holding,
  Market,
  RealizedSale,
  Transaction,
  TradeSide,
  WatchlistEntry,
} from "@/lib/types";

/**
 * Collapses a user's trade ledger into current positions via FIFO matching.
 *
 * Returns the same `Holding` shape the derivation pipeline in `portfolio-service.ts` already
 * expects, so nothing downstream changed when sells arrived. Two things differ from the old
 * buy-only aggregation: `purchasePrice` is the weighted average of the shares *still held* (FIFO
 * has consumed the oldest lots, so averaging every lot ever bought would misstate it), and
 * fully-sold positions are dropped — a zero-quantity row would otherwise linger in the table, in
 * the quote cache key, and in `findUserSymbol`.
 */
export async function getUserHoldings(userId: string): Promise<Holding[]> {
  const trades = await getUserTransactions(userId);

  const holdings: Holding[] = [];
  for (const [id, instrumentTrades] of groupTradesByInstrument(trades)) {
    const { openLots } = matchFifo(instrumentTrades);
    const quantity = openQuantity(openLots);
    if (quantity <= 0) continue;

    // Identity comes from the most recent trade: a renamed company or reclassified sector should
    // reflect the latest information, not whichever row happened to be inserted first.
    const latest = instrumentTrades.reduce((a, b) => (a.tradeDate >= b.tradeDate ? a : b));

    holdings.push({
      id,
      name: latest.name,
      symbol: latest.symbol,
      exchange: latest.exchange,
      market: latest.market,
      currency: latest.currency,
      sector: latest.sector,
      purchasePrice: averageOpenCost(openLots),
      quantity,
    });
  }

  return holdings;
}

/** The raw ledger, newest trade first. */
export async function getUserTransactions(userId: string): Promise<Transaction[]> {
  const rows = await db.query.transactions.findMany({
    where: eq(transactions.userId, userId),
    orderBy: (t, { desc }) => [desc(t.tradeDate), desc(t.createdAt)],
  });
  return rows.map(toTransaction);
}

export interface RealizedResult {
  sales: RealizedSale[];
  closedPositions: ClosedPosition[];
  /** Instruments whose ledger sells more than it buys — should be unreachable via the write path. */
  oversoldSymbols: string[];
}

/** Every realized sale, plus one rolled-up `ClosedPosition` per instrument the user has sold from. */
export async function getRealized(userId: string): Promise<RealizedResult> {
  const trades = await getUserTransactions(userId);

  const sales: RealizedSale[] = [];
  const closedPositions: ClosedPosition[] = [];
  const oversoldSymbols: string[] = [];

  for (const [id, instrumentTrades] of groupTradesByInstrument(trades)) {
    const { openLots, realized, oversold } = matchFifo(instrumentTrades);
    if (oversold) oversoldSymbols.push(id);
    if (realized.length === 0) continue;

    sales.push(...realized);

    const first = realized[0];
    const proceeds = sumBy(realized, (r) => r.proceeds);
    const costBasis = sumBy(realized, (r) => r.costBasis);
    const realizedGain = proceeds - costBasis;

    closedPositions.push({
      id,
      symbol: first.symbol,
      name: first.name,
      exchange: first.exchange,
      market: first.market,
      currency: first.currency,
      sector: first.sector,
      quantitySold: sumBy(realized, (r) => r.quantity),
      proceeds,
      costBasis,
      realizedGain,
      realizedGainPercent: costBasis === 0 ? 0 : (realizedGain / costBasis) * 100,
      lastSellDate: realized.reduce((a, b) => (a.saleDate >= b.saleDate ? a : b)).saleDate,
      isFullyClosed: openQuantity(openLots) <= 0,
    });
  }

  return { sales, closedPositions, oversoldSymbols };
}

export interface NewTransaction {
  symbol: string;
  exchange: Exchange;
  market: Market;
  name: string;
  sector: string;
  side: TradeSide;
  quantity: number;
  price: number;
  fees: number;
  currency: string;
  tradeDate: string;
}

export async function addTransaction(userId: string, trade: NewTransaction): Promise<void> {
  await db.insert(transactions).values({ userId, ...trade });
}

export async function removeTransaction(userId: string, transactionId: string): Promise<void> {
  await db
    .delete(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));
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

function toTransaction(row: typeof transactions.$inferSelect): Transaction {
  return {
    id: row.id,
    symbol: row.symbol,
    exchange: row.exchange as Exchange,
    market: row.market,
    name: row.name,
    sector: row.sector,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    fees: row.fees,
    currency: row.currency,
    tradeDate: row.tradeDate,
  };
}

function sumBy<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}
