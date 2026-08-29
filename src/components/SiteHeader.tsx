import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { MobileNav } from "@/components/MobileNav";
import { NavLinks } from "@/components/NavLinks";
import { BrandMark } from "@/components/ui/BrandMark";

export async function SiteHeader() {
  const session = await auth();
  const isAuthed = !!session?.user;

  /**
   * Built once and handed to both the desktop row and the mobile sheet. The server actions can
   * only be declared in this server component, and a second copy of the sign-in button is how the
   * two would eventually disagree. `full` stretches it to fill the mobile sheet's width.
   */
  const authAction = (full: boolean) =>
    isAuthed ? (
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
        className={full ? "w-full" : undefined}
      >
        <button
          type="submit"
          className={
            full
              ? "w-full rounded-lg px-3 py-3 text-left text-sm text-muted hover:bg-surface-muted hover:text-foreground"
              : "text-muted hover:text-foreground"
          }
        >
          Sign out
        </button>
      </form>
    ) : (
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/portfolio" });
        }}
        className={full ? "w-full" : undefined}
      >
        <button
          type="submit"
          className={
            full
              ? "w-full rounded-lg border border-border-strong px-3 py-3 text-sm font-medium hover:bg-surface-muted"
              : "rounded-lg border border-border-strong px-3 py-1.5 font-medium hover:bg-surface-muted"
          }
        >
          Sign in
        </button>
      </form>
    );

  return (
    // `relative` anchors the mobile sheet, which drops out of flow so opening the menu overlays
    // the page rather than shoving the ticker and everything below it down.
    <header className="relative border-b border-border-base bg-surface">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Portfolio Dashboard — home"
          className="flex shrink-0 items-center gap-2 font-semibold transition-opacity hover:opacity-80"
        >
          <BrandMark className="size-7 shrink-0" />
          {/* The mark carries the identity on its own once space is tight, so the wordmark is the
              part that yields — not the other way round. */}
          <span>Portfolio</span>
        </Link>

        <nav className="hidden items-center gap-4 text-sm sm:flex">
          <NavLinks isAuthed={isAuthed} />
          {authAction(false)}
        </nav>

        <MobileNav isAuthed={isAuthed} authAction={authAction(true)} />
      </div>
    </header>
  );
}
