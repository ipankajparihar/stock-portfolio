"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

interface NavLink {
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
 * The header's nav links, singled out into their own client component so the current page can
 * be highlighted via `usePathname()` — the header itself stays a server component for `auth()`.
 */
export function NavLinks({ isAuthed }: { isAuthed: boolean }) {
  const pathname = usePathname();
  const links = isAuthed ? [...PUBLIC_LINKS, ...AUTHED_LINKS] : PUBLIC_LINKS;

  return (
    <>
      {links.map((link) => {
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
