"use client";

import { Info } from "lucide-react";
import clsx from "clsx";

export interface GlossaryItem {
  term: string;
  definition: string;
}

/**
 * Plain-language definitions tucked behind a native `<details>` — the terms a newcomer needs,
 * costing no space until they ask. Content stays with the feature that owns it; only the widget
 * is shared, so the two derivatives tabs can't drift apart visually.
 *
 * `variant` picks how the panel sits: `popover` floats it over the content (for use in a tight
 * toolbar row), `inline` lets it push the page down.
 */
export function GlossaryDisclosure({
  label,
  items,
  variant = "inline",
}: {
  label: string;
  items: GlossaryItem[];
  variant?: "popover" | "inline";
}) {
  return (
    <details className={clsx("group text-xs", variant === "popover" && "relative")}>
      <summary className="flex cursor-pointer items-center gap-1 font-medium text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
        <Info size={13} aria-hidden="true" />
        {label}
      </summary>
      <div
        className={clsx(
          "mt-2 grid gap-2 rounded-lg border border-border-base p-3",
          variant === "popover"
            ? "absolute right-0 z-10 w-[min(90vw,440px)] bg-surface shadow-lg"
            : "bg-surface-muted sm:grid-cols-2",
        )}
      >
        {items.map((item) => (
          <p key={item.term}>
            <span className="font-semibold text-foreground">{item.term}</span>{" "}
            <span className="text-muted">— {item.definition}</span>
          </p>
        ))}
      </div>
    </details>
  );
}
