import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createPgliteDatabase } from "@/lib/db/pglite";

/**
 * Regression tests for the local storage adapter.
 *
 * The app defaults to PGlite in `.data/pglite`, but PGlite only creates the leaf
 * directory - a missing parent used to fail every local API call with
 * `ENOENT: no such file or directory, mkdir '...\.data\pglite'`.
 */
describe("createPgliteDatabase", () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  });

  it("creates missing parent directories before opening a file-backed database", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pglite-data-"));
    roots.push(root);
    const dataDir = path.join(root, ".data", "pglite");

    const db = await createPgliteDatabase({ dataDir });
    try {
      expect(fs.existsSync(dataDir)).toBe(true);
      expect(db.driver).toBe("pglite");
      expect(db.persistent).toBe(true);

      const rows = await db.query<{ value: number }>("SELECT 1::int AS value");
      expect(rows[0].value).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("reports in-memory instances as non-persistent", async () => {
    const db = await createPgliteDatabase();
    try {
      expect(db.persistent).toBe(false);
    } finally {
      await db.close();
    }
  });
});
