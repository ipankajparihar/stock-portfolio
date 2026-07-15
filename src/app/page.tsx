import { PortfolioDashboard } from "@/components/PortfolioDashboard";

/**
 * The dashboard is client-rendered on purpose.
 *
 * Its defining feature is a live, self-refreshing price feed, so there is nothing worth
 * prerendering: a server-rendered snapshot of prices would be stale before it reached the
 * browser, and it would put a slow provider fetch on the critical path of the first paint.
 * Instead the shell paints instantly with a skeleton and streams real data in from the Node
 * route handler.
 */
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <PortfolioDashboard />
    </main>
  );
}
