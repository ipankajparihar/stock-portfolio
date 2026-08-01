"use client";

import { memo, useMemo, useTransition } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type SortingState,
} from "@tanstack/react-table";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown, Trash2 } from "lucide-react";
import clsx from "clsx";
import { deleteWatchlistEntry } from "@/app/actions/watchlist";
import { directionOf, formatPrice, formatRatio, formatSignedPercent } from "@/lib/format";
import type { WatchlistRow } from "@/lib/watchlist-service";

// Reuses the `ColumnMeta` (numeric/sticky/width) module augmentation declared in
// `PortfolioTable.tsx` — both tables are part of the same program, so the merged type applies
// here too without a second declaration.

const TABLE_MIN_WIDTH = 1080;

/**
 * The industry-standard watchlist view: every column a real screener sorts by — price, day
 * change, open, previous close, the 52-week range, P/E — click any header to sort by it. The
 * card grid is for a glance; this is for actually comparing stocks against each other.
 */
interface WatchlistTableProps {
  rows: WatchlistRow[];
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  /** Called after a row is successfully removed, so the parent can refetch immediately. */
  onRemoved?: () => void;
}

export const WatchlistTable = memo(function WatchlistTable({
  rows,
  sorting,
  onSortingChange,
  onRemoved,
}: WatchlistTableProps) {
  const columns = useMemo(() => buildColumns(onRemoved), [onRemoved]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <div className="thin-scroll overflow-x-auto rounded-xl border border-border-base bg-surface shadow-sm">
      <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: TABLE_MIN_WIDTH }}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.id} style={{ width: column.meta?.width }} />
          ))}
        </colgroup>

        <thead>
          <tr className="border-b border-border-base">
            {table.getHeaderGroups()[0].headers.map((header) => {
              const canSort = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
              const numeric = header.column.columnDef.meta?.numeric ?? false;
              const sticky = header.column.columnDef.meta?.sticky ?? false;

              return (
                <th
                  key={header.id}
                  scope="col"
                  aria-sort={
                    sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : canSort ? "none" : undefined
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
        </thead>

        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="group border-b border-border-base transition-colors last:border-0 hover:bg-surface-muted">
              {row.getVisibleCells().map((cell) => {
                const numeric = cell.column.columnDef.meta?.numeric ?? false;
                const sticky = cell.column.columnDef.meta?.sticky ?? false;

                return (
                  <td
                    key={cell.id}
                    className={clsx(
                      "px-3 py-2.5 whitespace-nowrap",
                      numeric && "text-right tabular",
                      sticky && "sticky left-0 z-10 bg-surface group-hover:bg-surface-muted",
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

function buildColumns(onRemoved?: () => void): ColumnDef<WatchlistRow>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      meta: { sticky: true, width: 190 },
      cell: ({ row }) => (
        <Link
          href={`/stock/${row.original.symbol}`}
          className="group/link flex flex-col rounded focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <span className="flex items-center gap-1 truncate font-medium text-foreground group-hover/link:text-accent">
            {row.original.name}
            <ChevronRight size={13} aria-hidden="true" className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
          </span>
          <span className="text-xs text-muted">{row.original.symbol}</span>
        </Link>
      ),
    },
    {
      id: "exchange",
      accessorKey: "exchange",
      header: "Exchange",
      meta: { width: 90 },
      cell: ({ getValue }) => (
        <span className="rounded border border-border-base bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-muted-strong">
          {getValue<string>()}
        </span>
      ),
    },
    {
      id: "cmp",
      accessorKey: "cmp",
      header: "Price",
      meta: { numeric: true, width: 100 },
      cell: ({ row }) => (
        <span className="font-semibold">{formatPrice(row.original.cmp, row.original.currency)}</span>
      ),
    },
    {
      id: "dayChangePercent",
      accessorKey: "dayChangePercent",
      header: "Change",
      meta: { numeric: true, width: 95 },
      cell: ({ getValue }) => {
        const value = getValue<number | null>();
        const direction = directionOf(value);
        return (
          <span
            className={clsx(
              "font-semibold",
              direction === "up" ? "text-gain" : direction === "down" ? "text-loss" : "text-muted",
            )}
          >
            {formatSignedPercent(value)}
          </span>
        );
      },
    },
    {
      id: "open",
      accessorKey: "open",
      header: "Open",
      meta: { numeric: true, width: 95 },
      cell: ({ row }) => formatPrice(row.original.open, row.original.currency),
    },
    {
      id: "previousClose",
      accessorKey: "previousClose",
      header: "Prev. Close",
      meta: { numeric: true, width: 105 },
      cell: ({ row }) => formatPrice(row.original.previousClose, row.original.currency),
    },
    {
      id: "fiftyTwoWeekLow",
      accessorKey: "fiftyTwoWeekLow",
      header: "52W Low",
      meta: { numeric: true, width: 100 },
      cell: ({ row }) => (
        <span className="text-muted">{formatPrice(row.original.fiftyTwoWeekLow, row.original.currency)}</span>
      ),
    },
    {
      id: "fiftyTwoWeekHigh",
      accessorKey: "fiftyTwoWeekHigh",
      header: "52W High",
      meta: { numeric: true, width: 100 },
      cell: ({ row }) => (
        <span className="text-muted">{formatPrice(row.original.fiftyTwoWeekHigh, row.original.currency)}</span>
      ),
    },
    {
      id: "peRatio",
      accessorKey: "peRatio",
      header: "P/E Ratio",
      meta: { numeric: true, width: 85 },
      cell: ({ getValue }) => {
        const value = getValue<number | null>();
        return value == null ? <span className="text-muted">N/A</span> : formatRatio(value);
      },
    },
    {
      id: "remove",
      header: "",
      enableSorting: false,
      meta: { width: 50 },
      cell: ({ row }) => <RemoveButton row={row.original} onRemoved={onRemoved} />,
    },
  ];
}

function RemoveButton({ row, onRemoved }: { row: WatchlistRow; onRemoved?: () => void }) {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      await deleteWatchlistEntry(row.id);
      onRemoved?.();
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={onClick}
      aria-label={`Remove ${row.symbol} from watchlist`}
      className="rounded p-1.5 text-muted opacity-0 transition-opacity hover:bg-loss-soft hover:text-loss focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none group-hover:opacity-100 disabled:opacity-50"
    >
      <Trash2 size={14} />
    </button>
  );
}

function SortIcon({ state }: { state: false | "asc" | "desc" }) {
  if (state === "asc") return <ArrowUp size={12} aria-hidden="true" />;
  if (state === "desc") return <ArrowDown size={12} aria-hidden="true" />;
  return <ChevronsUpDown size={12} className="opacity-40" aria-hidden="true" />;
}
