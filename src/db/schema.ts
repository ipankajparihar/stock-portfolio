import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { Market, TradeSide } from "@/lib/types";

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
 * One row per trade, buy or sell — an append-only ledger. A user's *position* in a symbol is the
 * FIFO-matched result of its trades, computed at read time in `holdings-repo.ts` and never stored,
 * so quantity, average cost and realized gains always reflect the current ledger.
 *
 * Quantity is always positive; `side` carries the direction.
 */
export const transactions = pgTable(
  "transaction",
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
    sector: text("sector").notNull(),
    side: text("side").$type<TradeSide>().notNull().default("BUY"),
    quantity: doublePrecision("quantity").notNull(),
    price: doublePrecision("price").notNull(),
    /** Brokerage/charges. Folded into cost basis on buys, netted off proceeds on sells. */
    fees: doublePrecision("fees").notNull().default(0),
    currency: text("currency").notNull(),
    tradeDate: date("tradeDate", { mode: "string" }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("transaction_user_idx").on(table.userId),
    index("transaction_user_symbol_idx").on(table.userId, table.symbol, table.exchange),
  ],
);

/**
 * A daily mark of what the portfolio was worth, one row per user per market per day.
 *
 * This exists because portfolio history *cannot be reconstructed after the fact* — deriving it
 * would need historical prices for every held symbol on every past day, which the free data source
 * won't provide at any reasonable cost. Recording forward from today is the only cheap option.
 */
export const portfolioSnapshots = pgTable(
  "portfolio_snapshot",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    market: text("market").$type<Market>().notNull(),
    currency: text("currency").notNull(),
    asOf: date("asOf", { mode: "string" }).notNull(),
    /** Cost basis of open positions on that day. */
    investment: doublePrecision("investment").notNull(),
    presentValue: doublePrecision("presentValue").notNull(),
    /** Cumulative realized gain to date — so total return can be charted, not just paper gains. */
    realizedGain: doublePrecision("realizedGain").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.market, table.asOf)],
);
