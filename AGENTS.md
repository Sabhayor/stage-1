# AGENTS.md — Reminder Workspace (todo · notes · calendar · reminders)

This file is the operating manual for anyone (human or AI) working in this repo.
Everything under `## Project rules`, `## Commands`, `## Architecture`,
`## API reference`, `## Testing`, `## Environment variables` and `## Deployment`
is project-specific and must stay up to date as the app evolves.

## Project rules (non-negotiable)

1. **Write a test for every endpoint you create or change.** Each route handler in
   `app/api/**/route.ts` must be covered in `tests/api/**` — happy path,
   validation failure (`400`), missing record (`404`) and workspace isolation.
   An endpoint is not finished until its test exists.
2. **Always validate that the endpoints actually work after a change.** Run the
   full gate below and fix every failure before calling the task done:

   ```bash
   npm test          # endpoint + unit tests (Vitest, in-memory Postgres)
   npm run typecheck # tsc --noEmit
   npm run lint      # eslint
   npm run build     # production build (catches Next.js-time errors)
   ```

   For UI-affecting changes also start `npm run dev` and exercise the page.
3. **Keep this file in sync.** Add every new endpoint to the
   [API reference](#api-reference) table and document any new environment
   variable in [Environment variables](#environment-variables).
4. **Never break the response contract.** Handlers always answer with JSON:
   successes are objects (`{ todo }`, `{ todos, count }`, ...) and errors are
   `{ error: { message, issues? } }`. Do not return bare arrays or HTML.
5. **Every query is workspace-scoped.** Never add a repository function that
   reads or writes rows without a `workspace_id` filter.

## Commands

| Command              | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `npm run dev`        | Start the dev server on http://localhost:3000                    |
| `npm test`           | Run all Vitest suites once (the endpoint validation gate)        |
| `npm run test:watch` | Watch mode while iterating on a test                             |
| `npm run typecheck`  | `tsc --noEmit`                                                   |
| `npm run lint`       | ESLint (Next.js config)                                          |
| `npm run build`      | Production build — also validates every route handler            |
| `npm start`          | Serve the production build locally                               |


## Architecture

```
app/
  api/**/route.ts      HTTP layer — thin: parse → repository → JSON
  page.tsx             Dashboard (today's todos, upcoming events, reminders)
  todos/page.tsx       Todo list with filters, search and reminder creation
  notes/page.tsx       Two-pane note editor
  calendar/page.tsx    Month calendar, events and day details
  reminders/page.tsx   Reminder management + notification permissions
components/            Client UI (React 19) — talks to the API through `useApi`
  useApi.ts            fetch wrapper + refresh/loading hook (workspace header)
  ui.tsx               Presentational primitives (Card, Button, Field, Pill, ...)
  NavBar.tsx           Sticky navigation with active-route highlighting
  ReminderEngine.tsx   In-app reminder poller + Notification API
lib/
  db/                  Storage adapters + idempotent schema
  repositories/        All SQL lives here (todos, notes, events, reminders, ...)
  notifications/       Web push (VAPID) delivery
  datetime.ts          Local-time formatting + month-grid helpers (client-safe)
  http.ts              route()/json()/parseBody()/parseQuery() helpers
  validation.ts        Zod schemas — the single source of truth for input shape
  workspace.ts         Workspace scoping (x-workspace-id header)
tests/                 Vitest suites (API + unit)
public/sw.js           Service worker: push + notification clicks
scripts/               generate-vapid-keys.mjs — VAPID key pair helper
```

**Layering rules**

- Route handlers contain no SQL. They validate input, call a repository and wrap
  the result with `json()`/`apiError()`.
- Repository functions own all SQL, take `(workspaceId, ...)` first, and map rows
  to camelCase domain objects with ISO-8601 string timestamps.
- The HTTP layer must stay importable by Vitest without a Next.js runtime:
  handlers use the standard `Request`/`Response` APIs (never `NextRequest`) and
  the `route()` wrapper converts thrown `ZodError`s into `400` responses.

**Storage**

`lib/db/index.ts` picks an adapter at runtime:

| Condition                                | Adapter                  | Persistence              |
| ---------------------------------------- | ------------------------ | ------------------------ |
| `DATABASE_URL` or `POSTGRES_URL` is set  | hosted Postgres          | yes                      |
| `VERCEL` is set, no database configured  | PGlite in `/tmp`         | per-instance (demo mode) |
| running locally (default)                | PGlite in `.data/pglite` | yes                      |

Both adapters run the same Postgres SQL (`lib/db/schema.ts`), which is why the
test suite can use an in-memory PGlite instance and still exercise the exact SQL
that production runs. `createPgliteDatabase` creates missing parent folders
first, so a fresh checkout booting `.data/pglite` (gitignored) just works.

## API reference

All endpoints live under `/api`, accept/return JSON, and are scoped by the
`x-workspace-id` header (fallback: `?workspaceId=`, default `default`).

| Method | Path | Body / query | Success |
| ------ | ---- | ------------ | ------- |
| GET | `/api/health` | – | `{ status, storage, databaseTime, push }` |
| GET | `/api/stats` | – | `{ stats }` counters for the dashboard |
| GET | `/api/todos` | `status=all\|active\|completed`, `due=any\|today\|overdue\|upcoming`, `from`, `to`, `q`, `limit` | `{ todos, count }` |
| POST | `/api/todos` | `{ title, notes?, priority?, dueAt? }` | `201 { todo }` |
| GET | `/api/todos/:id` | – | `{ todo }` |
| PATCH | `/api/todos/:id` | any of `title, notes, priority, dueAt, completed` | `{ todo }` |
| DELETE | `/api/todos/:id` | – | `{ deleted: true, id }` |
| GET | `/api/notes` | `q`, `pinned=true\|false`, `limit` | `{ notes, count }` |
| POST | `/api/notes` | `{ title?, content?, tags?, pinned? }` | `201 { note }` |
| GET | `/api/notes/:id` | – | `{ note }` |
| PATCH | `/api/notes/:id` | any of `title, content, tags, pinned` | `{ note }` |
| DELETE | `/api/notes/:id` | – | `{ deleted: true, id }` |
| GET | `/api/events` | `from`, `to` (overlap window), `q`, `limit` | `{ events, count }` |
| POST | `/api/events` | `{ title, startAt, endAt?, allDay?, color?, description?, location? }` | `201 { event }` |
| GET | `/api/events/:id` | – | `{ event }` |
| PATCH | `/api/events/:id` | any of `title, description, location, startAt, endAt, allDay, color` | `{ event }` |
| DELETE | `/api/events/:id` | – | `{ deleted: true, id }` |
| GET | `/api/reminders` | `from`, `to`, `pending=true\|false`, `limit` | `{ reminders, count }` |
| POST | `/api/reminders` | `{ title, remindAt, body?, targetType?, targetId? }` | `201 { reminder }` |
| GET | `/api/reminders/:id` | – | `{ reminder }` |
| PATCH | `/api/reminders/:id` | any of `title, body, remindAt, targetType, targetId, sent` | `{ reminder }` |
| DELETE | `/api/reminders/:id` | – | `{ deleted: true, id }` |
| POST | `/api/reminders/:id/acknowledge` | – | `{ reminder }` marked `sent` |
| GET | `/api/notifications/due` | `withinMinutes=0..1440`, `limit` | `{ reminders, count, checkedAt }` |
| POST | `/api/notifications/dispatch` | `withinMinutes`, `limit`; `Authorization: Bearer $CRON_SECRET` when set | `{ dispatched, candidates, push }` |
| GET | `/api/push/vapid-public-key` | – | `{ configured, publicKey, subscriptions }` |
| POST | `/api/push/subscribe` | `{ endpoint, keys: { p256dh, auth } }` | `201 { subscription, subscriptions }` |
| POST | `/api/push/unsubscribe` | `{ endpoint }` | `{ deleted: true }` |

`400` answers include `{ error: { message: "Validation failed", issues: [{ path, message }] } }`;
missing records answer `404 { error: { message: "<Thing> not found" } }`.


## Testing

- Runner: **Vitest** (`vitest.config.mts`), node environment, `tests/**/*.test.ts`.
- `tests/setup.ts` boots one in-memory **PGlite** Postgres per test file, applies
  the real schema and registers it via `setDatabaseForTesting()`. Tables are
  truncated before every test, so tests are order-independent.
- `tests/helpers/api.ts` provides `get/post/patch/del`, `params({ id })` and
  `readJson()` so a test can call a route handler exactly like Next.js would:

  ```ts
  import { GET as listTodos, POST as createTodo } from "@/app/api/todos/route";
  import { get, post, readJson } from "@/tests/helpers/api";

  it("creates and lists a todo", async () => {
    const created = await createTodo(
      post("/api/todos", { body: { title: "Ship it" } }),
    );
    expect(created.status).toBe(201);

    const listed = await listTodos(get("/api/todos"));
    const payload = await readJson<{ todos: unknown[] }>(listed);
    expect(payload.todos).toHaveLength(1);
  });
  ```

- Checklist for a new endpoint test (mirror the existing suites in `tests/api/`):
  1. happy path + status code + response shape;
  2. `400` for a missing/invalid body or query parameter;
  3. `404` for a missing id;
  4. workspace isolation (created in `workspace-a` is invisible to `workspace-b`).

## Environment variables

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `DATABASE_URL` | production only | Postgres connection string (Neon/Vercel Postgres). Without it the app runs in demo mode. |
| `POSTGRES_URL` | – | Alternative name injected by the Vercel Postgres integration. |
| `PGLITE_DATA_DIR` | – | Overrides the local PGlite data directory. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | – | Enable background web push. Generate with `node scripts/generate-vapid-keys.mjs`. |
| `VAPID_SUBJECT` | – | `mailto:` contact for push services (defaults to `mailto:reminders@example.com`). |
| `CRON_SECRET` | – | Protects `POST /api/notifications/dispatch`. |

## Deployment

- Target: **Vercel**. `vercel.json` pins the framework, install command
  (`npm install`) and build command (`npm run build`).
- First-time flow: `vercel login` -> `vercel link` (creates/links the project to
  this folder) -> `vercel --prod` -> `vercel env add <NAME> production` for the
  secrets above. Once the GitHub repo is connected in the dashboard, every push
  to the default branch redeploys automatically.
- Attach a Postgres database to the project and expose it as `DATABASE_URL` so
  data survives cold starts; `/api/health` reports `storage.persistent: false`
  while the app is still in demo mode (PGlite inside `/tmp`).
- Background reminders: point any scheduler at
  `POST /api/notifications/dispatch` (see README) or add a `crons` entry to
  `vercel.json` - sub-daily schedules require a Pro plan. The in-app poller in
  `components/ReminderEngine.tsx` covers the "app open" case on its own.
- After deploying, verify with `curl https://<deployment>/api/health` and run
  the smoke check described in the README.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
