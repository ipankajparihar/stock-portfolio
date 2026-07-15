import { AlertTriangle } from "lucide-react";
import clsx from "clsx";

/**
 * A provider problem worth telling the user about, without taking the page over.
 *
 * Both pages surface the same two kinds of trouble — a feed that failed, and a feed serving
 * stale data — so both render this. It sits *above* the data rather than replacing it: the
 * numbers on screen are still the last good ones, and blanking them to show an error would
 * throw away the only useful thing left.
 */
export function Banner({ tone, message }: { tone: "warn" | "error"; message: string }) {
  return (
    <div
      role="status"
      className={clsx(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm",
        tone === "error"
          ? "border-loss-border bg-loss-soft text-loss"
          : "border-warn-border bg-warn-soft text-warn",
      )}
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
