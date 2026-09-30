import { json, parseBody, route } from "@/lib/http";
import { countPushSubscriptions, savePushSubscription } from "@/lib/repositories/pushSubscriptions";
import { pushSubscribeSchema } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** POST /api/push/subscribe - persist a browser push subscription. */
export const POST = route(async (request: Request) => {
  const body = await parseBody(request, pushSubscribeSchema);
  if (!body.ok) return body.response!;

  const workspaceId = resolveWorkspaceId(request);
  const subscription = await savePushSubscription(workspaceId, body.data!);
  const total = await countPushSubscriptions(workspaceId);

  return json(
    {
      subscription: { id: subscription.id, endpoint: subscription.endpoint },
      subscriptions: total,
    },
    201,
  );
});
