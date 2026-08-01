import { auth } from "@/auth";
import { Hero } from "@/components/landing/Hero";
import { FeatureGrid, SectionHeading } from "@/components/landing/FeatureGrid";
import { FinalCta } from "@/components/landing/FinalCta";
import { CryptoCommodityWatch } from "@/components/market/CryptoCommodityWatch";
import { MarketDataProvider } from "@/components/market/MarketDataContext";
import { MarketOverview } from "@/components/market/MarketOverview";
import { MarketTicker } from "@/components/market/MarketTicker";

/**
 * The public landing page — no auth required.
 *
 * Everything live (the ticker strip, the hero's market-pulse card, and the market board) is
 * wrapped in a single `MarketDataProvider`, so the whole page runs off one poll of `/api/market`
 * rather than three. The hero and CTA sections are session-aware server components; they render
 * inside the client provider as children, which the provider's live descendants read through
 * context regardless.
 */
export default async function Home() {
  const session = await auth();
  const isAuthed = !!session?.user;

  return (
    <MarketDataProvider>
      <MarketTicker />
      <Hero isAuthed={isAuthed} />

      <div className="mx-auto w-full max-w-[1400px] space-y-16 px-4 py-16 sm:px-6 lg:px-8">
        <FeatureGrid />

        <section id="markets" className="scroll-mt-20 space-y-6">
          <SectionHeading
            eyebrow="Today's markets"
            title="Where the market is moving right now"
            subtitle="Live index levels and the day's biggest gainers and losers, for the US and India."
          />
          <MarketOverview />
        </section>

        <section className="space-y-6">
          <SectionHeading
            eyebrow="Beyond equities"
            title="Crypto and commodities, live"
            subtitle="Top cryptocurrencies by market cap and the major commodity futures — gold, oil, and more."
          />
          <CryptoCommodityWatch />
        </section>

        <FinalCta isAuthed={isAuthed} />
      </div>
    </MarketDataProvider>
  );
}
