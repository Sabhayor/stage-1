import os from "node:os";
import path from "node:path";
import { SCHEMA_STATEMENTS } from "./schema";
import { createPgliteDatabase } from "./pglite";
import { createPostgresDatabase } from "./postgres";
import type { SqlDatabase } from "./types";

/**
 * Storage selection order:
 *
 * 1. `DATABASE_URL` (or `POSTGRES_URL` supplied by the Vercel Postgres
 *    integration) -> hosted Postgres. Persistent.
 * 2. On Vercel without a database configured -> PGlite inside `/tmp`, which
 *    keeps the deployment usable in "demo mode" (data is per-instance and
 *    disappears on a cold start; `/api/health` reports `persistent: false`).
 * 3. Anywhere else -> PGlite on disk in `.data/pglite`. Persistent.
 */
const connectionString =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";

const IS_VERCEL = Boolean(process.env.VERCEL);

let cached: Promise<SqlDatabase> | null = null;
/** Test-only override installed through {@link setDatabaseForTesting}. */
let override: SqlDatabase | null = null;

export function describeStorage(resolved: SqlDatabase): {
  driver: SqlDatabase["driver"];
  persistent: boolean;
} {
  return { driver: resolved.driver, persistent: resolved.persistent };
}

/** Apply the (idempotent) schema to a database. */
export async function migrate(db: SqlDatabase): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.execute(statement);
  }
}

async function build(): Promise<SqlDatabase> {
  if (connectionString) {
    const db = createPostgresDatabase(connectionString);
    await migrate(db);
    return db;
  }

  const db = await createPgliteDatabase(
    IS_VERCEL
      ? { dataDir: path.join(os.tmpdir(), "stage1-pglite") }
      : { dataDir: process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite") },
  );
  await migrate(db);
  return db;
}

/** Resolve the single shared database handle for this process. */
export function getDatabase(): Promise<SqlDatabase> {
  if (override) return Promise.resolve(override);
  if (!cached) {
    cached = build().catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

export function isPersistentStorageConfigured(): boolean {
  return Boolean(connectionString);
}

/**
 * Inject a database instance (used by the test suite so that every endpoint is
 * exercised against a throwaway in-memory Postgres). Pass `null` to restore the
 * default resolution logic.
 */
export function setDatabaseForTesting(db: SqlDatabase | null): void {
  override = db;
}

export type { SqlDatabase } from "./types";
