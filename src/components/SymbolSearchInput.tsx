"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import clsx from "clsx";
import { useSymbolSearch } from "@/hooks/useSymbolSearch";
import type { SymbolSearchResult } from "@/lib/types";

interface SymbolSearchInputProps {
  /** Called when the user picks a suggestion — the caller fills the rest of the form from it. */
  onSelect: (result: SymbolSearchResult) => void;
  placeholder?: string;
}

/**
 * A company-name/ticker combobox. Free text stays local to this component — the parent form
 * only hears about a *selection*, via `onSelect`, which is when it has a real symbol, exchange,
 * and (usually) sector to fill the rest of the form with.
 */
export function SymbolSearchInput({ onSelect, placeholder }: SymbolSearchInputProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const { results, isLoading } = useSymbolSearch(query);
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside closes the dropdown — a combobox left open after the user clicks elsewhere
  // reads as stuck, not helpful.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function select(result: SymbolSearchResult) {
    onSelect(result);
    setQuery(`${result.name} (${result.symbol})`);
    setIsOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(results[highlighted]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? "Search company name or ticker…"}
          className="input pl-9"
          autoComplete="off"
        />
        {isLoading && (
          <Loader2
            size={14}
            className="absolute top-1/2 right-3 -translate-y-1/2 animate-spin text-muted"
            aria-hidden="true"
          />
        )}
      </div>

      {isOpen && (results.length > 0 || isLoading) && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border-base bg-surface py-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">Searching…</li>
          ) : (
            results.map((result, i) => (
              <li key={`${result.exchange}:${result.symbol}`} role="option" aria-selected={i === highlighted}>
                <button
                  type="button"
                  onClick={() => select(result)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={clsx(
                    "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                    i === highlighted ? "bg-surface-muted" : "hover:bg-surface-muted",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{result.name}</span>
                    <span className="ml-1.5 text-muted">{result.symbol}</span>
                  </span>
                  <span className="shrink-0 rounded border border-border-base bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-muted-strong">
                    {result.exchange}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
