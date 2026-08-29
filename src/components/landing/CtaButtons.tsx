import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { signIn } from "@/auth";
import { GoogleIcon } from "@/components/ui/GoogleIcon";

/**
 * The landing page's primary call to action, session-aware.
 *
 * Signed out: a Google sign-in (server action) plus a jump to the live market board.
 * Signed in: straight into the portfolio, with the board as the secondary path.
 *
 * Centred on mobile, left-aligned from `sm` up. The alignment lives here rather than on the
 * callers' wrappers because these buttons wrap onto two rows on a narrow screen — centring an
 * outer container would centre the block as a whole and still leave the shorter button visibly
 * off-centre inside it. Justifying the wrapping flex row itself centres each row.
 */
export function CtaButtons({ isAuthed }: { isAuthed: boolean }) {
  if (isAuthed) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
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
    <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
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
