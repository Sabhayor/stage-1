import { afterAll, beforeAll, beforeEach } from "vitest";
import { migrate, setDatabaseForTesting } from "@/lib/db";
import { createPgliteDatabase } from "@/lib/db/pglite";
import { TABLES } from "@/lib/db/schema";
import type { SqlDatabase } from "@/lib/db/types";

/**
 * Every test file gets its own throwaway in-memory Postgres (PGlite).
 *
 * The database is registered as the application database through
 * `setDatabaseForTesting`, so route handlers exercise the real repositories
 * without touching the developer's local `.data` directory.
 */
let db: SqlDatabase;

beforeAll(async () => {
  db = await createPgliteDatabase();
  await migrate(db);
  setDatabaseForTesting(db);
});

beforeEach(async () => {
  for (const table of TABLES) {
    await db.execute(`TRUNCATE TABLE ${table}`);
  }
});

afterAll(async () => {
  setDatabaseForTesting(null);
  await db.close();
});
