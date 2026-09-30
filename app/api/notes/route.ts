import { json, parseBody, parseQuery, route } from "@/lib/http";
import { createNote, listNotes } from "@/lib/repositories/notes";
import { noteCreateSchema, noteQuerySchema } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** GET /api/notes - list notes (search with `q`, filter with `pinned`). */
export const GET = route(async (request: Request) => {
  const query = parseQuery(request, noteQuerySchema);
  if (!query.ok) return query.response!;

  const notes = await listNotes(resolveWorkspaceId(request), {
    q: query.data!.q,
    pinned:
      query.data!.pinned === undefined ? undefined : query.data!.pinned === "true",
    limit: query.data!.limit,
  });
  return json({ notes, count: notes.length });
});

/** POST /api/notes - create a note. */
export const POST = route(async (request: Request) => {
  const body = await parseBody(request, noteCreateSchema);
  if (!body.ok) return body.response!;

  const note = await createNote(resolveWorkspaceId(request), body.data!);
  return json({ note }, 201);
});
