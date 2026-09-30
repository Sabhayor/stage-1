import { json, route } from "@/lib/http";
import {
  describeStorage,
  getDatabase,
  isPersistentStorageConfigured,
} from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Liveness probe used by the deploy pipeline, the UI banner and the test suite.
 * It also opens a connection so a broken database surfaces here first.
 */
export const GET = route(async () => {
  const db = await getDatabase();
  const { driver, persistent } = describeStorage(db);
  const rows = await db.query<{ now: Date | string }>("SELECT now() AS now");

  return json({
    status: "ok",
    storage: {
      driver,
      persistent,
      configured: isPersistentStorageConfigured(),
    },
    databaseTime: new Date(rows[0]?.now ?? Date.now()).toISOString(),
    push: { configured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) },
  });
});
