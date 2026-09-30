import { apiError, json, parseBody, readParams, route } from "@/lib/http";
import { deleteEvent, getEvent, updateEvent } from "@/lib/repositories/events";
import { eventUpdateSchema } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

/** GET /api/events/:id */
export const GET = route(async (request: Request, context: Context) => {
  const { id } = await readParams(context);
  const event = await getEvent(resolveWorkspaceId(request), id);
  if (!event) return apiError("Event not found", 404);
  return json({ event });
});

/** PATCH /api/events/:id - moving `startAt` keeps the original duration. */
export const PATCH = route(async (request: Request, context: Context) => {
  const { id } = await readParams(context);
  const body = await parseBody(request, eventUpdateSchema);
  if (!body.ok) return body.response!;

  const event = await updateEvent(resolveWorkspaceId(request), id, body.data!);
  if (!event) return apiError("Event not found", 404);
  return json({ event });
});

/** DELETE /api/events/:id */
export const DELETE = route(async (request: Request, context: Context) => {
  const { id } = await readParams(context);
  const deleted = await deleteEvent(resolveWorkspaceId(request), id);
  if (!deleted) return apiError("Event not found", 404);
  return json({ deleted: true, id });
});
