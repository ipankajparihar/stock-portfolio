import { WatchlistDashboard } from "@/components/watchlist/WatchlistDashboard";
import { verifySession } from "@/lib/dal";

/**
 * The dashboard is client-rendered on purpose — same reasoning as `/portfolio`: its defining
 * feature is a live, self-refreshing price feed, so there's nothing worth prerendering.
 * `verifySession()` gates the whole page before any of it renders.
 */
export default async function WatchlistPage() {
  await verifySession();

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <WatchlistDashboard />
    </main>
  );
}
