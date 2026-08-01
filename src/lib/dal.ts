import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Every protected page, Server Action, and route handler calls this first — never rely on
 * UI-level checks alone (see the Next.js auth guide's "close to the data" guidance).
 * Memoized per request so repeated calls during a render pass cost one session lookup.
 */
export const verifySession = cache(async () => {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return { userId: session.user.id, user: session.user };
});

/** Same check without the redirect, for places that degrade gracefully when logged out. */
export const getOptionalSession = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { userId: session.user.id, user: session.user };
});
