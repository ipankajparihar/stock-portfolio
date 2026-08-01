import { PortfolioDashboard } from "@/components/PortfolioDashboard";
import { ManageHoldingsSection } from "@/components/portfolio/ManageHoldingsSection";
import { verifySession } from "@/lib/dal";
import { getUserLots } from "@/lib/holdings-repo";

/**
 * The dashboard is client-rendered on purpose.
 *
 * Its defining feature is a live, self-refreshing price feed, so there is nothing worth
 * prerendering: a server-rendered snapshot of prices would be stale before it reached the
 * browser, and it would put a slow provider fetch on the critical path of the first paint.
 *
 * `verifySession()` gates the whole page — an unauthenticated visitor is redirected to
 * `/login` before any of this renders.
 */
export default async function PortfolioPage() {
  const { userId } = await verifySession();
  const lots = await getUserLots(userId);

  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <PortfolioDashboard />
      <ManageHoldingsSection lots={lots} />
    </main>
  );
}
