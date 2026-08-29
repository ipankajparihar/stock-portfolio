/**
 * Migrates the buy-only `holding_lot` table into the buy/sell `transaction` ledger, in place.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-transactions.ts
 *
 * Renames are metadata-only in Postgres and the added columns have constant defaults, so this is
 * effectively instant and every existing row is preserved — each becomes a BUY.
 *
 * Written by hand rather than generated: the repo has no drizzle migration history (the schema was
 * applied with `drizzle-kit push`), so generating a baseline now would emit CREATE TABLE statements
 * for tables that already exist. Every statement below is guarded, so a partial run can be re-run.
 */
import net from "node:net";
import dns from "node:dns";
import { neon } from "@neondatabase/serverless";

// Same IPv6 workaround `src/instrumentation.ts` applies to the server: without it, connection
// racing picks an IPv6 route to Neon that blackholes in this environment and fetch just fails.
net.setDefaultAutoSelectFamily(false);
dns.setDefaultResultOrder("ipv4first");

const sql = neon(process.env.DATABASE_URL!);

async function tableExists(name: string): Promise<boolean> {
  const rows = (await sql`SELECT to_regclass(${`public.${name}`}) AS oid`) as { oid: string | null }[];
  return rows[0]?.oid != null;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing — pass --env-file=.env.local");

  const hasOld = await tableExists("holding_lot");
  const hasNew = await tableExists("transaction");

  let before = 0;
  if (hasOld) {
    const rows = (await sql`SELECT count(*)::int AS n FROM holding_lot`) as { n: number }[];
    before = rows[0].n;
    console.log(`holding_lot: ${before} rows to migrate`);
  }

  if (hasOld && hasNew) {
    throw new Error("Both holding_lot and transaction exist — resolve manually before re-running.");
  }

  if (hasOld) {
    await sql`ALTER TABLE "holding_lot" RENAME TO "transaction"`;
    await sql`ALTER TABLE "transaction" RENAME COLUMN "purchasePrice" TO "price"`;
    await sql`ALTER TABLE "transaction" RENAME COLUMN "purchaseDate" TO "tradeDate"`;
    console.log("renamed table and columns");
  } else if (!hasNew) {
    throw new Error("Neither holding_lot nor transaction exists — nothing to migrate.");
  } else {
    console.log("transaction table already present — skipping rename");
  }

  await sql`ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "side" text NOT NULL DEFAULT 'BUY'`;
  await sql`ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "fees" double precision NOT NULL DEFAULT 0`;
  console.log("added side + fees columns");

  await sql`CREATE INDEX IF NOT EXISTS "transaction_user_idx" ON "transaction" ("userId")`;
  await sql`CREATE INDEX IF NOT EXISTS "transaction_user_symbol_idx" ON "transaction" ("userId","symbol","exchange")`;
  console.log("created indexes (the old table had none, not even on userId)");

  await sql`
    CREATE TABLE IF NOT EXISTS "portfolio_snapshot" (
      "id" text PRIMARY KEY NOT NULL,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "market" text NOT NULL,
      "currency" text NOT NULL,
      "asOf" date NOT NULL,
      "investment" double precision NOT NULL,
      "presentValue" double precision NOT NULL,
      "realizedGain" double precision NOT NULL,
      "createdAt" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "portfolio_snapshot_userId_market_asOf_unique" UNIQUE("userId","market","asOf")
    )`;
  console.log("created portfolio_snapshot");

  const after = (await sql`SELECT count(*)::int AS n FROM "transaction"`) as { n: number }[];
  const buys = (await sql`SELECT count(*)::int AS n FROM "transaction" WHERE side = 'BUY'`) as {
    n: number;
  }[];

  console.log(`\ntransaction: ${after[0].n} rows, ${buys[0].n} marked BUY`);
  if (hasOld && after[0].n !== before) {
    throw new Error(`ROW COUNT MISMATCH: had ${before}, now ${after[0].n}`);
  }
  console.log(hasOld ? "row count preserved ✓" : "");
  console.log("done.");
}

void main().catch((err) => {
  console.error("\nMIGRATION FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
