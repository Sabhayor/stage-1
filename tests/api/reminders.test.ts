import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/reminders/route";
import { DELETE, GET as GET_ONE, PATCH } from "@/app/api/reminders/[id]/route";
import { POST as ACK } from "@/app/api/reminders/[id]/acknowledge/route";
import { del, get, params, patch, post, readJson } from "@/tests/helpers/api";

interface ReminderPayload {
  id: string;
  workspaceId: string;
  title: string;
  body: string;
  remindAt: string;
  targetType: string;
  targetId: string | null;
  sent: boolean;
  sentAt: string | null;
}

const WORKSPACE = "test-workspace";
const OTHER = "other-workspace";

function nowPlus(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

async function create(workspaceId: string, body: Record<string, unknown>) {
  const response = await POST(post("/api/reminders", { workspaceId, body }));
  return { response, payload: await readJson<{ reminder: ReminderPayload }>(response) };
}

describe("POST /api/reminders", () => {
  it("schedules a standalone reminder", async () => {
    const remindAt = nowPlus(3_600_000);
    const { response, payload } = await create(WORKSPACE, { title: "Call mum", remindAt });

    expect(response.status).toBe(201);
    expect(payload.reminder).toMatchObject({
      title: "Call mum",
      body: "",
      remindAt,
      targetType: "standalone",
      targetId: null,
      sent: false,
      sentAt: null,
      workspaceId: WORKSPACE,
    });
  });

  it("links a reminder to another record", async () => {
    const { payload } = await create(WORKSPACE, {
      title: "Ship the release",
      remindAt: nowPlus(600_000),
      targetType: "todo",
      targetId: "todo-123",
      body: "run the smoke tests first",
    });

    expect(payload.reminder.targetType).toBe("todo");
    expect(payload.reminder.targetId).toBe("todo-123");
    expect(payload.reminder.body).toBe("run the smoke tests first");
  });

  it("drops targetId for standalone reminders", async () => {
    const { payload } = await create(WORKSPACE, {
      title: "Standalone",
      remindAt: nowPlus(60_000),
      targetId: "ignored",
    });
    expect(payload.reminder.targetId).toBeNull();
  });

  it("requires a title and a valid remindAt", async () => {
    const noTitle = await POST(
      post("/api/reminders", { workspaceId: WORKSPACE, body: { remindAt: nowPlus(1000) } }),
    );
    expect(noTitle.status).toBe(400);

    const noDate = await POST(
      post("/api/reminders", { workspaceId: WORKSPACE, body: { title: "x" } }),
    );
    expect(noDate.status).toBe(400);

    const badTarget = await POST(
      post("/api/reminders", {
        workspaceId: WORKSPACE,
        body: { title: "x", remindAt: nowPlus(1000), targetType: "meeting" },
      }),
    );
    expect(badTarget.status).toBe(400);
  });
});

describe("GET /api/reminders", () => {
  it("lists pending reminders before sent ones, ordered by time", async () => {
    await create(WORKSPACE, { title: "Later", remindAt: nowPlus(7_200_000) });
    await create(WORKSPACE, { title: "Sooner", remindAt: nowPlus(3_600_000) });
    const sent = await create(WORKSPACE, { title: "Done", remindAt: nowPlus(60_000) });
    await PATCH(
      patch(`/api/reminders/${sent.payload.reminder.id}`, {
        workspaceId: WORKSPACE,
        body: { sent: true },
      }),
      params({ id: sent.payload.reminder.id }),
    );

    const payload = await readJson<{ reminders: ReminderPayload[]; count: number }>(
      await GET(get("/api/reminders", { workspaceId: WORKSPACE })),
    );

    expect(payload.count).toBe(3);
    expect(payload.reminders.map((reminder) => reminder.title)).toEqual([
      "Sooner",
      "Later",
      "Done",
    ]);
  });

  it("filters by pending flag and by time window", async () => {
    await create(WORKSPACE, { title: "Past", remindAt: nowPlus(-60_000) });
    await create(WORKSPACE, { title: "Future", remindAt: nowPlus(86_400_000) });

    const pending = await readJson<{ reminders: ReminderPayload[] }>(
      await GET(get("/api/reminders", { workspaceId: WORKSPACE, query: { pending: "true" } })),
    );
    expect(pending.reminders).toHaveLength(2);

    const window = await readJson<{ reminders: ReminderPayload[] }>(
      await GET(
        get("/api/reminders", {
          workspaceId: WORKSPACE,
          query: { from: nowPlus(-3_600_000), to: nowPlus(3_600_000) },
        }),
      ),
    );
    expect(window.reminders.map((reminder) => reminder.title)).toEqual(["Past"]);
  });

  it("rejects an invalid pending value and isolates workspaces", async () => {
    const invalid = await GET(
      get("/api/reminders", { workspaceId: WORKSPACE, query: { pending: "perhaps" } }),
    );
    expect(invalid.status).toBe(400);

    await create(OTHER, { title: "Theirs", remindAt: nowPlus(1000) });
    const payload = await readJson<{ reminders: ReminderPayload[] }>(
      await GET(get("/api/reminders", { workspaceId: WORKSPACE })),
    );
    expect(payload.reminders).toEqual([]);
  });
});

describe("/api/reminders/:id", () => {
  it("reads, reschedules and deletes a reminder", async () => {
    const { payload } = await create(WORKSPACE, {
      title: "Reschedule me",
      remindAt: nowPlus(3_600_000),
    });

    const found = await GET_ONE(
      get(`/api/reminders/${payload.reminder.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.reminder.id }),
    );
    expect(found.status).toBe(200);

    const moved = await PATCH(
      patch(`/api/reminders/${payload.reminder.id}`, {
        workspaceId: WORKSPACE,
        body: { remindAt: nowPlus(7_200_000), title: "Moved", body: "snoozed" },
      }),
      params({ id: payload.reminder.id }),
    );
    const movedReminder = (await readJson<{ reminder: ReminderPayload }>(moved)).reminder;
    expect(movedReminder.title).toBe("Moved");
    expect(movedReminder.body).toBe("snoozed");
    expect(movedReminder.remindAt).not.toBe(payload.reminder.remindAt);

    const removed = await DELETE(
      del(`/api/reminders/${payload.reminder.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.reminder.id }),
    );
    expect(removed.status).toBe(200);

    const gone = await GET_ONE(
      get(`/api/reminders/${payload.reminder.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.reminder.id }),
    );
    expect(gone.status).toBe(404);
  });

  it("toggles the sent flag and its timestamp", async () => {
    const { payload } = await create(WORKSPACE, {
      title: "Toggle",
      remindAt: nowPlus(60_000),
    });

    const sent = await PATCH(
      patch(`/api/reminders/${payload.reminder.id}`, {
        workspaceId: WORKSPACE,
        body: { sent: true },
      }),
      params({ id: payload.reminder.id }),
    );
    const sentReminder = (await readJson<{ reminder: ReminderPayload }>(sent)).reminder;
    expect(sentReminder.sent).toBe(true);
    expect(sentReminder.sentAt).not.toBeNull();

    const pending = await PATCH(
      patch(`/api/reminders/${payload.reminder.id}`, {
        workspaceId: WORKSPACE,
        body: { sent: false },
      }),
      params({ id: payload.reminder.id }),
    );
    expect((await readJson<{ reminder: ReminderPayload }>(pending)).reminder.sentAt).toBeNull();
  });

  it("returns 404 for unknown ids, other workspaces and invalid patches", async () => {
    const { payload } = await create(OTHER, {
      title: "Foreign",
      remindAt: nowPlus(1000),
    });

    const missing = await GET_ONE(
      get("/api/reminders/missing", { workspaceId: WORKSPACE }),
      params({ id: "missing" }),
    );
    expect(missing.status).toBe(404);

    const crossPatch = await PATCH(
      patch(`/api/reminders/${payload.reminder.id}`, {
        workspaceId: WORKSPACE,
        body: { sent: true },
      }),
      params({ id: payload.reminder.id }),
    );
    expect(crossPatch.status).toBe(404);

    const emptyPatch = await PATCH(
      patch(`/api/reminders/${payload.reminder.id}`, {
        workspaceId: OTHER,
        body: {},
      }),
      params({ id: payload.reminder.id }),
    );
    expect(emptyPatch.status).toBe(400);
  });
});

describe("POST /api/reminders/:id/acknowledge", () => {
  it("marks a reminder as delivered", async () => {
    const { payload } = await create(WORKSPACE, {
      title: "Ack me",
      remindAt: nowPlus(-1000),
    });

    const response = await ACK(
      post(`/api/reminders/${payload.reminder.id}/acknowledge`, { workspaceId: WORKSPACE }),
      params({ id: payload.reminder.id }),
    );

    expect(response.status).toBe(200);
    const acknowledged = (await readJson<{ reminder: ReminderPayload }>(response)).reminder;
    expect(acknowledged.sent).toBe(true);
    expect(acknowledged.sentAt).not.toBeNull();
  });

  it("404s for an unknown reminder", async () => {
    const response = await ACK(
      post("/api/reminders/nope/acknowledge", { workspaceId: WORKSPACE }),
      params({ id: "nope" }),
    );
    expect(response.status).toBe(404);
  });
});
