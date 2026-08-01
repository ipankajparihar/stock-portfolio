import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { StockDetailView } from "@/components/stock/StockDetailView";
import { verifySession } from "@/lib/dal";
import { findUserSymbol } from "@/lib/stock-service";

/**
 * /stock/[symbol] — the detail page for a stock the user holds or is watching.
 *
 * The server component's only job is to resolve the symbol against the user's own data and
 * 404 if it isn't theirs. Everything below it is client-rendered for the same reason the
 * dashboard is: the page's whole point is a live, self-refreshing price, so there's nothing
 * worth prerendering.
 */

export async function generateMetadata({
  params,
}: PageProps<"/stock/[symbol]">): Promise<Metadata> {
  const { symbol } = await params;
  const { userId } = await verifySession();
  const entry = await findUserSymbol(userId, symbol);

  if (!entry) return { title: "Stock not found" };

  return {
    title: `${entry.name} (${entry.symbol}) — Live Price & Fundamentals`,
    description: `Live price, interactive price history, P/E ratio, latest earnings and your position in ${entry.name}.`,
  };
}

export default async function StockPage({ params }: PageProps<"/stock/[symbol]">) {
  const { symbol } = await params;
  const { userId } = await verifySession();

  // Resolve against the user's own data here rather than in the client: an unknown ticker
  // should be a real 404, not a page that renders and then apologises.
  const entry = await findUserSymbol(userId, symbol);
  if (!entry) notFound();

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
      <StockDetailView symbol={entry.symbol} />
    </main>
  );
}
