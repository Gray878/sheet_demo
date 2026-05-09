import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var healthFunnelSql: Sql | undefined;
  // eslint-disable-next-line no-var
  var healthFunnelDb: Database | undefined;
}

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): Database {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Postgres access.");
  }

  if (!globalThis.healthFunnelSql) {
    globalThis.healthFunnelSql = postgres(databaseUrl, {
      prepare: false
    });
  }

  if (!globalThis.healthFunnelDb) {
    globalThis.healthFunnelDb = drizzle(globalThis.healthFunnelSql, { schema });
  }

  return globalThis.healthFunnelDb;
}

export async function closeDb() {
  await globalThis.healthFunnelSql?.end({ timeout: 1 });
  globalThis.healthFunnelSql = undefined;
  globalThis.healthFunnelDb = undefined;
}

export type { Database };
