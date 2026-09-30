import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/todos/route";
import { DELETE, GET as GET_ONE, PATCH } from "@/app/api/todos/[id]/route";
import { del, get, params, patch, post, readJson } from "@/tests/helpers/api";

interface TodoPayload {
  id: string;
  workspaceId: string;
  title: string;
  notes: string;
  priority: string;
  dueAt: string | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const WORKSPACE = "test-workspace";
const OTHER = "other-workspace";

async function create(workspaceId: string, body: Record<string, unknown>) {
  const response = await POST(post("/api/todos", { workspaceId, body }));
  return { response, payload: await readJson<{ todo: TodoPayload }>(response) };
}

function nowPlus(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

describe("POST /api/todos", () => {
  it("creates a todo with defaults", async () => {
    const { response, payload } = await create(WORKSPACE, { title: "Write tests" });

    expect(response.status).toBe(201);
    expect(payload.todo).toMatchObject({
      title: "Write tests",
      notes: "",
      priority: "medium",
      dueAt: null,
      completed: false,
      completedAt: null,
      workspaceId: WORKSPACE,
    });
    expect(payload.todo.id).toBeTruthy();
    expect(Number.isNaN(Date.parse(payload.todo.createdAt))).toBe(false);
  });

  it("stores every provided field", async () => {
    const dueAt = "2030-01-02T09:30:00.000Z";
    const { payload } = await create(WORKSPACE, {
      title: "Review PR",
      notes: "focus on the SQL",
      priority: "high",
      dueAt,
    });

    expect(payload.todo.priority).toBe("high");
    expect(payload.todo.notes).toBe("focus on the SQL");
    expect(payload.todo.dueAt).toBe(dueAt);
  });

  it("rejects a missing or blank title", async () => {
    for (const body of [{}, { title: "   " }, { title: "" }]) {
      const { response, payload } = await create(WORKSPACE, body);
      expect(response.status).toBe(400);
      expect(payload).toHaveProperty("error");
    }
  });

  it("rejects an unknown priority and a malformed dueAt", async () => {
    const badPriority = await POST(
      post("/api/todos", {
        workspaceId: WORKSPACE,
        body: { title: "x", priority: "urgent" },
      }),
    );
    expect(badPriority.status).toBe(400);
    const issues = await readJson<{ error: { issues: { path: string }[] } }>(badPriority);
    expect(issues.error.issues[0].path).toBe("priority");

    const badDate = await POST(
      post("/api/todos", {
        workspaceId: WORKSPACE,
        body: { title: "x", dueAt: "not-a-date" },
      }),
    );
    expect(badDate.status).toBe(400);
  });

  it("rejects a malformed JSON body", async () => {
    const request = new Request("http://localhost:3000/api/todos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe("GET /api/todos", () => {
  it("lists todos ordered by completion then due date", async () => {
    await create(WORKSPACE, { title: "B", dueAt: "2030-01-02T09:00:00.000Z" });
    await create(WORKSPACE, { title: "A", dueAt: "2030-01-01T09:00:00.000Z" });
    const third = await create(WORKSPACE, { title: "C" });
    await PATCH(
      patch(`/api/todos/${third.payload.todo.id}`, {
        workspaceId: WORKSPACE,
        body: { completed: true },
      }),
      params({ id: third.payload.todo.id }),
    );

    const response = await GET(get("/api/todos", { workspaceId: WORKSPACE }));
    const payload = await readJson<{ todos: TodoPayload[]; count: number }>(response);

    expect(response.status).toBe(200);
    expect(payload.count).toBe(3);
    expect(payload.todos.map((todo) => todo.title)).toEqual(["A", "B", "C"]);
  });

  it("filters by status and searches titles and notes", async () => {
    await create(WORKSPACE, { title: "Alpha", notes: "sprint planning" });
    const second = await create(WORKSPACE, { title: "Beta" });
    await PATCH(
      patch(`/api/todos/${second.payload.todo.id}`, {
        workspaceId: WORKSPACE,
        body: { completed: true },
      }),
      params({ id: second.payload.todo.id }),
    );

    const active = await readJson<{ todos: TodoPayload[] }>(
      await GET(get("/api/todos", { workspaceId: WORKSPACE, query: { status: "active" } })),
    );
    expect(active.todos.map((todo) => todo.title)).toEqual(["Alpha"]);

    const completed = await readJson<{ todos: TodoPayload[] }>(
      await GET(get("/api/todos", { workspaceId: WORKSPACE, query: { status: "completed" } })),
    );
    expect(completed.todos.map((todo) => todo.title)).toEqual(["Beta"]);

    const search = await readJson<{ todos: TodoPayload[] }>(
      await GET(get("/api/todos", { workspaceId: WORKSPACE, query: { q: "planning" } })),
    );
    expect(search.todos.map((todo) => todo.title)).toEqual(["Alpha"]);
  });

  it("filters by due dates (overdue, upcoming and an explicit window)", async () => {
    const past = nowPlus(-86_400_000);
    const future = nowPlus(86_400_000);
    await create(WORKSPACE, { title: "Overdue", dueAt: past });
    await create(WORKSPACE, { title: "Upcoming", dueAt: future });

    const overdue = await readJson<{ todos: TodoPayload[] }>(
      await GET(get("/api/todos", { workspaceId: WORKSPACE, query: { due: "overdue" } })),
    );
    expect(overdue.todos.map((todo) => todo.title)).toEqual(["Overdue"]);

    const upcoming = await readJson<{ todos: TodoPayload[] }>(
      await GET(get("/api/todos", { workspaceId: WORKSPACE, query: { due: "upcoming" } })),
    );
    expect(upcoming.todos.map((todo) => todo.title)).toEqual(["Upcoming"]);

    const window = await readJson<{ todos: TodoPayload[] }>(
      await GET(
        get("/api/todos", {
          workspaceId: WORKSPACE,
          query: { from: nowPlus(-172_800_000), to: nowPlus(0) },
        }),
      ),
    );
    expect(window.todos.map((todo) => todo.title)).toEqual(["Overdue"]);
  });

  it("rejects invalid query parameters", async () => {
    const response = await GET(
      get("/api/todos", { workspaceId: WORKSPACE, query: { status: "archived" } }),
    );
    expect(response.status).toBe(400);
  });

  it("never leaks todos from another workspace", async () => {
    await create(OTHER, { title: "Secret" });
    const payload = await readJson<{ todos: TodoPayload[] }>(
      await GET(get("/api/todos", { workspaceId: WORKSPACE })),
    );
    expect(payload.todos).toEqual([]);
  });
});

describe("/api/todos/:id", () => {
  it("returns a single todo and 404 for unknown ids", async () => {
    const { payload } = await create(WORKSPACE, { title: "Single" });

    const found = await GET_ONE(
      get(`/api/todos/${payload.todo.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.todo.id }),
    );
    expect(found.status).toBe(200);
    expect((await readJson<{ todo: TodoPayload }>(found)).todo.title).toBe("Single");

    const missing = await GET_ONE(
      get("/api/todos/does-not-exist", { workspaceId: WORKSPACE }),
      params({ id: "does-not-exist" }),
    );
    expect(missing.status).toBe(404);
  });

  it("patches fields and tracks completion timestamps", async () => {
    const { payload } = await create(WORKSPACE, { title: "Patchable" });

    const renamed = await PATCH(
      patch(`/api/todos/${payload.todo.id}`, {
        workspaceId: WORKSPACE,
        body: { title: "Renamed", priority: "low", dueAt: "2031-05-05T05:05:05.000Z" },
      }),
      params({ id: payload.todo.id }),
    );
    expect((await readJson<{ todo: TodoPayload }>(renamed)).todo).toMatchObject({
      title: "Renamed",
      priority: "low",
      dueAt: "2031-05-05T05:05:05.000Z",
      completed: false,
    });

    const completed = await PATCH(
      patch(`/api/todos/${payload.todo.id}`, {
        workspaceId: WORKSPACE,
        body: { completed: true },
      }),
      params({ id: payload.todo.id }),
    );
    const completedTodo = (await readJson<{ todo: TodoPayload }>(completed)).todo;
    expect(completedTodo.completed).toBe(true);
    expect(completedTodo.completedAt).not.toBeNull();

    const reopened = await PATCH(
      patch(`/api/todos/${payload.todo.id}`, {
        workspaceId: WORKSPACE,
        body: { completed: false },
      }),
      params({ id: payload.todo.id }),
    );
    expect((await readJson<{ todo: TodoPayload }>(reopened)).todo.completedAt).toBeNull();
  });

  it("clears dueAt when it is explicitly set to null", async () => {
    const { payload } = await create(WORKSPACE, {
      title: "Dated",
      dueAt: "2030-02-02T02:02:02.000Z",
    });

    const response = await PATCH(
      patch(`/api/todos/${payload.todo.id}`, {
        workspaceId: WORKSPACE,
        body: { dueAt: null },
      }),
      params({ id: payload.todo.id }),
    );
    expect((await readJson<{ todo: TodoPayload }>(response)).todo.dueAt).toBeNull();
  });

  it("rejects empty patches and invalid values", async () => {
    const { payload } = await create(WORKSPACE, { title: "Validated" });

    const empty = await PATCH(
      patch(`/api/todos/${payload.todo.id}`, { workspaceId: WORKSPACE, body: {} }),
      params({ id: payload.todo.id }),
    );
    expect(empty.status).toBe(400);

    const invalid = await PATCH(
      patch(`/api/todos/${payload.todo.id}`, {
        workspaceId: WORKSPACE,
        body: { priority: "nope" },
      }),
      params({ id: payload.todo.id }),
    );
    expect(invalid.status).toBe(400);
  });

  it("returns 404 for a todo owned by another workspace", async () => {
    const { payload } = await create(OTHER, { title: "Foreign" });

    const patched = await PATCH(
      patch(`/api/todos/${payload.todo.id}`, {
        workspaceId: WORKSPACE,
        body: { title: "Hijacked" },
      }),
      params({ id: payload.todo.id }),
    );
    expect(patched.status).toBe(404);

    const removed = await DELETE(
      del(`/api/todos/${payload.todo.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.todo.id }),
    );
    expect(removed.status).toBe(404);

    const stillThere = await GET_ONE(
      get(`/api/todos/${payload.todo.id}`, { workspaceId: OTHER }),
      params({ id: payload.todo.id }),
    );
    expect(stillThere.status).toBe(200);
  });

  it("deletes a todo and returns 404 afterwards", async () => {
    const { payload } = await create(WORKSPACE, { title: "Temporary" });

    const removed = await DELETE(
      del(`/api/todos/${payload.todo.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.todo.id }),
    );
    expect(removed.status).toBe(200);
    expect(await readJson(removed)).toMatchObject({
      deleted: true,
      id: payload.todo.id,
    });

    const gone = await GET_ONE(
      get(`/api/todos/${payload.todo.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.todo.id }),
    );
    expect(gone.status).toBe(404);

    const again = await DELETE(
      del(`/api/todos/${payload.todo.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.todo.id }),
    );
    expect(again.status).toBe(404);
  });
});

