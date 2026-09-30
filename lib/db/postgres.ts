import postgres from "postgres";
import type { SqlDatabase } from "./types";

/**
 * Adapter for a real Postgres server (Neon / Vercel Postgres / Supabase ...).
 *
 * `prepare: false` keeps us compatible with transaction-pooling endpoints
 * (PgBouncer style) that are typical for serverless Postgres providers.
 */
export function createPostgresDatabase(connectionString: string): SqlDatabase {
  const isLocal = /(localhost|127\.0\.0\.1)/.test(connectionString);
  const sql = postgres(connectionString, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    ssl: isLocal ? false : "require",
    onnotice: () => {},
  });

  return {
    driver: "postgres",
    persistent: true,
    async query<T extends Record<string, unknown>>(
      statement: string,
      params: unknown[] = [],
    ): Promise<T[]> {
      const rows = await sql.unsafe(statement, params as never[]);
      return rows as unknown as T[];
    },
    async execute(statement: string, params: unknown[] = []): Promise<void> {
      await sql.unsafe(statement, params as never[]);
    },
    async close(): Promise<void> {
      await sql.end({ timeout: 5 });
    },
  };
}
