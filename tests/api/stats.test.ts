import { describe, expect, it } from "vitest";
import { POST as createTodo } from "@/app/api/todos/route";
import { PATCH as patchTodo } from "@/app/api/todos/[id]/route";
import { POST as createNote } from "@/app/api/notes/route";
import { POST as createEvent } from "@/app/api/events/route";
import { POST as createReminder } from "@/app/api/reminders/route";
import { GET as stats } from "@/app/api/stats/route";
import { get, params, patch, post, readJson } from "@/tests/helpers/api";

interface StatsPayload {
  stats: {
    todos: { total: number; active: number; completed: number; overdue: number; dueToday: number };
    notes: { total: number; pinned: number };
    events: { total: number; upcoming: number };
    reminders: { total: number; pending: number; due: number };
  };
}

const WORKSPACE = "test-workspace";
const OTHER = "other-workspace";

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

describe("GET /api/stats", () => {
  it("returns zeroed counters for an empty workspace", async () => {
    const response = await stats(get("/api/stats", { workspaceId: OTHER }));
    const payload = await readJson<StatsPayload>(response);

    expect(response.status).toBe(200);
    expect(payload.stats.todos).toEqual({
      total: 0,
      active: 0,
      completed: 0,
      overdue: 0,
      dueToday: 0,
    });
    expect(payload.stats.notes).toEqual({ total: 0, pinned: 0 });
    expect(payload.stats.events).toEqual({ total: 0, upcoming: 0 });
    expect(payload.stats.reminders).toEqual({ total: 0, pending: 0, due: 0 });
  });

  it("aggregates todos, notes, events and reminders", async () => {
    const overdue = await readJson<{ todo: { id: string } }>(
      await createTodo(
        post("/api/todos", {
          workspaceId: WORKSPACE,
          body: { title: "Overdue", dueAt: iso(-86_400_000) },
        }),
      ),
    );
    await createTodo(
      post("/api/todos", {
        workspaceId: WORKSPACE,
        body: { title: "Later today", dueAt: iso(60 * 60 * 1000) },
      }),
    );

    const completed = await readJson<{ todo: { id: string } }>(
      await createTodo(
        post("/api/todos", { workspaceId: WORKSPACE, body: { title: "Done" } }),
      ),
    );
    await patchTodo(
      patch(`/api/todos/${completed.todo.id}`, {
        workspaceId: WORKSPACE,
        body: { completed: true },
      }),
      params({ id: completed.todo.id }),
    );

    await createNote(
      post("/api/notes", { workspaceId: WORKSPACE, body: { title: "Pinned", pinned: true } }),
    );
    await createNote(post("/api/notes", { workspaceId: WORKSPACE, body: { title: "Plain" } }));

    await createEvent(
      post("/api/events", {
        workspaceId: WORKSPACE,
        body: { title: "Future", startAt: iso(7_200_000) },
      }),
    );
    await createEvent(
      post("/api/events", {
        workspaceId: WORKSPACE,
        body: { title: "Past", startAt: iso(-172_800_000) },
      }),
    );

    await createReminder(
      post("/api/reminders", {
        workspaceId: WORKSPACE,
        body: { title: "Due", remindAt: iso(-60_000) },
      }),
    );
    await createReminder(
      post("/api/reminders", {
        workspaceId: WORKSPACE,
        body: { title: "Pending", remindAt: iso(3_600_000) },
      }),
    );

    const payload = await readJson<StatsPayload>(
      await stats(get("/api/stats", { workspaceId: WORKSPACE })),
    );

    expect(payload.stats.todos).toMatchObject({
      total: 3,
      active: 2,
      completed: 1,
      overdue: 1,
      dueToday: 1,
    });
    expect(payload.stats.notes).toEqual({ total: 2, pinned: 1 });
    expect(payload.stats.events).toEqual({ total: 2, upcoming: 1 });
    expect(payload.stats.reminders).toEqual({ total: 2, pending: 2, due: 1 });

    // The overdue todo still exists in the workspace it was created in.
    expect(overdue.todo.id).toBeTruthy();
  });

  it("does not count records from another workspace", async () => {
    await createTodo(
      post("/api/todos", { workspaceId: OTHER, body: { title: "Not mine" } }),
    );
    const payload = await readJson<StatsPayload>(
      await stats(get("/api/stats", { workspaceId: WORKSPACE })),
    );
    expect(payload.stats.todos.total).toBe(0);
  });
});
