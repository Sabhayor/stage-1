import { json, route } from "@/lib/http";
import { getVapidConfig } from "@/lib/notifications/webpush";
import { countPushSubscriptions } from "@/lib/repositories/pushSubscriptions";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * GET /api/push/vapid-public-key
 *
 * Hands the public VAPID key to the browser so it can create a
 * `PushSubscription`. Returns `configured: false` when the deployment has no
 * VAPID keys, which the UI surfaces as "background push not configured".
 */
export const GET = route(async (request: Request) => {
  const config = getVapidConfig();
  const subscriptions = await countPushSubscriptions(resolveWorkspaceId(request));
  return json({
    configured: Boolean(config),
    publicKey: config?.publicKey ?? null,
    subscriptions,
  });
});
