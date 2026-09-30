import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/notes/route";
import { DELETE, GET as GET_ONE, PATCH } from "@/app/api/notes/[id]/route";
import { del, get, params, patch, post, readJson } from "@/tests/helpers/api";

interface NotePayload {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

const WORKSPACE = "test-workspace";
const OTHER = "other-workspace";

async function create(workspaceId: string, body: Record<string, unknown>) {
  const response = await POST(post("/api/notes", { workspaceId, body }));
  return { response, payload: await readJson<{ note: NotePayload }>(response) };
}

describe("POST /api/notes", () => {
  it("creates a note and derives a title from the first content line", async () => {
    const { response, payload } = await create(WORKSPACE, {
      content: "# Grocery list\nmilk, eggs",
    });

    expect(response.status).toBe(201);
    expect(payload.note.title).toBe("Grocery list");
    expect(payload.note.pinned).toBe(false);
    expect(payload.note.tags).toEqual([]);
    expect(payload.note.workspaceId).toBe(WORKSPACE);
  });

  it("falls back to 'Untitled note' for empty input", async () => {
    const { payload } = await create(WORKSPACE, {});
    expect(payload.note).toMatchObject({ title: "Untitled note", content: "" });
  });

  it("accepts tags as an array or a comma separated string", async () => {
    const { payload: fromArray } = await create(WORKSPACE, {
      title: "Array tags",
      tags: ["work", " urgent "],
    });
    expect(fromArray.note.tags).toEqual(["work", "urgent"]);

    const { payload: fromString } = await create(WORKSPACE, {
      title: "String tags",
      tags: "personal, ideas",
    });
    expect(fromString.note.tags).toEqual(["personal", "ideas"]);
  });

  it("rejects oversized content and wrong field types", async () => {
    const tooLong = await POST(
      post("/api/notes", {
        workspaceId: WORKSPACE,
        body: { title: "x", content: "a".repeat(20_001) },
      }),
    );
    expect(tooLong.status).toBe(400);

    const wrongType = await POST(
      post("/api/notes", {
        workspaceId: WORKSPACE,
        body: { title: "x", pinned: "yes" },
      }),
    );
    expect(wrongType.status).toBe(400);
  });
});

describe("GET /api/notes", () => {
  it("lists pinned notes first", async () => {
    await create(WORKSPACE, { title: "Unpinned older" });
    await create(WORKSPACE, { title: "Pinned", pinned: true });
    await create(WORKSPACE, { title: "Unpinned newer" });

    const payload = await readJson<{ notes: NotePayload[]; count: number }>(
      await GET(get("/api/notes", { workspaceId: WORKSPACE })),
    );

    expect(payload.count).toBe(3);
    expect(payload.notes[0].title).toBe("Pinned");
    expect(payload.notes.map((note) => note.title)).toContain("Unpinned newer");
  });

  it("searches title, content and tags and filters by pinned", async () => {
    await create(WORKSPACE, { title: "Roadmap", content: "Q3 planning" });
    await create(WORKSPACE, {
      title: "Recipe",
      content: "pasta",
      tags: ["cooking"],
      pinned: true,
    });

    const byContent = await readJson<{ notes: NotePayload[] }>(
      await GET(get("/api/notes", { workspaceId: WORKSPACE, query: { q: "planning" } })),
    );
    expect(byContent.notes.map((note) => note.title)).toEqual(["Roadmap"]);

    const byTag = await readJson<{ notes: NotePayload[] }>(
      await GET(get("/api/notes", { workspaceId: WORKSPACE, query: { q: "cooking" } })),
    );
    expect(byTag.notes.map((note) => note.title)).toEqual(["Recipe"]);

    const pinnedOnly = await readJson<{ notes: NotePayload[] }>(
      await GET(get("/api/notes", { workspaceId: WORKSPACE, query: { pinned: "true" } })),
    );
    expect(pinnedOnly.notes.map((note) => note.title)).toEqual(["Recipe"]);
  });

  it("rejects an invalid pinned filter", async () => {
    const response = await GET(
      get("/api/notes", { workspaceId: WORKSPACE, query: { pinned: "maybe" } }),
    );
    expect(response.status).toBe(400);
  });

  it("keeps workspaces isolated", async () => {
    await create(OTHER, { title: "Private" });
    const payload = await readJson<{ notes: NotePayload[] }>(
      await GET(get("/api/notes", { workspaceId: WORKSPACE })),
    );
    expect(payload.notes).toEqual([]);
  });
});

describe("/api/notes/:id", () => {
  it("reads, updates and deletes a note", async () => {
    const { payload } = await create(WORKSPACE, { title: "Draft", content: "v1" });

    const found = await GET_ONE(
      get(`/api/notes/${payload.note.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.note.id }),
    );
    expect((await readJson<{ note: NotePayload }>(found)).note.content).toBe("v1");

    const updated = await PATCH(
      patch(`/api/notes/${payload.note.id}`, {
        workspaceId: WORKSPACE,
        body: { content: "v2", pinned: true },
      }),
      params({ id: payload.note.id }),
    );
    expect((await readJson<{ note: NotePayload }>(updated)).note).toMatchObject({
      content: "v2",
      pinned: true,
      title: "Draft",
    });

    const removed = await DELETE(
      del(`/api/notes/${payload.note.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.note.id }),
    );
    expect(removed.status).toBe(200);

    const gone = await GET_ONE(
      get(`/api/notes/${payload.note.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.note.id }),
    );
    expect(gone.status).toBe(404);
  });

  it("re-derives the title when the title is cleared", async () => {
    const { payload } = await create(WORKSPACE, { title: "Old", content: "old body" });

    const updated = await PATCH(
      patch(`/api/notes/${payload.note.id}`, {
        workspaceId: WORKSPACE,
        body: { title: "", content: "Fresh start\nmore text" },
      }),
      params({ id: payload.note.id }),
    );
    expect((await readJson<{ note: NotePayload }>(updated)).note.title).toBe("Fresh start");
  });

  it("returns 404 for unknown ids and other workspaces", async () => {
    const { payload } = await create(OTHER, { title: "Foreign" });

    const missing = await GET_ONE(
      get("/api/notes/missing", { workspaceId: WORKSPACE }),
      params({ id: "missing" }),
    );
    expect(missing.status).toBe(404);

    const crossPatch = await PATCH(
      patch(`/api/notes/${payload.note.id}`, {
        workspaceId: WORKSPACE,
        body: { pinned: true },
      }),
      params({ id: payload.note.id }),
    );
    expect(crossPatch.status).toBe(404);

    const crossDelete = await DELETE(
      del(`/api/notes/${payload.note.id}`, { workspaceId: WORKSPACE }),
      params({ id: payload.note.id }),
    );
    expect(crossDelete.status).toBe(404);
  });

  it("validates patches", async () => {
    const { payload } = await create(WORKSPACE, { title: "Validated" });

    const empty = await PATCH(
      patch(`/api/notes/${payload.note.id}`, { workspaceId: WORKSPACE, body: {} }),
      params({ id: payload.note.id }),
    );
    expect(empty.status).toBe(400);

    const badTags = await PATCH(
      patch(`/api/notes/${payload.note.id}`, {
        workspaceId: WORKSPACE,
        body: { tags: [1, 2, 3] },
      }),
      params({ id: payload.note.id }),
    );
    expect(badTags.status).toBe(400);
  });
});
