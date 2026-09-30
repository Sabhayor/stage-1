/**
 * Idempotent schema for the whole application.
 *
 * The SQL is plain Postgres so that it runs unchanged on PGlite (local dev and
 * tests) and on a hosted Postgres database (Vercel/Neon). Every statement uses
 * `IF NOT EXISTS`, which makes bootstrapping safe to run on every cold start.
 */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS todos (
     id            text PRIMARY KEY,
     workspace_id  text NOT NULL,
     title         text NOT NULL,
     notes         text NOT NULL DEFAULT '',
     priority      text NOT NULL DEFAULT 'medium',
     due_at        timestamptz,
     completed     boolean NOT NULL DEFAULT false,
     completed_at  timestamptz,
     created_at    timestamptz NOT NULL DEFAULT now(),
     updated_at    timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS todos_workspace_idx
     ON todos (workspace_id, completed, due_at)`,

  `CREATE TABLE IF NOT EXISTS notes (
     id            text PRIMARY KEY,
     workspace_id  text NOT NULL,
     title         text NOT NULL,
     content       text NOT NULL DEFAULT '',
     tags          text NOT NULL DEFAULT '',
     pinned        boolean NOT NULL DEFAULT false,
     created_at    timestamptz NOT NULL DEFAULT now(),
     updated_at    timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS notes_workspace_idx
     ON notes (workspace_id, pinned, updated_at)`,

  `CREATE TABLE IF NOT EXISTS events (
     id            text PRIMARY KEY,
     workspace_id  text NOT NULL,
     title         text NOT NULL,
     description   text NOT NULL DEFAULT '',
     location      text NOT NULL DEFAULT '',
     start_at      timestamptz NOT NULL,
     end_at        timestamptz NOT NULL,
     all_day       boolean NOT NULL DEFAULT false,
     color         text NOT NULL DEFAULT 'indigo',
     created_at    timestamptz NOT NULL DEFAULT now(),
     updated_at    timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS events_workspace_idx
     ON events (workspace_id, start_at)`,

  `CREATE TABLE IF NOT EXISTS reminders (
     id            text PRIMARY KEY,
     workspace_id  text NOT NULL,
     title         text NOT NULL,
     body          text NOT NULL DEFAULT '',
     remind_at     timestamptz NOT NULL,
     target_type   text NOT NULL DEFAULT 'standalone',
     target_id     text,
     sent          boolean NOT NULL DEFAULT false,
     sent_at       timestamptz,
     created_at    timestamptz NOT NULL DEFAULT now(),
     updated_at    timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS reminders_workspace_idx
     ON reminders (workspace_id, sent, remind_at)`,

  `CREATE TABLE IF NOT EXISTS push_subscriptions (
     id            text PRIMARY KEY,
     workspace_id  text NOT NULL,
     endpoint      text NOT NULL UNIQUE,
     p256dh        text NOT NULL,
     auth          text NOT NULL,
     created_at    timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS push_subscriptions_workspace_idx
     ON push_subscriptions (workspace_id)`,
];

/** Every table owned by the app (used by the test harness to reset state). */
export const TABLES = [
  "todos",
  "notes",
  "events",
  "reminders",
  "push_subscriptions",
] as const;
