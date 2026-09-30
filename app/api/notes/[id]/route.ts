import { apiError, json, parseBody, readParams, route } from "@/lib/http";
import { deleteNote, getNote, updateNote } from "@/lib/repositories/notes";
import { noteUpdateSchema } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

/** GET /api/notes/:id */
export const GET = route(async (request: Request, context: Context) => {
  const { id } = await readParams(context);
  const note = await getNote(resolveWorkspaceId(request), id);
  if (!note) return apiError("Note not found", 404);
  return json({ note });
});

/** PATCH /api/notes/:id */
export const PATCH = route(async (request: Request, context: Context) => {
  const { id } = await readParams(context);
  const body = await parseBody(request, noteUpdateSchema);
  if (!body.ok) return body.response!;

  const note = await updateNote(resolveWorkspaceId(request), id, body.data!);
  if (!note) return apiError("Note not found", 404);
  return json({ note });
});

/** DELETE /api/notes/:id */
export const DELETE = route(async (request: Request, context: Context) => {
  const { id } = await readParams(context);
  const deleted = await deleteNote(resolveWorkspaceId(request), id);
  if (!deleted) return apiError("Note not found", 404);
  return json({ deleted: true, id });
});
