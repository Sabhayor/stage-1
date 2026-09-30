import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/events/route";
import { DELETE, GET as GET_ONE, PATCH } from "@/app/api/events/[id]/route";
import { del, get, params, patch, post, readJson } from "@/tests/helpers/api";

interface EventPayload {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: string;
}

const WORKSPACE = "test-workspace";
const OTHER = "other-workspace";

async function create(workspaceId: string, body: Record<string, unknown>) {
  const response = await POST(post("/api/events", { workspaceId, body }));
  return { response, payload: await readJson<{ event: EventPayload }>(response) };
}

describe("POST /api/events", () => {
  it("defaults to a one hour event with the indigo colour", async () => {
    const startAt = "2030-06-01T10:00:00.000Z";
    const { response, payload } = await create(WORKSPACE, { title: "Standup", startAt });

    expect(response.status).toBe(201);
    expect(payload.event).toMatchObject({
      title: "Standup",
      startAt,
      endAt: "2030-06-01T11:00:00.000Z",
      allDay: false,
      color: "indigo",
      description: "",
      location: "",
      workspaceId: WORKSPACE,
    });
  });

  it("defaults all-day events to the next day", async () => {
    const { payload } = await create(WORKSPACE, {
      title: "Conference",
      startAt: "2030-06-01T00:00:00.000Z",
      allDay: true,
    });
    expect(payload.event.endAt).toBe("2030-06-02T00:00:00.000Z");
  });

  it("rejects a missing startAt and an end before the start", async () => {
    const missing = await POST(
      post("/api/events", { workspaceId: WORKSPACE, body: { title: "No date" } }),
    );
    expect(missing.status).toBe(400);

    const inverted = await POST(
      post("/api/events", {
        workspaceId: WORKSPACE,
        body: {
          title: "Backwards",
          startAt: "2030-06-01T12:00:00.000Z",
          endAt: "2030-06-01T09:00:00.000Z",
        },
      }),
    );
    expect(inverted.status).toBe(400);
    const issues = await readJson<{ error: { issues: { path: string }[] } }>(inverted);
    expect(issues.error.issues[0].path).toBe("endAt");
  });

  it("rejects an unknown colour", async () => {
    const response = await POST(
      post("/api/events", {
        workspaceId: WORKSPACE,
        body: { title: "Neon", startAt: "2030-06-01T10:00:00.000Z", color: "neon" },
      }),
    );
    expect(response.status).toBe(400);
  });
});

describe("GET /api/events", () => {
  it("returns events overlapping the requested window", async () => {
    await create(WORKSPACE, { title: "Before", startAt: "2030-01-01T10:00:00.000Z" });
    await create(WORKSPACE, { title: "Inside", startAt: "2030-06-15T10:00:00.000Z" });
    await create(WORKSPACE, { title: "After", startAt: "2030-12-01T10:00:00.000Z" });

    const payload = await readJson<{ events: EventPayload[]; count: number }>(
      await GET(
        get("/api/events", {
          workspaceId: WORKSPACE,
          query: { from: "2030-06-01T00:00:00.000Z", to: "2030-06-30T23:59:59.000Z" },
        }),
      ),
    );

    expect(payload.count).toBe(1);
    expect(payload.events[0].title).toBe("Inside");
  });

  it("orders chronologically and searches by title or location", async () => {
    await create(WORKSPACE, { title: "Later", startAt: "2030-06-20T10:00:00.000Z" });
    await create(WORKSPACE, {
      title: "Earlier",
      startAt: "2030-06-02T10:00:00.000Z",
      location: "Berlin office",
    });

    const all = await readJson<{ events: EventPayload[] }>(
      await GET(get("/api/events", { workspaceId: WORKSPACE })),
    );
    expect(all.events.map((event) => event.title)).toEqual(["Earlier", "Later"]);

    const search = await readJson<{ events: EventPayload[] }>(
      await GET(get("/api/events", { workspaceId: WORKSPACE, query: { q: "berlin" } })),
    );
    expect(search.events.map((event) => event.title)).toEqual(["Earlier"]);
  });

  it("rejects an invalid window and isolates workspaces", async () => {
    const invalid = await GET(
      get("/api/events", { workspaceId: WORKSPACE, query: { from: "yesterday" } }),
    );
    expect(invalid.status).toBe(400);

    await create(OTHER, { title: "Theirs", startAt: "2030-06-02T10:00:00.000Z" });
    const payload = await readJson<{ events: EventPayload[] }>(
      await GET(get("/api/events", { workspaceId: WORKSPACE })),
    );
    expect(payload.events).toEqual([]);
  });
});

describe("/api/events/:id", () => {
  it("reads, updates and deletes an event", async () => {
    const { payload } = await create(WORKSPACE, {
      title: "Review",
      startAt: "2030-06-01T10:00:00.000Z",
    });

    const found = await GET_ONE(
      get(`/api/events/${payload.event.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.event.id }),
    );
    expect(found.status).toBe(200);
    expect((await readJson<{ event: EventPayload }>(found)).event.title).toBe("Review");

    const updated = await PATCH(
      patch(`/api/events/${payload.event.id}`, {
        workspaceId: WORKSPACE,
        body: { title: "Design review", color: "rose", description: "with design" },
      }),
      params({ id: payload.event.id }),
    );
    expect((await readJson<{ event: EventPayload }>(updated)).event).toMatchObject({
      title: "Design review",
      color: "rose",
      description: "with design",
    });

    const removed = await DELETE(
      del(`/api/events/${payload.event.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.event.id }),
    );
    expect(removed.status).toBe(200);

    const gone = await GET_ONE(
      get(`/api/events/${payload.event.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.event.id }),
    );
    expect(gone.status).toBe(404);
  });

  it("keeps the duration when only the start moves", async () => {
    const { payload } = await create(WORKSPACE, {
      title: "Two hours",
      startAt: "2030-06-01T10:00:00.000Z",
      endAt: "2030-06-01T12:00:00.000Z",
    });

    const moved = await PATCH(
      patch(`/api/events/${payload.event.id}`, {
        workspaceId: WORKSPACE,
        body: { startAt: "2030-06-01T15:00:00.000Z" },
      }),
      params({ id: payload.event.id }),
    );
    const movedEvent = (await readJson<{ event: EventPayload }>(moved)).event;
    expect(movedEvent.startAt).toBe("2030-06-01T15:00:00.000Z");
    expect(movedEvent.endAt).toBe("2030-06-01T17:00:00.000Z");
  });

  it("falls back to a derived end when endAt is explicitly cleared", async () => {
    const { payload } = await create(WORKSPACE, {
      title: "Cleared",
      startAt: "2030-06-01T10:00:00.000Z",
      endAt: "2030-06-01T12:00:00.000Z",
    });

    const cleared = await PATCH(
      patch(`/api/events/${payload.event.id}`, {
        workspaceId: WORKSPACE,
        body: { endAt: null },
      }),
      params({ id: payload.event.id }),
    );
    expect((await readJson<{ event: EventPayload }>(cleared)).event.endAt).toBe(
      "2030-06-01T11:00:00.000Z",
    );
  });

  it("returns 404 for unknown ids and other workspaces", async () => {
    const { payload } = await create(OTHER, {
      title: "Foreign",
      startAt: "2030-06-01T10:00:00.000Z",
    });

    const missing = await GET_ONE(
      get("/api/events/missing", { workspaceId: WORKSPACE }),
      params({ id: "missing" }),
    );
    expect(missing.status).toBe(404);

    const crossPatch = await PATCH(
      patch(`/api/events/${payload.event.id}`, {
        workspaceId: WORKSPACE,
        body: { title: "Hijacked" },
      }),
      params({ id: payload.event.id }),
    );
    expect(crossPatch.status).toBe(404);

    const crossDelete = await DELETE(
      del(`/api/events/${payload.event.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.event.id }),
    );
    expect(crossDelete.status).toBe(404);
  });

  it("validates patches", async () => {
    const { payload } = await create(WORKSPACE, {
      title: "Validated",
      startAt: "2030-06-01T10:00:00.000Z",
    });

    const empty = await PATCH(
      patch(`/api/events/${payload.event.id}`, { workspaceId: WORKSPACE, body: {} }),
      params({ id: payload.event.id }),
    );
    expect(empty.status).toBe(400);

    const badTitle = await PATCH(
      patch(`/api/events/${payload.event.id}`, {
        workspaceId: WORKSPACE,
        body: { title: "   " },
      }),
      params({ id: payload.event.id }),
    );
    expect(badTitle.status).toBe(400);
  });
});
