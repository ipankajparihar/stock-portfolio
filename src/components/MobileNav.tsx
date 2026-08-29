"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import clsx from "clsx";
import { navLinksFor } from "@/components/NavLinks";

/**
 * The mobile header nav.
 *
 * Below `sm` the inline row doesn't fit: the wordmark plus four destinations plus the auth button
 * overflows a 390px screen, and shrinking the text to fit would put every tap target under the
 * ~44px minimum. So the destinations collapse behind one button and open as a full-width sheet
 * where each row is comfortably tappable.
 *
 * The auth form is passed in as a node rather than rebuilt here: it wraps a server action that
 * only the server component can define, and duplicating a sign-in button is how the two versions
 * drift apart.
 */
export function MobileNav({
  isAuthed,
  authAction,
}: {
  isAuthed: boolean;
  authAction: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Navigating is the whole point of the menu, so it should get out of the way once you have.
  useEffect(() => {
    // Microtask, not the effect body: setting state directly here would cascade an extra render.
    queueMicrotask(() => setIsOpen(false));
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const links = navLinksFor(isAuthed);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls="mobile-nav"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        className={clsx(
          "-mr-2 inline-flex size-11 items-center justify-center rounded-lg text-muted transition-colors sm:hidden",
          "hover:bg-surface-muted hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
        )}
      >
        {isOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>

      {/* Click-away backdrop. Transparent rather than dimmed — the sheet is small and a scrim
          over a data page reads as a modal interruption when it's really just a menu. */}
      {isOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 cursor-default sm:hidden"
        />
      )}

      <div
        id="mobile-nav"
        hidden={!isOpen}
        className="absolute inset-x-0 top-full z-50 border-b border-border-base bg-surface shadow-lg sm:hidden"
      >
        <nav className="flex flex-col px-2 py-2">
          {links.map((link) => {
            const active = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "rounded-lg px-3 py-3 text-sm transition-colors",
                  active
                    ? "bg-accent-soft font-semibold text-accent"
                    : "text-muted hover:bg-surface-muted hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}

          <div className="mt-1 border-t border-border-base px-1 pt-2">{authAction}</div>
        </nav>
      </div>
    </>
  );
}
