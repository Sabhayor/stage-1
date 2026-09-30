# Reminder — todos · notes · calendar · reminders

A small productivity workspace built with **Next.js (App Router)** and **React 19**:
tasks, notes, a month calendar and scheduled reminders that can notify you in the
browser (foreground poller) and through **web push** (background dispatch).

The app is intentionally authentication-free: the browser generates a workspace id
once and sends it as the `x-workspace-id` header, so every record stays scoped to
that workspace. Data lives in Postgres (or a local PGlite instance when no
database is configured).

## Pages

| Route | What it does |
| ----- | ------------ |
| `/` | Dashboard — counters, quick add, today's and overdue todos, upcoming events, pending reminders |
| `/todos` | Todo list with status/due filters, search, inline editing and reminder creation |
| `/notes` | Two-pane note editor (list + editor) with tags, pinning and search |
| `/calendar` | Month grid, event chips, day details and event creation |
| `/reminders` | Reminder management, notification permission, background push registration and a manual dispatch |

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without `DATABASE_URL` the app
uses PGlite in `.data/pglite`, so everything works offline.

## Commands

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm test` | Vitest suite (API + unit tests) |
| `npm run test:watch` | Watch mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next.js config) |
| `npm run build` / `npm start` | Production build and serve it locally |
| `node scripts/generate-vapid-keys.mjs` | Generate VAPID keys for web push |

## Notifications

1. **In-app (always available)** — `components/ReminderEngine.tsx` polls
   `GET /api/notifications/due` every minute, raises a browser notification when
   permission is granted, acknowledges it through
   `POST /api/reminders/:id/acknowledge` and keeps a dismissable toast on screen.
2. **Background (optional)** — set the VAPID variables and schedule a call to
   `POST /api/notifications/dispatch` (Vercel Cron, GitHub Actions, cron-job.org…)
   with `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set. Delivery
   failures leave the reminder pending, so the in-app poller still surfaces it.

```bash
node scripts/generate-vapid-keys.mjs   # prints VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

## API

All endpoints live under `/api`, are workspace scoped and always answer JSON. The
full reference (methods, query parameters, response shapes, error contract) is in
[AGENTS.md](./AGENTS.md#api-reference).

## Environment variables

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `DATABASE_URL` / `POSTGRES_URL` | production only | Postgres connection string; without it the app runs on local PGlite (demo mode) |
| `PGLITE_DATA_DIR` | – | Overrides the local PGlite data directory |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | – | Enable background web push |
| `VAPID_SUBJECT` | – | `mailto:` contact for push services |
| `CRON_SECRET` | – | Protects `POST /api/notifications/dispatch` |

## Smoke check

With the dev server (or a deployment) running:

```bash
# 1. storage / push status
curl -s http://localhost:3000/api/health

# 2. create a todo in a workspace of your choosing
curl -s -X POST http://localhost:3000/api/todos \
  -H 'content-type: application/json' \
  -H 'x-workspace-id: smoke' \
  -d '{"title":"Smoke test","priority":"high"}'

# 3. it shows up in the list and in the dashboard counters
curl -s -H 'x-workspace-id: smoke' http://localhost:3000/api/todos
curl -s -H 'x-workspace-id: smoke' http://localhost:3000/api/stats

# 4. schedule a reminder that is already due and drain it through the dispatcher
curl -s -X POST http://localhost:3000/api/reminders \
  -H 'content-type: application/json' \
  -H 'x-workspace-id: smoke' \
  -d "{\"title\":\"Ping\",\"remindAt\":\"$(node -e 'console.log(new Date(Date.now()-1000).toISOString())')\"}"
curl -s -X POST http://localhost:3000/api/notifications/dispatch \
  -H 'content-type: application/json' \
  -H 'x-workspace-id: smoke' \
  -d '{}'
```

Finally open the dashboard in a browser and confirm the todo and the reminder
appear, then check `/todos`, `/notes`, `/calendar` and `/reminders`.

## Deployment

- Target: **Vercel** — the repo ships a `vercel.json` with the framework, install
  and build commands, so a deploy needs no extra configuration.
- `vercel login` once, then:

  ```bash
  vercel link          # creates/links the project to this folder
  vercel --prod        # production deploy -> prints the https URL
  vercel env add DATABASE_URL production   # and the rest of the variables below
  ```

- Attach a Postgres database (Neon / Vercel Postgres) and expose it as
  `DATABASE_URL`; without it the app runs in demo mode on PGlite inside `/tmp`,
  which `/api/health` reports as `storage.persistent: false`.
- Add the VAPID variables so background push works, and `CRON_SECRET` to protect
  the dispatch endpoint.
- **Background reminders** (optional): point a scheduler at
  `POST /api/notifications/dispatch`. Vercel Cron can do it directly, but
  sub-daily schedules need a Pro plan — add this to `vercel.json` once you have
  one:

  ```json
  {
    "crons": [{ "path": "/api/notifications/dispatch", "schedule": "*/5 * * * *" }]
  }
  ```

  Vercel sends `Authorization: Bearer $CRON_SECRET` automatically, which is why
  the endpoint reads it.
- After deploying, verify with `curl https://<deployment>/api/health` and run the
  smoke check above.

