import type {
  FieldStatus,
  PortfolioResponse,
  PortfolioRow,
  QuoteTick,
  QuoteTickRow,
  Totals,
} from "@/lib/types";

/**
 * Splices a quote tick into the full payload already on screen.
 *
 * **Object identity is the whole point here, not a micro-optimisation.** Every component
 * below the dashboard is `memo`'d, so any row, sector or totals object handed back unchanged
 * is a subtree React skips entirely. That is what turns a 15s price tick into a repaint of
 * just the cells whose price actually moved, rather than a re-render of twenty rows, two
 * charts and four summary cards — which is what "refresh the price, not the page" means in
 * practice. Spreading the tick over the previous payload unconditionally would produce
 * identical *pixels* and re-render *everything*.
 *
 * So every level compares before it copies, and returns the previous object when nothing it
 * owns has moved.
 */
export function applyQuoteTick(prev: PortfolioResponse, tick: QuoteTick): PortfolioResponse {
  const patches = new Map(tick.rows.map((row) => [row.id, row]));
  let anySectorMoved = false;

  const sectors = prev.sectors.map((group) => {
    const nextTotals = tick.sectorTotals[group.sector];

    let anyRowMoved = false;
    const rows = group.rows.map((row) => {
      const patch = patches.get(row.id);
      if (!patch || !rowMoved(row, patch)) return row;

      anyRowMoved = true;
      return { ...row, ...patch };
    });

    // A sector the tick didn't mention (a holding added since the last full refresh, say)
    // keeps its existing subtotals rather than being blanked. The next full refresh, which
    // rebuilds the payload from scratch, is what reconciles a changed holdings list.
    const totalsMoved = nextTotals != null && !totalsEqual(group, nextTotals);
    if (!anyRowMoved && !totalsMoved) return group;

    anySectorMoved = true;
    // Falling back to `group` rather than `{}` when the tick omitted this sector: same values
    // either way, but spreading a known `Totals` keeps the result provably a `SectorGroup`
    // instead of needing a cast to assert it.
    return {
      ...group,
      ...(nextTotals ?? group),
      rows: anyRowMoved ? rows : group.rows,
    };
  });

  return {
    ...prev,
    sectors: anySectorMoved ? sectors : prev.sectors,
    totals: totalsEqual(prev.totals, tick.totals) ? prev.totals : tick.totals,

    // `updatedAt` always advances, even when no price moved: it answers "when did we last
    // *hear* from the feed", which is exactly the question a user asks of a quiet dashboard.
    // It lives on the payload root, so bumping it costs one shallow copy and dirties nothing
    // below it.
    updatedAt: tick.updatedAt,
    marketState: tick.marketState,

    // Only the price feed's warnings are the tick's to replace. Whatever the last full
    // refresh said about Google's scrape is left exactly as it was.
    quoteWarnings: sameMessages(prev.quoteWarnings, tick.warnings)
      ? prev.quoteWarnings
      : tick.warnings,
  };
}

/**
 * Has anything about this row that the table actually *renders* changed?
 *
 * `presentValue`, `gainLoss` and `gainLossPercent` are deliberately not compared: each is a
 * pure function of `cmp` and the holding's static cost basis, so they cannot move unless
 * `cmp` did.
 *
 * `quoteStatus.fetchedAt` is deliberately not compared either. It advances on every
 * successful poll even when the price is identical, so counting it as a change would dirty
 * every row every 15 seconds — precisely the whole-page re-render this split exists to
 * prevent. Nothing renders a per-row fetch time; freshness is reported once, at the top of
 * the page, from `updatedAt`. (It's a payload-level fact regardless: one batched Yahoo call
 * fetches every row, so the value is the same across all of them.)
 */
function rowMoved(row: PortfolioRow, patch: QuoteTickRow): boolean {
  return (
    row.cmp !== patch.cmp ||
    row.dayChange !== patch.dayChange ||
    row.dayChangePercent !== patch.dayChangePercent ||
    !statusRendersSame(row.quoteStatus, patch.quoteStatus)
  );
}

function statusRendersSame(a: FieldStatus, b: FieldStatus): boolean {
  return a.stale === b.stale && a.failed === b.failed && a.message === b.message;
}

function totalsEqual(a: Totals, b: Totals): boolean {
  return (
    a.investment === b.investment &&
    a.presentValue === b.presentValue &&
    a.gainLoss === b.gainLoss &&
    a.gainLossPercent === b.gainLossPercent &&
    a.portfolioPercent === b.portfolioPercent
  );
}

function sameMessages(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((message, i) => message === b[i]);
}
