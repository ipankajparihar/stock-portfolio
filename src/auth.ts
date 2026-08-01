import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [Google],
  /**
   * JWT, not database, sessions.
   *
   * The root layout's `SiteHeader` calls `auth()` on *every* navigation across the whole app —
   * with the database strategy that's a live Neon round-trip before any page can even start
   * rendering. Measured in this environment: 300ms–1.2s per query. That's the "pages navigate
   * slowly" symptom: a network round trip was sitting in front of every single click.
   *
   * With JWT sessions, the session is a signed cookie verified in-memory — zero network calls
   * to check who's logged in. The adapter above is still used for creating/linking the
   * user/account rows at sign-in; it's just no longer consulted on every navigation afterward.
   */
  session: { strategy: "jwt" },
  callbacks: {
    // Persist the user id onto the token once, at sign-in, so it survives into every
    // subsequent request without a DB lookup.
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.id === "string") session.user.id = token.id;
      return session;
    },
  },
  pages: { signIn: "/login" },
});
