"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export interface NavLink {
  href: string;
  label: string;
}

const PUBLIC_LINKS: NavLink[] = [
  { href: "/", label: "Markets" },
  { href: "/derivatives", label: "F&O" },
];
const AUTHED_LINKS: NavLink[] = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/watchlist", label: "Watchlist" },
];

/**
 * One source of truth for the nav destinations, shared by the desktop row and the mobile menu.
 * Two lists that have to be kept in sync is how a link ends up in one and not the other.
 */
export function navLinksFor(isAuthed: boolean): NavLink[] {
  return isAuthed ? [...PUBLIC_LINKS, ...AUTHED_LINKS] : PUBLIC_LINKS;
}

/**
 * The header's desktop nav links, a client component so the current page can be highlighted via
 * `usePathname()` — the header itself stays a server component for `auth()`.
 */
export function NavLinks({ isAuthed }: { isAuthed: boolean }) {
  const pathname = usePathname();

  return (
    <>
      {navLinksFor(isAuthed).map((link) => {
        const active = pathname === link.href;

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "transition-colors",
              active ? "font-semibold text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
