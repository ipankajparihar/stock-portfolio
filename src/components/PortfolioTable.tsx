"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown } from "lucide-react";
import clsx from "clsx";
import { GainLoss } from "@/components/ui/GainLoss";
import {
  formatCurrency,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatRatio,
  formatSignedPercent,
  directionOf,
} from "@/lib/format";
import type { PortfolioRow } from "@/lib/types";

/**
 * Per-column display hints. TanStack types `meta` as empty by default, so it has to be
 * augmented here for `meta.numeric` / `meta.sticky` to typecheck at the call sites below.
 *
 * These live on the column definition rather than being hardcoded per-cell so that
 * alignment and stickiness are declared once and applied by both `<th>` and `<td>` —
 * a header and its cells can't drift out of alignment.
 */
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- both params are required by the interface being augmented
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Right-align and apply tabular figures. */
    numeric?: boolean;
    /** Pin to the left edge during horizontal scroll. */
    sticky?: boolean;
    /** Fixed column width in px — see TABLE_MIN_WIDTH below for why these are explicit. */
    width: number;
  }
}

/**
 * Grouping renders one `<table>` per sector, and browsers size each table's columns
 * independently. With `auto` layout that means "Purchase Price" lands at a different x in
 * Technology than in Financials — the columns visibly fail to line up down the page.
 *
 * Fixing the layout and declaring widths up front makes every sector table share identical
 * geometry, so the whole page reads as one continuous grid.
 */
const TABLE_MIN_WIDTH = 1280;

/**
 * The portfolio table — all eleven columns from the brief.
 *
 * Layout rules that make a dense financial table readable:
 *  - Numbers right-aligned and tabular, so magnitudes line up and can be compared vertically.
 *  - Text left-aligned. Mixing the two is what makes finance tables feel unreadable.
 *  - The stock name column is sticky, so on a phone you can scroll to the P/E column and
 *    still know which row you're looking at.
 *  - Every derived column (Investment, Present Value, Gain/Loss) is computed server-side;
 *    this component only renders. Recomputing in the view is how a UI and its API drift apart.
 */

/** Sorting state lives in the parent so all sector tables sort in step with one another. */
interface PortfolioTableProps {
  rows: PortfolioRow[];
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
}

export const PortfolioTable = memo(function PortfolioTable({
  rows,
  sorting,
  onSortingChange,
}: PortfolioTableProps) {
  const router = useRouter();

  const table = useReactTable({
    data: rows,
    columns: COLUMNS,
    state: { sorting },
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // Rows are identified by holding id, not array index, so React reuses the right DOM
    // node across refreshes — without this the flash animation fires on the wrong row
    // whenever sort order changes.
    getRowId: (row) => row.id,
  });

  return (
    <div className="thin-scroll overflow-x-auto">
      <table
        className="w-full table-fixed border-collapse text-sm"
        style={{ minWidth: TABLE_MIN_WIDTH }}
      >
        {/* Widths declared once, applied identically by every sector's table. */}
        <colgroup>
          {COLUMNS.map((column) => (
            <col key={column.id} style={{ width: column.meta?.width }} />
          ))}
        </colgroup>

        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-border-base">
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const numeric = header.column.columnDef.meta?.numeric ?? false;
                const sticky = header.column.columnDef.meta?.sticky ?? false;

                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      sorted === "asc"
                        ? "ascending"
                        : sorted === "desc"
                          ? "descending"
                          : canSort
                            ? "none"
                            : undefined
                    }
                    className={clsx(
                      "bg-surface-muted px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted-strong",
                      numeric ? "text-right" : "text-left",
                      sticky && "sticky left-0 z-10",
                    )}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={clsx(
                          "inline-flex items-center gap-1 rounded transition-colors hover:text-foreground",
                          "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
                          numeric && "flex-row-reverse",
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIcon state={sorted} />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>

        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              // Convenience only — the anchor in the first cell is the accessible path.
              // Ignored when the user is selecting text, so you can still copy a figure out
              // of the table without being navigated away mid-drag.
              onClick={() => {
                if (window.getSelection()?.toString()) return;
                router.push(`/stock/${row.original.symbol}`);
              }}
              className="group cursor-pointer border-b border-border-base transition-colors last:border-0 hover:bg-surface-muted"
            >
              {row.getVisibleCells().map((cell) => {
                const numeric = cell.column.columnDef.meta?.numeric ?? false;
                const sticky = cell.column.columnDef.meta?.sticky ?? false;

                return (
                  <td
                    key={cell.id}
                    className={clsx(
                      "px-3 py-2.5 whitespace-nowrap",
                      numeric && "text-right tabular",
                      // The sticky cell needs its own background or rows scroll under it.
                      // `group-hover` keeps it in sync with the rest of the row's hover state.
                      sticky &&
                        "sticky left-0 z-10 bg-surface group-hover:bg-surface-muted",
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const COLUMNS: ColumnDef<PortfolioRow>[] = [
  {
    id: "particulars",
    accessorKey: "name",
    header: "Particulars",
    meta: { sticky: true, width: 200 },
    // A real <Link>, not a div with an onClick. The whole row is clickable too (see <tr>
    // below), but the anchor is what makes the row reachable by keyboard, focusable, and
    // openable in a new tab — the row handler is a convenience layered on top, never the
    // only way in.
    cell: ({ row }) => (
      <Link
        href={`/stock/${row.original.symbol}`}
        className="group/link flex flex-col rounded focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <span className="flex items-center gap-1 font-medium text-foreground group-hover/link:text-accent">
          {row.original.name}
          <ChevronRight
            size={13}
            aria-hidden="true"
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
          />
        </span>
        <span className="text-xs text-muted">{row.original.symbol}</span>
      </Link>
    ),
  },
  {
    id: "purchasePrice",
    accessorKey: "purchasePrice",
    header: "Purchase Price",
    meta: { numeric: true, width: 110 },
    cell: ({ getValue }) => formatPrice(getValue<number>()),
  },
  {
    id: "quantity",
    accessorKey: "quantity",
    header: "Qty",
    meta: { numeric: true, width: 60 },
    cell: ({ getValue }) => formatQuantity(getValue<number>()),
  },
  {
    id: "investment",
    accessorKey: "investment",
    header: "Investment",
    meta: { numeric: true, width: 105 },
    cell: ({ getValue }) => (
      <span className="font-medium">{formatCurrency(getValue<number>())}</span>
    ),
  },
  {
    id: "portfolioPercent",
    accessorKey: "portfolioPercent",
    header: "Portfolio %",
    meta: { numeric: true, width: 105 },
    // A weight is easier to feel as a bar than as a number, so show both.
    cell: ({ getValue }) => {
      const value = getValue<number>();
      return (
        <div className="flex items-center justify-end gap-2">
          <span className="text-muted">{formatPercent(value)}</span>
          <span
            className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-surface-muted"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full bg-accent"
              // Weights are single-digit %, so scale to the largest plausible weight
              // rather than 100% — otherwise every bar is an invisible sliver.
              style={{ width: `${Math.min(100, (value / 12) * 100)}%` }}
            />
          </span>
        </div>
      );
    },
  },
  {
    id: "exchange",
    accessorKey: "exchange",
    header: "NSE/BSE",
    meta: { width: 80 },
    cell: ({ getValue }) => (
      <span className="rounded border border-border-base bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-muted-strong">
        {getValue<string>()}
      </span>
    ),
  },
  {
    id: "cmp",
    accessorKey: "cmp",
    header: "CMP",
    meta: { numeric: true, width: 100 },
    cell: ({ row }) => <CmpCell row={row.original} />,
  },
  {
    id: "presentValue",
    accessorKey: "presentValue",
    header: "Present Value",
    meta: { numeric: true, width: 115 },
    cell: ({ getValue }) => (
      <span className="font-medium">{formatCurrency(getValue<number | null>())}</span>
    ),
  },
  {
    id: "gainLoss",
    accessorKey: "gainLoss",
    header: "Gain / Loss",
    meta: { numeric: true, width: 145 },
    cell: ({ row }) => (
      <div className="flex justify-end">
        <GainLoss
          value={row.original.gainLoss}
          percent={row.original.gainLossPercent}
          hideIcon
        />
      </div>
    ),
  },
  {
    id: "peRatio",
    accessorKey: "peRatio",
    header: "P/E Ratio",
    meta: { numeric: true, width: 85 },
    cell: ({ row }) => {
      const { peRatio, fundamentalsStatus } = row.original;

      if (peRatio == null) {
        return <UnavailableCell reason={fundamentalsStatus.message} />;
      }
      return (
        <span className={clsx(fundamentalsStatus.stale && "text-muted")}>
          {formatRatio(peRatio)}
        </span>
      );
    },
  },
  {
    id: "latestEarnings",
    accessorKey: "latestEarnings",
    header: "Latest Earnings",
    meta: { numeric: true, width: 175 },
    // EPS is the number, but Google also gives us the event ("EPS beat +2.54%"), which is
    // what an investor actually reacts to — so show both rather than throwing it away.
    cell: ({ row }) => {
      const { latestEarnings, earningsEvent, fundamentalsStatus } = row.original;

      if (latestEarnings == null && !earningsEvent) {
        return <UnavailableCell reason={fundamentalsStatus.message} />;
      }

      return (
        <div className="flex flex-col items-end">
          <span className="font-medium">
            {latestEarnings == null ? "—" : `${formatPrice(latestEarnings)} EPS`}
          </span>
          {earningsEvent && (
            <span
              className={clsx(
                // Bounded to the column's inner width so a long event string truncates
                // with an ellipsis (full text in the tooltip) instead of forcing the
                // fixed-layout column to overflow.
                "max-w-[150px] truncate text-xs",
                /beat/i.test(earningsEvent)
                  ? "text-gain"
                  : /miss/i.test(earningsEvent)
                    ? "text-loss"
                    : "text-muted",
              )}
              title={earningsEvent}
            >
              {earningsEvent}
            </span>
          )}
        </div>
      );
    },
  },
];

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/**
 * The live price cell — the only thing on screen that actually moves.
 *
 * On each refresh we compare against the previously-rendered price and flash the cell
 * green or red for ~1s. Without this, a 15s auto-refresh is invisible: the user has no
 * idea whether anything changed, or whether the page is even still updating.
 */
function CmpCell({ row }: { row: PortfolioRow }) {
  const { cmp, dayChangePercent, quoteStatus } = row;

  const previous = useRef<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const prior = previous.current;
    previous.current = cmp;

    // No flash on first paint — only on an actual change from a known previous value.
    if (prior == null || cmp == null || prior === cmp) return;

    setFlash(cmp > prior ? "up" : "down");
    const timer = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(timer);
  }, [cmp]);

  if (cmp == null) {
    return <UnavailableCell reason={quoteStatus.message} />;
  }

  const dayDirection = directionOf(dayChangePercent);

  return (
    <span
      className={clsx(
        "inline-flex flex-col items-end rounded px-1.5 py-0.5",
        flash === "up" && "flash-up",
        flash === "down" && "flash-down",
      )}
      // Announce price moves to screen readers, but politely — never interrupt.
      aria-live="polite"
    >
      <span className={clsx("font-semibold", quoteStatus.stale && "text-muted")}>
        {formatPrice(cmp)}
      </span>

      {dayChangePercent != null && (
        <span
          className={clsx(
            "text-xs font-medium",
            dayDirection === "up"
              ? "text-gain"
              : dayDirection === "down"
                ? "text-loss"
                : "text-muted",
          )}
          title="Change today"
        >
          {formatSignedPercent(dayChangePercent)}
        </span>
      )}

      {quoteStatus.stale && (
        <span className="text-[10px] text-warn" title={quoteStatus.message ?? undefined}>
          stale
        </span>
      )}
    </span>
  );
}

/**
 * A cell whose provider didn't return data.
 *
 * Explicitly "unavailable" with a hoverable reason — not a blank, and never a zero. In a
 * financial table an empty cell reads as "nothing", and "0" reads as a real value; both
 * are lies when the truth is "the scrape failed".
 */
function UnavailableCell({ reason }: { reason: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted"
      title={reason ?? "Data unavailable from provider"}
    >
      <AlertTriangle size={12} className="text-warn" aria-hidden="true" />
      <span>N/A</span>
    </span>
  );
}

function SortIcon({ state }: { state: false | "asc" | "desc" }) {
  if (state === "asc") return <ArrowUp size={12} aria-hidden="true" />;
  if (state === "desc") return <ArrowDown size={12} aria-hidden="true" />;
  return <ChevronsUpDown size={12} className="opacity-40" aria-hidden="true" />;
}
