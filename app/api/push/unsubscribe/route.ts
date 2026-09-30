import { apiError, json, parseBody, route } from "@/lib/http";
import { deletePushSubscription } from "@/lib/repositories/pushSubscriptions";
import { pushUnsubscribeSchema } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** POST /api/push/unsubscribe - forget a browser push subscription. */
export const POST = route(async (request: Request) => {
  const body = await parseBody(request, pushUnsubscribeSchema);
  if (!body.ok) return body.response!;

  const deleted = await deletePushSubscription(
    resolveWorkspaceId(request),
    body.data!.endpoint,
  );
  if (!deleted) return apiError("Subscription not found", 404);
  return json({ deleted: true });
});
