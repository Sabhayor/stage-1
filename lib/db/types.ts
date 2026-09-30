/**
 * Minimal SQL database contract shared by every storage adapter.
 *
 * Both adapters (PGlite for local development/tests, `postgres.js` for a real
 * Postgres instance such as Neon/Vercel Postgres) speak the exact same SQL
 * dialect, so repositories never need to know which one is in use.
 */
export interface SqlDatabase {
  /** Run a statement and return the resulting rows. */
  query<T extends Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;

  /** Run a statement and ignore the rows (DDL, DELETE, ...). */
  execute(sql: string, params?: unknown[]): Promise<void>;

  /** Human readable identifier used by `/api/health`. */
  readonly driver: "postgres" | "pglite";

  /** True when data survives a restart / cold start. */
  readonly persistent: boolean;

  /** Release underlying resources (used by the test suite). */
  close(): Promise<void>;
}
