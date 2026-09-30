import { apiError, json, parseQuery, route } from "@/lib/http";
import { sendReminderPush } from "@/lib/notifications/webpush";
import { listDueReminders, markReminderSent } from "@/lib/repositories/reminders";
import { dueQuerySchema } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/dispatch
 *
 * Backend-driven reminder delivery. Intended to be triggered by a scheduler
 * (Vercel Cron on a paid plan, GitHub Actions, cron-job.org, ...) so that users
 * receive reminders even when the app is closed.
 *
 * Set `CRON_SECRET` in the environment to protect the endpoint; callers must
 * then send `Authorization: Bearer <CRON_SECRET>`.
 */
export const POST = route(async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return apiError("Unauthorized", 401);
    }
  }

  const query = parseQuery(request, dueQuerySchema);
  if (!query.ok) return query.response!;

  const workspaceId = resolveWorkspaceId(request);
  const due = await listDueReminders(workspaceId, {
    withinMinutes: query.data!.withinMinutes,
    limit: query.data!.limit,
  });

  const push = await sendReminderPush(workspaceId, due);
  // `deliveredReminderIds` is internal bookkeeping; the response keeps its
  // documented `push` summary shape (configured/subscriptions/delivered/...).
  const { deliveredReminderIds, ...pushSummary } = push;

  // Only reminders that were actually pushed are marked as delivered; anything
  // that failed stays pending so the in-app poller can still surface it.
  const acknowledged: string[] = [];
  for (const reminderId of deliveredReminderIds) {
    const updated = await markReminderSent(workspaceId, reminderId);
    if (updated) acknowledged.push(updated.id);
  }

  return json({
    dispatched: acknowledged.length,
    candidates: due.length,
    push: pushSummary,
  });
});
