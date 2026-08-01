import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

// See `src/instrumentation.ts` for the IPv6 happy-eyeballs workaround this driver needs on
// networks with a broken IPv6 route — it's set process-wide there rather than per-client here.

const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });
