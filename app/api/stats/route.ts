import { json, route } from "@/lib/http";
import { getWorkspaceStats } from "@/lib/repositories/stats";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** GET /api/stats - aggregated counters for the dashboard. */
export const GET = route(async (request: Request) => {
  const stats = await getWorkspaceStats(resolveWorkspaceId(request));
  return json({ stats });
});
