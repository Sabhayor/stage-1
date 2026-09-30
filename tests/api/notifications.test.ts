import { afterEach, describe, expect, it } from "vitest";
import { GET as listReminders, POST as createReminder } from "@/app/api/reminders/route";
import { POST as acknowledge } from "@/app/api/reminders/[id]/acknowledge/route";
import { GET as dueReminders } from "@/app/api/notifications/due/route";
import { POST as dispatch } from "@/app/api/notifications/dispatch/route";
import { POST as subscribe } from "@/app/api/push/subscribe/route";
import { get, params, post, readJson } from "@/tests/helpers/api";

const WORKSPACE = "test-workspace";
const OTHER = "other-workspace";

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

async function schedule(workspaceId: string, title: string, remindAt: string) {
  const response = await createReminder(
    post("/api/reminders", { workspaceId, body: { title, remindAt } }),
  );
  const payload = await readJson<{ reminder: { id: string } }>(response);
  return payload.reminder.id;
}

describe("GET /api/notifications/due", () => {
  it("returns only pending reminders that are already due", async () => {
    await schedule(WORKSPACE, "Due now", iso(-60_000));
    await schedule(WORKSPACE, "Due in 10 minutes", iso(600_000));
    await schedule(WORKSPACE, "Due tomorrow", iso(86_400_000));

    const response = await dueReminders(
      get("/api/notifications/due", { workspaceId: WORKSPACE }),
    );
    const payload = await readJson<{
      reminders: { title: string }[];
      count: number;
      checkedAt: string;
    }>(response);

    expect(response.status).toBe(200);
    expect(payload.count).toBe(1);
    expect(payload.reminders[0].title).toBe("Due now");
    expect(Number.isNaN(Date.parse(payload.checkedAt))).toBe(false);
  });

  it("honours the withinMinutes look-ahead window", async () => {
    await schedule(WORKSPACE, "Due in 10 minutes", iso(600_000));

    const payload = await readJson<{ reminders: { title: string }[] }>(
      await dueReminders(
        get("/api/notifications/due", {
          workspaceId: WORKSPACE,
          query: { withinMinutes: 15 },
        }),
      ),
    );
    expect(payload.reminders.map((reminder) => reminder.title)).toEqual(["Due in 10 minutes"]);
  });

  it("excludes reminders that were already acknowledged", async () => {
    const id = await schedule(WORKSPACE, "Already sent", iso(-60_000));
    await acknowledge(
      post(`/api/reminders/${id}/acknowledge`, { workspaceId: WORKSPACE }),
      params({ id }),
    );

    const payload = await readJson<{ reminders: unknown[] }>(
      await dueReminders(get("/api/notifications/due", { workspaceId: WORKSPACE })),
    );
    expect(payload.reminders).toEqual([]);
  });

  it("is workspace scoped and validates its query", async () => {
    await schedule(OTHER, "Theirs", iso(-60_000));

    const mine = await readJson<{ reminders: unknown[] }>(
      await dueReminders(get("/api/notifications/due", { workspaceId: WORKSPACE })),
    );
    expect(mine.reminders).toEqual([]);

    const invalid = await dueReminders(
      get("/api/notifications/due", {
        workspaceId: WORKSPACE,
        query: { withinMinutes: 99_999 },
      }),
    );
    expect(invalid.status).toBe(400);
  });

  it("leaves acknowledgement to the client", async () => {
    await schedule(WORKSPACE, "Still pending", iso(-60_000));
    await dueReminders(get("/api/notifications/due", { workspaceId: WORKSPACE }));

    const listed = await readJson<{ reminders: { sent: boolean }[] }>(
      await listReminders(
        get("/api/reminders", { workspaceId: WORKSPACE, query: { pending: "true" } }),
      ),
    );
    expect(listed.reminders).toHaveLength(1);
    expect(listed.reminders[0].sent).toBe(false);
  });
});

describe("POST /api/notifications/dispatch", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it("reports candidates without acknowledging when push is not configured", async () => {
    await schedule(WORKSPACE, "Due", iso(-60_000));

    const response = await dispatch(
      post("/api/notifications/dispatch", { workspaceId: WORKSPACE }),
    );
    const payload = await readJson<{
      dispatched: number;
      candidates: number;
      push: { configured: boolean };
    }>(response);

    expect(response.status).toBe(200);
    expect(payload.candidates).toBe(1);
    expect(payload.dispatched).toBe(0);
    expect(payload.push.configured).toBe(false);

    const pending = await readJson<{ count: number }>(
      await listReminders(
        get("/api/reminders", { workspaceId: WORKSPACE, query: { pending: "true" } }),
      ),
    );
    expect(pending.count).toBe(1);
  });

  it("attempts delivery for registered subscriptions when push is configured", async () => {
    process.env.VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
    await schedule(WORKSPACE, "Push me", iso(-1_000));
    await subscribe(
      post("/api/push/subscribe", {
        workspaceId: WORKSPACE,
        body: {
          endpoint: "https://push.example.com/subscription-1",
          keys: { p256dh: "p256dh-value", auth: "auth-value" },
        },
      }),
    );

    const response = await dispatch(
      post("/api/notifications/dispatch", { workspaceId: WORKSPACE }),
    );
    const payload = await readJson<{
      dispatched: number;
      candidates: number;
      push: { configured: boolean; subscriptions: number; failed: number };
    }>(response);

    expect(payload.push).toMatchObject({ configured: true, subscriptions: 1 });
    // The fake endpoint cannot be reached, so nothing is acknowledged.
    expect(payload.push.failed).toBe(1);
    expect(payload.dispatched).toBe(0);
  });

  it("rejects a bad bearer token when CRON_SECRET is set", async () => {
    process.env.CRON_SECRET = "s3cret";

    const unauthorized = await dispatch(
      post("/api/notifications/dispatch", { workspaceId: WORKSPACE }),
    );
    expect(unauthorized.status).toBe(401);

    const authorized = await dispatch(
      post("/api/notifications/dispatch", {
        workspaceId: WORKSPACE,
        headers: { authorization: "Bearer s3cret" },
      }),
    );
    expect(authorized.status).toBe(200);
  });

  it("returns no candidates for an empty workspace", async () => {
    const payload = await readJson<{ candidates: number; dispatched: number }>(
      await dispatch(post("/api/notifications/dispatch", { workspaceId: "empty-workspace" })),
    );
    expect(payload).toMatchObject({ candidates: 0, dispatched: 0 });
  });
});
