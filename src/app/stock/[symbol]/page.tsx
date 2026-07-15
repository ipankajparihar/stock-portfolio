import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { StockDetailView } from "@/components/stock/StockDetailView";
import { HOLDINGS } from "@/data/holdings";
import { findHolding } from "@/lib/stock-service";

/**
 * /stock/[symbol] — the detail page for one holding.
 *
 * The server component's only job is to resolve the symbol against the portfolio and 404 if
 * it isn't ours. Everything below it is client-rendered for the same reason the dashboard is:
 * the page's whole point is a live, self-refreshing price, so there's nothing worth
 * prerendering.
 */

/** Pre-render the shell for every holding — the set is known at build time and small. */
export function generateStaticParams() {
  return HOLDINGS.map((holding) => ({ symbol: holding.symbol }));
}

export async function generateMetadata({
  params,
}: PageProps<"/stock/[symbol]">): Promise<Metadata> {
  const { symbol } = await params;
  const holding = findHolding(symbol);

  if (!holding) return { title: "Stock not found" };

  return {
    title: `${holding.name} (${holding.symbol}) — Live Price & Fundamentals`,
    description: `Live price, interactive price history, P/E ratio, latest earnings and your position in ${holding.name}.`,
  };
}

export default async function StockPage({ params }: PageProps<"/stock/[symbol]">) {
  const { symbol } = await params;

  // Resolve against the portfolio here rather than in the client: an unknown ticker should be
  // a real 404, not a page that renders and then apologises.
  const holding = findHolding(symbol);
  if (!holding) notFound();

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
      <StockDetailView symbol={holding.symbol} />
    </main>
  );
}
