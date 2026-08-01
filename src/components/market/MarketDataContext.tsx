"use client";

import { createContext, useContext } from "react";
import { useMarketOverview } from "@/hooks/useMarketOverview";
import type { MarketOverviewResponse } from "@/lib/types";

interface MarketData {
  data: MarketOverviewResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

const MarketDataCtx = createContext<MarketData | null>(null);

/**
 * Runs the market-overview poll exactly once and shares it with every consumer below.
 *
 * The landing page shows the same live feed in three places — the ticker strip, the hero's
 * "market pulse" panel, and the full board. Without this they'd each mount their own poll and
 * hit `/api/market` three times a minute; with it there's one fetch loop and the whole page
 * updates in lockstep.
 */
export function MarketDataProvider({ children }: { children: React.ReactNode }) {
  const value = useMarketOverview();
  return <MarketDataCtx.Provider value={value}>{children}</MarketDataCtx.Provider>;
}

export function useMarketData(): MarketData {
  const value = useContext(MarketDataCtx);
  if (!value) {
    throw new Error("useMarketData must be used within a MarketDataProvider");
  }
  return value;
}
