import {
  boolean,
  date,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { Market } from "@/lib/types";

/**
 * Auth.js standard schema for the Drizzle Postgres adapter.
 * Table/column names and shapes must match what `@auth/drizzle-adapter` expects.
 */

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({ columns: [verificationToken.identifier, verificationToken.token] }),
  ],
);

export const authenticators = pgTable(
  "authenticator",
  {
    credentialID: text("credentialID").notNull().unique(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerAccountId: text("providerAccountId").notNull(),
    credentialPublicKey: text("credentialPublicKey").notNull(),
    counter: integer("counter").notNull(),
    credentialDeviceType: text("credentialDeviceType").notNull(),
    credentialBackedUp: boolean("credentialBackedUp").notNull(),
    transports: text("transports"),
  },
  (authenticator) => [
    primaryKey({ columns: [authenticator.userId, authenticator.credentialID] }),
  ],
);

// ---------------------------------------------------------------------------
// App tables — per-user watchlist and manually-entered purchase lots.
// ---------------------------------------------------------------------------

export const watchlist = pgTable(
  "watchlist",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    exchange: text("exchange").notNull(),
    market: text("market").$type<Market>().notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.symbol, table.exchange)],
);

/**
 * One row per manual buy. A user's *position* in a symbol is the aggregate of its lots —
 * computed at read time in `holdings-repo.ts`, not stored — so quantity/avg cost always
 * reflect the current set of purchases.
 */
export const holdingLots = pgTable("holding_lot", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  exchange: text("exchange").notNull(),
  market: text("market").$type<Market>().notNull(),
  name: text("name").notNull(),
  sector: text("sector").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  purchasePrice: doublePrecision("purchasePrice").notNull(),
  currency: text("currency").notNull(),
  purchaseDate: date("purchaseDate", { mode: "string" }).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});
