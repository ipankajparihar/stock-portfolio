"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifySession } from "@/lib/dal";
import { addToWatchlist, removeFromWatchlist } from "@/lib/holdings-repo";

const MARKET_EXCHANGES = { US: ["NASDAQ", "NYSE"], IN: ["NSE", "BSE"] } as const;

const AddWatchlistSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, "Symbol is required")
    .max(20)
    .transform((s) => s.toUpperCase()),
  market: z.enum(["US", "IN"]),
  exchange: z.enum(["NASDAQ", "NYSE", "NSE", "BSE"]),
  name: z.string().trim().min(1, "Name is required").max(120),
});

export interface AddWatchlistFormState {
  error?: string;
}

export async function addWatchlistEntry(
  _prevState: AddWatchlistFormState,
  formData: FormData,
): Promise<AddWatchlistFormState> {
  const { userId } = await verifySession();

  const parsed = AddWatchlistSchema.safeParse({
    symbol: formData.get("symbol"),
    market: formData.get("market"),
    exchange: formData.get("exchange"),
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  if (!(MARKET_EXCHANGES[data.market] as readonly string[]).includes(data.exchange)) {
    return { error: `${data.exchange} is not valid for the ${data.market} market` };
  }

  await addToWatchlist(userId, data);
  revalidatePath("/watchlist");
  return {};
}

export async function deleteWatchlistEntry(entryId: string): Promise<void> {
  const { userId } = await verifySession();
  await removeFromWatchlist(userId, entryId);
  revalidatePath("/watchlist");
}

export interface AddScreenedStockInput {
  symbol: string;
  market: "US" | "IN";
  exchange: "NASDAQ" | "NYSE" | "NSE" | "BSE";
  name: string;
}

/**
 * The screener result list calls this directly (not through a `<form>`) — each row already
 * has everything `AddWatchlistSchema` needs, straight from `ScreenedStock`, so there's no form
 * data to parse. Re-validated with the same schema regardless, since this is still
 * user-reachable input flowing into a DB write.
 */
export async function addScreenedStock(
  entry: AddScreenedStockInput,
): Promise<{ error?: string }> {
  const { userId } = await verifySession();

  const parsed = AddWatchlistSchema.safeParse(entry);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await addToWatchlist(userId, parsed.data);
  revalidatePath("/watchlist");
  return {};
}
