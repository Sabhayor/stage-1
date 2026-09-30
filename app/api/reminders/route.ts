import { json, parseBody, parseQuery, route } from "@/lib/http";
import { createReminder, listReminders } from "@/lib/repositories/reminders";
import { reminderCreateSchema, reminderQuerySchema } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** GET /api/reminders - list reminders (filter by window and `pending`). */
export const GET = route(async (request: Request) => {
  const query = parseQuery(request, reminderQuerySchema);
  if (!query.ok) return query.response!;

  const reminders = await listReminders(resolveWorkspaceId(request), {
    from: query.data!.from,
    to: query.data!.to,
    pending:
      query.data!.pending === undefined ? undefined : query.data!.pending === "true",
    limit: query.data!.limit,
  });
  return json({ reminders, count: reminders.length });
});

/** POST /api/reminders - schedule a reminder. */
export const POST = route(async (request: Request) => {
  const body = await parseBody(request, reminderCreateSchema);
  if (!body.ok) return body.response!;

  const reminder = await createReminder(resolveWorkspaceId(request), body.data!);
  return json({ reminder }, 201);
});
