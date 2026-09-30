import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { SqlDatabase } from "./types";

export interface PgliteOptions {
  /** Directory used for on-disk persistence. Omit for an in-memory database. */
  dataDir?: string;
}

/**
 * Adapter used for local development and for the automated test suite.
 *
 * PGlite is Postgres compiled to WASM, so it understands exactly the same SQL
 * (including `timestamptz` and `CREATE INDEX IF NOT EXISTS`) as the hosted
 * database we deploy against. No local Postgres install is required.
 */
export async function createPgliteDatabase(
  options: PgliteOptions = {},
): Promise<SqlDatabase> {
  // PGlite creates its own data directory but not the parent folders, so a fresh
  // checkout would fail with `ENOENT: mkdir '...\.data\pglite'`.
  if (options.dataDir) fs.mkdirSync(options.dataDir, { recursive: true });

  const db = options.dataDir ? new PGlite(options.dataDir) : new PGlite();
  await db.waitReady;

  return {
    driver: "pglite",
    persistent: Boolean(options.dataDir),
    async query<T extends Record<string, unknown>>(
      statement: string,
      params: unknown[] = [],
    ): Promise<T[]> {
      const result = await db.query<T>(statement, params as unknown[]);
      return result.rows;
    },
    async execute(statement: string, params: unknown[] = []): Promise<void> {
      if (params.length > 0) {
        await db.query(statement, params as unknown[]);
        return;
      }
      await db.exec(statement);
    },
    async close(): Promise<void> {
      await db.close();
    },
  };
}
