/**
 * Assertion script for the FIFO matcher. The repo has no test framework, so this stands in for one:
 * `npx tsx scripts/fifo-check.ts`. Run it before trusting realized P&L anywhere.
 */
import { averageOpenCost, matchFifo, openQuantity } from "@/lib/fifo";
import type { Transaction, TradeSide } from "@/lib/types";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = typeof actual === "number" ? Math.round(actual * 1e6) / 1e6 : actual;
  const e = typeof expected === "number" ? Math.round(expected * 1e6) / 1e6 : expected;
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${ok ? "" : `  (got ${a}, want ${e})`}`);
}

let seq = 0;
function trade(side: TradeSide, quantity: number, price: number, tradeDate: string, fees = 0): Transaction {
  return {
    id: `t${++seq}`,
    symbol: "AAPL",
    exchange: "NASDAQ",
    market: "US",
    name: "Apple Inc.",
    sector: "Technology",
    side,
    quantity,
    price,
    fees,
    currency: "USD",
    tradeDate,
  };
}

console.log("\n1. Single buy, partial sell");
{
  const r = matchFifo([trade("BUY", 100, 10, "2026-01-01"), trade("SELL", 40, 15, "2026-02-01")]);
  check("open quantity is 60", openQuantity(r.openLots), 60);
  check("cost basis of sale = 40 x 10", r.realized[0].costBasis, 400);
  check("proceeds = 40 x 15", r.realized[0].proceeds, 600);
  check("realized gain = 200", r.realized[0].realizedGain, 200);
  check("realized gain % = 50", r.realized[0].realizedGainPercent, 50);
  check("not oversold", r.oversold, false);
  check("avg cost of remainder still 10", averageOpenCost(r.openLots), 10);
}

console.log("\n2. Sell spanning three lots (FIFO order matters)");
{
  const r = matchFifo([
    trade("BUY", 10, 10, "2026-01-01"),
    trade("BUY", 10, 20, "2026-01-02"),
    trade("BUY", 10, 30, "2026-01-03"),
    trade("SELL", 25, 40, "2026-06-01"),
  ]);
  // Oldest first: 10@10 + 10@20 + 5@30 = 100 + 200 + 150 = 450
  check("cost basis follows FIFO, not average", r.realized[0].costBasis, 450);
  check("open quantity is 5", openQuantity(r.openLots), 5);
  check("remaining lot is the newest, priced 30", averageOpenCost(r.openLots), 30);
}

console.log("\n3. Full close");
{
  const r = matchFifo([trade("BUY", 50, 10, "2026-01-01"), trade("SELL", 50, 12, "2026-03-01")]);
  check("no open lots remain", r.openLots.length, 0);
  check("open quantity is 0", openQuantity(r.openLots), 0);
  check("avg cost of nothing is 0 (no divide-by-zero)", averageOpenCost(r.openLots), 0);
  check("realized gain = 100", r.realized[0].realizedGain, 100);
}

console.log("\n4. Oversell is flagged, never negative");
{
  const r = matchFifo([trade("BUY", 10, 10, "2026-01-01"), trade("SELL", 25, 12, "2026-03-01")]);
  check("oversold flag set", r.oversold, true);
  check("open quantity floors at 0", openQuantity(r.openLots), 0);
  check("only the matchable 10 shares realize", r.realized[0].quantity, 10);
}

console.log("\n5. Holding-period boundary (365 days)");
{
  const shortHold = matchFifo([
    trade("BUY", 1, 10, "2025-01-01"),
    trade("SELL", 1, 12, "2025-12-31"), // 364 days
  ]);
  check("364 days is SHORT", shortHold.realized[0].term, "SHORT");
  check("holding period computed", shortHold.realized[0].holdingPeriodDays, 364);

  const exact = matchFifo([trade("BUY", 1, 10, "2025-01-01"), trade("SELL", 1, 12, "2026-01-01")]);
  check("exactly 365 days is LONG", exact.realized[0].term, "LONG");

  const longHold = matchFifo([trade("BUY", 1, 10, "2025-01-01"), trade("SELL", 1, 12, "2026-01-02")]);
  check("366 days is LONG", longHold.realized[0].term, "LONG");
}

console.log("\n6. Fees reduce realized gain on both sides");
{
  const r = matchFifo([
    trade("BUY", 100, 10, "2026-01-01", 50), // 1000 cost + 50 fees
    trade("SELL", 100, 12, "2026-03-01", 30), // 1200 proceeds - 30 fees
  ]);
  check("cost basis includes buy fees", r.realized[0].costBasis, 1050);
  check("proceeds net of sell fees", r.realized[0].proceeds, 1170);
  check("realized gain = 120", r.realized[0].realizedGain, 120);
}

console.log("\n7. Partial sale apportions buy fees proportionally");
{
  const r = matchFifo([
    trade("BUY", 100, 10, "2026-01-01", 50),
    trade("SELL", 25, 12, "2026-03-01"), // takes 25% of the lot -> 25% of the fees
  ]);
  check("cost basis = 250 + 12.5 fees", r.realized[0].costBasis, 262.5);
  check("remaining lot keeps the other 37.5 of fees", r.openLots[0].fees, 37.5);
}

console.log("\n8. Same-day buy and sell: the buy is available to the sell");
{
  const r = matchFifo([trade("SELL", 5, 12, "2026-01-01"), trade("BUY", 10, 10, "2026-01-01")]);
  check("not oversold despite sell listed first", r.oversold, false);
  check("open quantity is 5", openQuantity(r.openLots), 5);
}

console.log("\n9. Buy after a full close reopens the position cleanly");
{
  const r = matchFifo([
    trade("BUY", 10, 10, "2026-01-01"),
    trade("SELL", 10, 12, "2026-02-01"),
    trade("BUY", 20, 15, "2026-03-01"),
  ]);
  check("open quantity is 20", openQuantity(r.openLots), 20);
  check("avg cost is the new lot's 15", averageOpenCost(r.openLots), 15);
  check("one realized sale recorded", r.realized.length, 1);
}

console.log(
  failures === 0 ? "\nALL PASS\n" : `\n${failures} ASSERTION(S) FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
