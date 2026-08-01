"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifySession } from "@/lib/dal";
import { addHoldingLot, removeHoldingLot } from "@/lib/holdings-repo";

const MARKET_CURRENCY = { US: "USD", IN: "INR" } as const;
const MARKET_EXCHANGES = { US: ["NASDAQ", "NYSE"], IN: ["NSE", "BSE"] } as const;

const AddHoldingSchema = z.object({
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
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  purchasePrice: z.coerce.number().positive("Purchase price must be greater than 0"),
  purchaseDate: z.iso.date("Enter a valid date"),
});

export interface AddHoldingFormState {
  error?: string;
}

export async function addHolding(
  _prevState: AddHoldingFormState,
  formData: FormData,
): Promise<AddHoldingFormState> {
  const { userId } = await verifySession();

  const parsed = AddHoldingSchema.safeParse({
    symbol: formData.get("symbol"),
    market: formData.get("market"),
    exchange: formData.get("exchange"),
    name: formData.get("name"),
    sector: formData.get("sector"),
    quantity: formData.get("quantity"),
    purchasePrice: formData.get("purchasePrice"),
    purchaseDate: formData.get("purchaseDate"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  if (!(MARKET_EXCHANGES[data.market] as readonly string[]).includes(data.exchange)) {
    return { error: `${data.exchange} is not valid for the ${data.market} market` };
  }

  await addHoldingLot(userId, {
    symbol: data.symbol,
    exchange: data.exchange,
    market: data.market,
    name: data.name,
    sector: data.sector,
    quantity: data.quantity,
    purchasePrice: data.purchasePrice,
    currency: MARKET_CURRENCY[data.market],
    purchaseDate: data.purchaseDate,
  });

  revalidatePath("/portfolio");
  return {};
}

export async function deleteHoldingLot(lotId: string): Promise<void> {
  const { userId } = await verifySession();
  await removeHoldingLot(userId, lotId);
  revalidatePath("/portfolio");
}
