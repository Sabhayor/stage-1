import { json, parseQuery, route } from "@/lib/http";
import { listDueReminders } from "@/lib/repositories/reminders";
import { dueQuerySchema } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/due
 *
 * Returns the reminders that should be surfaced to the user right now. The
 * browser polls this endpoint (see `ReminderEngine`) and raises a Notification
 * for every item it receives. Reminders are *not* marked as sent here - the
 * client acknowledges them explicitly, which keeps polling idempotent.
 */
export const GET = route(async (request: Request) => {
  const query = parseQuery(request, dueQuerySchema);
  if (!query.ok) return query.response!;

  const reminders = await listDueReminders(resolveWorkspaceId(request), {
    withinMinutes: query.data!.withinMinutes,
    limit: query.data!.limit,
  });
  return json({ reminders, count: reminders.length, checkedAt: new Date().toISOString() });
});
