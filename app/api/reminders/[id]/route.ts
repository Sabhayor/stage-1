import { apiError, json, parseBody, readParams, route } from "@/lib/http";
import {
  deleteReminder,
  getReminder,
  updateReminder,
} from "@/lib/repositories/reminders";
import { reminderUpdateSchema } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

/** GET /api/reminders/:id */
export const GET = route(async (request: Request, context: Context) => {
  const { id } = await readParams(context);
  const reminder = await getReminder(resolveWorkspaceId(request), id);
  if (!reminder) return apiError("Reminder not found", 404);
  return json({ reminder });
});

/** PATCH /api/reminders/:id - reschedule, edit or mark as sent. */
export const PATCH = route(async (request: Request, context: Context) => {
  const { id } = await readParams(context);
  const body = await parseBody(request, reminderUpdateSchema);
  if (!body.ok) return body.response!;

  const reminder = await updateReminder(
    resolveWorkspaceId(request),
    id,
    body.data!,
  );
  if (!reminder) return apiError("Reminder not found", 404);
  return json({ reminder });
});

/** DELETE /api/reminders/:id */
export const DELETE = route(async (request: Request, context: Context) => {
  const { id } = await readParams(context);
  const deleted = await deleteReminder(resolveWorkspaceId(request), id);
  if (!deleted) return apiError("Reminder not found", 404);
  return json({ deleted: true, id });
});

/** POST is not supported here - use /api/reminders/:id/acknowledge instead. */
