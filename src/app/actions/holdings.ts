"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifySession } from "@/lib/dal";
import { matchFifo } from "@/lib/fifo";
import { addTransaction, getUserTransactions, removeTransaction } from "@/lib/holdings-repo";
import type { Transaction } from "@/lib/types";

const MARKET_CURRENCY = { US: "USD", IN: "INR" } as const;
const MARKET_EXCHANGES = { US: ["NASDAQ", "NYSE"], IN: ["NSE", "BSE"] } as const;

const AddTradeSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, "Symbol is required")
    .max(20)
    .transform((s) => s.toUpperCase()),
  market: z.enum(["US", "IN"]),
  exchange: z.enum(["NASDAQ", "NYSE", "NSE", "BSE"]),
  name: z.string().trim().min(1, "Name is required").max(120),
  sector: z.string().trim().min(1, "Sector is required").max(60),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  price: z.coerce.number().positive("Price must be greater than 0"),
  fees: z.coerce.number().min(0, "Fees cannot be negative").default(0),
  tradeDate: z.iso.date("Enter a valid date"),
});

export interface AddTradeFormState {
  error?: string;
}

export async function addTrade(
  _prevState: AddTradeFormState,
  formData: FormData,
): Promise<AddTradeFormState> {
  const { userId } = await verifySession();

  const parsed = AddTradeSchema.safeParse({
    symbol: formData.get("symbol"),
    market: formData.get("market"),
    exchange: formData.get("exchange"),
    name: formData.get("name"),
    sector: formData.get("sector"),
    side: formData.get("side"),
    quantity: formData.get("quantity"),
    price: formData.get("price"),
    fees: formData.get("fees") || 0,
    tradeDate: formData.get("tradeDate"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  if (!(MARKET_EXCHANGES[data.market] as readonly string[]).includes(data.exchange)) {
    return { error: `${data.exchange} is not valid for the ${data.market} market` };
  }

  const trade = {
    symbol: data.symbol,
    exchange: data.exchange,
    market: data.market,
    name: data.name,
    sector: data.sector,
    side: data.side,
    quantity: data.quantity,
    price: data.price,
    fees: data.fees,
    currency: MARKET_CURRENCY[data.market],
    tradeDate: data.tradeDate,
  };

  if (data.side === "SELL") {
    // Validate against the *prospective* ledger using the same matcher that renders positions —
    // a rule enforced by a second implementation is a rule that eventually disagrees with itself.
    const existing = await instrumentTrades(userId, data.symbol, data.exchange);
    const { oversold } = matchFifo([...existing, { ...trade, id: "pending" }]);
    if (oversold) {
      const held = matchFifo(existing).openLots.reduce((sum, lot) => sum + lot.quantity, 0);
      return {
        error: `You only hold ${held} ${data.symbol} share${held === 1 ? "" : "s"} as of that date.`,
      };
    }
  }

  await addTransaction(userId, trade);

  revalidatePath("/portfolio");
  return {};
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  const { userId } = await verifySession();

  // Removing a buy that a later sell already consumed would leave the ledger selling shares it
  // never bought, so the same oversell check guards deletion.
  const all = await getUserTransactions(userId);
  const target = all.find((t) => t.id === transactionId);
  if (!target) return;

  if (target.side === "BUY") {
    const remaining = all.filter(
      (t) =>
        t.symbol === target.symbol && t.exchange === target.exchange && t.id !== transactionId,
    );
    if (matchFifo(remaining).oversold) {
      throw new Error(
        `Can't delete this purchase — a later sale of ${target.symbol} depends on it. Remove that sale first.`,
      );
    }
  }

  await removeTransaction(userId, transactionId);
  revalidatePath("/portfolio");
}

/** Every trade already recorded for one instrument, which is all `matchFifo` may be given. */
async function instrumentTrades(
  userId: string,
  symbol: string,
  exchange: string,
): Promise<Transaction[]> {
  const all = await getUserTransactions(userId);
  return all.filter((t) => t.symbol === symbol && t.exchange === exchange);
}
