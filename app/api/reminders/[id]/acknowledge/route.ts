import { apiError, json, readParams, route } from "@/lib/http";
import { markReminderSent } from "@/lib/repositories/reminders";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/reminders/:id/acknowledge
 *
 * Idempotently flags a reminder as delivered. The browser calls this after it
 * has shown a notification so the reminder is not shown twice (and so the
 * scheduled dispatcher skips it).
 */
export const POST = route(async (request: Request, context: Context) => {
  const { id } = await readParams(context);
  const reminder = await markReminderSent(resolveWorkspaceId(request), id);
  if (!reminder) return apiError("Reminder not found", 404);
  return json({ reminder });
});
