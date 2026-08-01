import { DerivativesDashboard } from "@/components/derivatives/DerivativesDashboard";

/**
 * Public, like the markets page — futures and options are exploratory market data, not
 * personal holdings, so there's no reason to gate this behind sign-in.
 */
export default function DerivativesPage() {
  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-1.5">
        <h1 className="text-xl font-semibold sm:text-2xl">Futures &amp; Options</h1>
        <p className="text-sm text-muted">
          Live futures contracts and real options chains, picked one at a time to keep things
          readable.
        </p>
      </header>

      <DerivativesDashboard />
    </main>
  );
}
