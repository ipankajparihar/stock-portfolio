import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { GoogleIcon } from "@/components/ui/GoogleIcon";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/portfolio");

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-4">
      <div className="w-full rounded-xl border border-border-base bg-surface p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted">
          Track your own holdings and watchlist with live prices.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/portfolio" });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-sm font-medium hover:bg-surface-muted"
          >
            <GoogleIcon />
            Sign in with Google
          </button>
        </form>
      </div>
    </main>
  );
}
