import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { NavLinks } from "@/components/NavLinks";

export async function SiteHeader() {
  const session = await auth();

  return (
    <header className="border-b border-border-base bg-surface">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="font-semibold">
          Portfolio
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <NavLinks isAuthed={!!session?.user} />

          {session?.user ? (
            <>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="text-muted hover:text-foreground">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/portfolio" });
              }}
            >
              <button
                type="submit"
                className="rounded-lg border border-border-strong px-3 py-1.5 font-medium hover:bg-surface-muted"
              >
                Sign in
              </button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}
