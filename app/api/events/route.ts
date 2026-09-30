import { json, parseBody, parseQuery, route } from "@/lib/http";
import { createEvent, listEvents } from "@/lib/repositories/events";
import { eventCreateSchema, eventQuerySchema } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** GET /api/events - list calendar events overlapping the `from`/`to` window. */
export const GET = route(async (request: Request) => {
  const query = parseQuery(request, eventQuerySchema);
  if (!query.ok) return query.response!;

  const events = await listEvents(resolveWorkspaceId(request), query.data!);
  return json({ events, count: events.length });
});

/** POST /api/events - create a calendar event. */
export const POST = route(async (request: Request) => {
  const body = await parseBody(request, eventCreateSchema);
  if (!body.ok) return body.response!;

  const event = await createEvent(resolveWorkspaceId(request), body.data!);
  return json({ event }, 201);
});
