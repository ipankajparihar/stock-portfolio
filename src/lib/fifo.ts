import type { RealizedSale, Transaction } from "@/lib/types";

/**
 * FIFO cost-basis matching — the one piece of real domain logic in the portfolio.
 *
 * Deliberately pure and I/O-free: the same function decides what a position *is* when rendering and
 * whether a proposed trade is *legal* when writing. If validation and display disagreed about which
 * shares a sale consumed, the ledger could accept a trade it then refuses to show correctly.
 *
 * FIFO specifically because Indian equity taxation mandates it, and it is the default nearly
 * everywhere else — so one method serves both markets this app supports.
 */

/** A buy lot with some or all of its shares still held. */
export interface OpenLot {
  /** The BUY transaction this came from. */
  transactionId: string;
  quantity: number;
  price: number;
  /** Fees still attributable to the unsold remainder of this lot. */
  fees: number;
  tradeDate: string;
}

export interface FifoResult {
  /** What's still held, oldest first. */
  openLots: OpenLot[];
  realized: RealizedSale[];
  /** True when a SELL asked for more shares than were held at that point in time. */
  oversold: boolean;
}

const MS_PER_DAY = 86_400_000;

/** India's LTCG threshold (12 months) and the US long-term threshold (1 year) coincide at 365 days. */
const LONG_TERM_DAYS = 365;

/**
 * Trades are matched in trade-date order, falling back to insertion order for same-day trades —
 * a buy and a sell entered for the same date must resolve deterministically, and the buy has to be
 * available to the sell (you cannot sell what you have not yet bought).
 */
function chronologically(a: Transaction, b: Transaction): number {
  if (a.tradeDate !== b.tradeDate) return a.tradeDate < b.tradeDate ? -1 : 1;
  if (a.side !== b.side) return a.side === "BUY" ? -1 : 1;
  return 0;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / MS_PER_DAY));
}

/**
 * Match one symbol's trades. Callers must pass trades for a single (symbol, exchange) — mixing
 * instruments would silently match a sale against the wrong shares.
 */
export function matchFifo(trades: Transaction[]): FifoResult {
  const ordered = [...trades].sort(chronologically);
  const openLots: OpenLot[] = [];
  const realized: RealizedSale[] = [];
  let oversold = false;

  for (const trade of ordered) {
    if (trade.side === "BUY") {
      openLots.push({
        transactionId: trade.id,
        quantity: trade.quantity,
        price: trade.price,
        fees: trade.fees,
        tradeDate: trade.tradeDate,
      });
      continue;
    }

    let remaining = trade.quantity;
    let costBasis = 0;
    let oldestLotDate = trade.tradeDate;

    while (remaining > 0 && openLots.length > 0) {
      const lot = openLots[0];
      const taken = Math.min(remaining, lot.quantity);
      const share = taken / lot.quantity;

      // Buy-side fees follow the shares they were paid for, so a partial sale carries only its slice.
      costBasis += taken * lot.price + lot.fees * share;
      if (lot.tradeDate < oldestLotDate) oldestLotDate = lot.tradeDate;

      lot.quantity -= taken;
      lot.fees -= lot.fees * share;
      remaining -= taken;

      if (lot.quantity <= 0) openLots.shift();
    }

    if (remaining > 0) {
      // Nothing left to match against. Record what we could and flag it rather than inventing
      // negative holdings — the write path rejects this, so it only surfaces on corrupt data.
      oversold = true;
    }

    const quantitySold = trade.quantity - remaining;
    const proceeds = quantitySold * trade.price - trade.fees;
    const realizedGain = proceeds - costBasis;
    const holdingPeriodDays = daysBetween(oldestLotDate, trade.tradeDate);

    realized.push({
      transactionId: trade.id,
      symbol: trade.symbol,
      exchange: trade.exchange,
      market: trade.market,
      name: trade.name,
      sector: trade.sector,
      currency: trade.currency,
      quantity: quantitySold,
      proceeds,
      costBasis,
      realizedGain,
      realizedGainPercent: costBasis === 0 ? 0 : (realizedGain / costBasis) * 100,
      saleDate: trade.tradeDate,
      holdingPeriodDays,
      term: holdingPeriodDays >= LONG_TERM_DAYS ? "LONG" : "SHORT",
    });
  }

  return { openLots, realized, oversold };
}

/** Net shares still held after matching — 0 means the position is closed. */
export function openQuantity(lots: OpenLot[]): number {
  return lots.reduce((sum, lot) => sum + lot.quantity, 0);
}

/**
 * Weighted-average cost of the shares *still held*. Deliberately not the average of every lot ever
 * bought: once anything is sold, FIFO has consumed the oldest lots, and including them would
 * misstate the cost basis of what remains.
 */
export function averageOpenCost(lots: OpenLot[]): number {
  const quantity = openQuantity(lots);
  if (quantity === 0) return 0;
  const cost = lots.reduce((sum, lot) => sum + lot.quantity * lot.price + lot.fees, 0);
  return cost / quantity;
}

/** Groups a mixed ledger by instrument, since `matchFifo` must only ever see one symbol at a time. */
export function groupTradesByInstrument(trades: Transaction[]): Map<string, Transaction[]> {
  const grouped = new Map<string, Transaction[]>();
  for (const trade of trades) {
    const key = `${trade.symbol}:${trade.exchange}`;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(trade);
    else grouped.set(key, [trade]);
  }
  return grouped;
}
