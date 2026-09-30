import webpush from "web-push";
import {
  listPushSubscriptions,
  prunePushSubscription,
  toWebPushTarget,
} from "@/lib/repositories/pushSubscriptions";
import type { Reminder } from "@/lib/repositories/reminders";

export interface VapidConfiguration {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * Web push credentials are optional: without them the app still delivers
 * reminders in the foreground through the Notification API and simply reports
 * `configured: false` on the push endpoints.
 */
export function getVapidConfig(): VapidConfiguration | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;

  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT ?? "mailto:reminders@example.com",
  };
}

export interface PushDispatchResult {
  configured: boolean;
  subscriptions: number;
  delivered: number;
  pruned: number;
  failed: number;
  /**
   * Reminders that reached at least one subscription. Only these may be
   * acknowledged - a reminder whose push failed must stay pending so the in-app
   * poller can still surface it.
   */
  deliveredReminderIds: string[];
}

function payloadFor(reminder: Reminder): string {
  return JSON.stringify({
    title: reminder.title,
    body: reminder.body || "Reminder from your workspace",
    reminderId: reminder.id,
    remindAt: reminder.remindAt,
    targetType: reminder.targetType,
    targetId: reminder.targetId,
    url: reminder.targetType === "todo" ? "/todos" : "/reminders",
  });
}

/**
 * Send a browser push notification for every reminder in `reminders` to every
 * subscription registered for the workspace. Stale endpoints (404/410) are
 * pruned so they are not retried forever.
 */
export async function sendReminderPush(
  workspaceId: string,
  reminders: Reminder[],
): Promise<PushDispatchResult> {
  const config = getVapidConfig();
  const result: PushDispatchResult = {
    configured: Boolean(config),
    subscriptions: 0,
    delivered: 0,
    pruned: 0,
    failed: 0,
    deliveredReminderIds: [],
  };
  if (!config || reminders.length === 0) return result;

  // Count the registered devices first so a broken credential still reports how
  // many subscriptions would have been targeted.
  const subscriptions = await listPushSubscriptions(workspaceId);
  result.subscriptions = subscriptions.length;
  if (subscriptions.length === 0) return result;

  try {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  } catch (error) {
    // Unusable keys (e.g. a public key that is not a valid P-256 point) must not
    // fail the whole dispatch: report every attempt as failed and leave the
    // reminders pending for the in-app poller.
    result.failed = reminders.length * subscriptions.length;
    console.error("[push] invalid VAPID credentials", error);
    return result;
  }

  for (const reminder of reminders) {
    const payload = payloadFor(reminder);
    let delivered = false;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(toWebPushTarget(subscription), payload);
        result.delivered += 1;
        delivered = true;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prunePushSubscription(subscription.endpoint);
          result.pruned += 1;
        } else {
          result.failed += 1;
          console.error("[push] delivery failed", statusCode ?? error);
        }
      }
    }
    if (delivered) result.deliveredReminderIds.push(reminder.id);
  }

  return result;
}
