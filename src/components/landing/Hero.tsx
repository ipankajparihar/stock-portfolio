import { Globe, ShieldCheck, Zap } from "lucide-react";
import { CtaButtons } from "@/components/landing/CtaButtons";
import { MarketPulse } from "@/components/market/MarketPulse";

/**
 * The top-of-page value proposition. Two columns on desktop: the pitch and CTA on the left,
 * a live market-pulse card on the right that proves the data is real before the visitor
 * commits to anything.
 */
export function Hero({ isAuthed }: { isAuthed: boolean }) {
  return (
    <section className="landing-hero-bg border-b border-border-base">
      <div className="mx-auto grid w-full max-w-[1400px] items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-24 lg:px-8">
        {/*
          Centred on mobile, left-aligned from `sm` up. On a narrow screen the column is barely
          wider than the text itself, so a centred block reads as deliberate composition; at
          desktop width the same centring would leave long ragged lines floating in the column,
          which is why it flips rather than applying everywhere.
        */}
        <div className="text-center sm:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-base bg-surface/70 px-3 py-1 text-xs font-medium text-muted-strong backdrop-blur">
            <span className="size-1.5 rounded-full bg-gain pulse-live" aria-hidden="true" />
            Live US &amp; India markets
          </span>

          <h1 className="mt-5 text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Track the markets.
            <br />
            <span className="text-gradient">Own your portfolio.</span>
          </h1>

          {/* `mx-auto` only matters once the paragraph is narrower than its column, i.e. at the
              widths where `max-w-xl` actually bites; `sm:mx-0` hands it back to the left edge. */}
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-strong sm:mx-0">
            Real-time prices, top movers, and a portfolio that tracks every purchase at its true
            cost basis — across the US and Indian markets, in one clean dashboard.
          </p>

          <div className="mt-8">
            <CtaButtons isAuthed={isAuthed} />
          </div>

          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-muted sm:justify-start">
            <TrustItem icon={<Zap size={15} />} label="Live quotes, refreshed every minute" />
            <TrustItem icon={<Globe size={15} />} label="US & India coverage" />
            <TrustItem icon={<ShieldCheck size={15} />} label="Free · sign in with Google" />
          </ul>
        </div>

        <MarketPulse />
      </div>
    </section>
  );
}

function TrustItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="inline-flex items-center gap-2">
      <span className="text-accent" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </li>
  );
}
