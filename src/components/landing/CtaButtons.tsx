import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { signIn } from "@/auth";
import { GoogleIcon } from "@/components/ui/GoogleIcon";

/**
 * The landing page's primary call to action, session-aware.
 *
 * Signed out: a Google sign-in (server action) plus a jump to the live market board.
 * Signed in: straight into the portfolio, with the board as the secondary path.
 */
export function CtaButtons({ isAuthed }: { isAuthed: boolean }) {
  if (isAuthed) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/portfolio" className="btn-primary">
          Open your portfolio
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
        <Link href="#markets" className="btn-secondary">
          View live markets
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/portfolio" });
        }}
      >
        <button type="submit" className="btn-primary">
          <GoogleIcon />
          Get started free
        </button>
      </form>
      <Link href="#markets" className="btn-secondary">
        Explore markets
      </Link>
    </div>
  );
}
