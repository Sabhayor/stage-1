import { getDatabase } from "@/lib/db";
import { requireIso } from "@/lib/serialize";

/**
 * Raw `push_subscriptions` row (`SELECT *`).
 * Type alias => implicit index signature.
 */
type PushSubscriptionRow = {
  id: string;
  workspace_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: Date | string;
};

export interface PushSubscriptionRecord {
  id: string;
  workspaceId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
}

/** Shape expected by the `web-push` library. */
export interface WebPushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function mapPushSubscription(row: PushSubscriptionRow): PushSubscriptionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    createdAt: requireIso(row.created_at),
  };
}

export function toWebPushTarget(
  record: PushSubscriptionRecord,
): WebPushTarget {
  return {
    endpoint: record.endpoint,
    keys: { p256dh: record.p256dh, auth: record.auth },
  };
}

/**
 * Store (or refresh) a browser push subscription. Re-subscribing with the same
 * endpoint moves the subscription to the workspace that owns it now.
 */
export async function savePushSubscription(
  workspaceId: string,
  input: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<PushSubscriptionRecord> {
  const db = await getDatabase();
  const rows = await db.query<PushSubscriptionRow>(
    `INSERT INTO push_subscriptions (id, workspace_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET workspace_id = EXCLUDED.workspace_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth
     RETURNING *`,
    [
      crypto.randomUUID(),
      workspaceId,
      input.endpoint,
      input.keys.p256dh,
      input.keys.auth,
    ],
  );
  return mapPushSubscription(rows[0]);
}

export async function listPushSubscriptions(
  workspaceId: string,
): Promise<PushSubscriptionRecord[]> {
  const db = await getDatabase();
  const rows = await db.query<PushSubscriptionRow>(
    "SELECT * FROM push_subscriptions WHERE workspace_id = $1 ORDER BY created_at ASC",
    [workspaceId],
  );
  return rows.map(mapPushSubscription);
}

export async function countPushSubscriptions(
  workspaceId: string,
): Promise<number> {
  const db = await getDatabase();
  const rows = await db.query<{ count: string | number }>(
    "SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE workspace_id = $1",
    [workspaceId],
  );
  return Number(rows[0]?.count ?? 0);
}

/** Remove a subscription. Returns `false` when nothing matched. */
export async function deletePushSubscription(
  workspaceId: string,
  endpoint: string,
): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.query<{ id: string }>(
    "DELETE FROM push_subscriptions WHERE workspace_id = $1 AND endpoint = $2 RETURNING id",
    [workspaceId, endpoint],
  );
  return rows.length > 0;
}

/** Drop a subscription by endpoint only (used when a push provider says 410). */
export async function prunePushSubscription(endpoint: string): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM push_subscriptions WHERE endpoint = $1", [
    endpoint,
  ]);
}
