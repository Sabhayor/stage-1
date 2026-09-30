import { getDatabase } from "@/lib/db";
import { hasOwn, requireIso, toIso } from "@/lib/serialize";

/** Raw `reminders` row (`SELECT *`). Type alias => implicit index signature. */
type ReminderRow = {
  id: string;
  workspace_id: string;
  title: string;
  body: string;
  remind_at: Date | string;
  target_type: string;
  target_id: string | null;
  sent: boolean;
  sent_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export interface Reminder {
  id: string;
  workspaceId: string;
  title: string;
  body: string;
  remindAt: string;
  targetType: string;
  targetId: string | null;
  sent: boolean;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderListOptions {
  from?: string;
  to?: string;
  pending?: boolean;
  limit?: number;
}

export function mapReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    body: row.body,
    remindAt: requireIso(row.remind_at),
    targetType: row.target_type,
    targetId: row.target_id,
    sent: Boolean(row.sent),
    sentAt: toIso(row.sent_at),
    createdAt: requireIso(row.created_at),
    updatedAt: requireIso(row.updated_at),
  };
}

export async function listReminders(
  workspaceId: string,
  options: ReminderListOptions = {},
): Promise<Reminder[]> {
  const db = await getDatabase();
  const where = ["workspace_id = $1"];
  const params: unknown[] = [workspaceId];

  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (options.pending !== undefined) {
    where.push(`sent = ${add(!options.pending)}`);
  }
  if (options.from) where.push(`remind_at >= ${add(options.from)}`);
  if (options.to) where.push(`remind_at <= ${add(options.to)}`);
  const limit = add(options.limit ?? 200);

  const rows = await db.query<ReminderRow>(
    `SELECT * FROM reminders
      WHERE ${where.join(" AND ")}
      ORDER BY sent ASC, remind_at ASC
      LIMIT ${limit}`,
    params,
  );
  return rows.map(mapReminder);
}

export async function getReminder(
  workspaceId: string,
  id: string,
): Promise<Reminder | null> {
  const db = await getDatabase();
  const rows = await db.query<ReminderRow>(
    "SELECT * FROM reminders WHERE workspace_id = $1 AND id = $2",
    [workspaceId, id],
  );
  return rows[0] ? mapReminder(rows[0]) : null;
}

export interface ReminderInput {
  title: string;
  body?: string;
  remindAt: string;
  targetType?: string;
  targetId?: string | null;
}

export async function createReminder(
  workspaceId: string,
  input: ReminderInput,
): Promise<Reminder> {
  const db = await getDatabase();
  const targetType = input.targetType ?? "standalone";
  const rows = await db.query<ReminderRow>(
    `INSERT INTO reminders
       (id, workspace_id, title, body, remind_at, target_type, target_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      crypto.randomUUID(),
      workspaceId,
      input.title,
      input.body ?? "",
      input.remindAt,
      targetType,
      targetType === "standalone" ? null : (input.targetId ?? null),
    ],
  );
  return mapReminder(rows[0]);
}

export interface ReminderPatch {
  title?: string;
  body?: string;
  remindAt?: string;
  targetType?: string;
  targetId?: string | null;
  sent?: boolean;
}

export async function updateReminder(
  workspaceId: string,
  id: string,
  patch: ReminderPatch,
): Promise<Reminder | null> {
  const db = await getDatabase();
  const assignments: string[] = [];
  const params: unknown[] = [workspaceId, id];

  const add = (column: string, value: unknown): void => {
    params.push(value);
    assignments.push(`${column} = $${params.length}`);
  };

  if (hasOwn(patch, "title")) add("title", patch.title);
  if (hasOwn(patch, "body")) add("body", patch.body);
  if (hasOwn(patch, "remindAt")) add("remind_at", patch.remindAt);
  if (hasOwn(patch, "targetType")) add("target_type", patch.targetType);
  if (hasOwn(patch, "targetId")) add("target_id", patch.targetId ?? null);
  if (hasOwn(patch, "sent")) {
    add("sent", Boolean(patch.sent));
    add("sent_at", patch.sent ? new Date().toISOString() : null);
  }
  if (assignments.length === 0) return getReminder(workspaceId, id);

  assignments.push("updated_at = now()");

  const rows = await db.query<ReminderRow>(
    `UPDATE reminders SET ${assignments.join(", ")}
      WHERE workspace_id = $1 AND id = $2
      RETURNING *`,
    params,
  );
  return rows[0] ? mapReminder(rows[0]) : null;
}

export async function deleteReminder(
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.query<{ id: string }>(
    "DELETE FROM reminders WHERE workspace_id = $1 AND id = $2 RETURNING id",
    [workspaceId, id],
  );
  return rows.length > 0;
}

/**
 * Pending reminders that are due (optionally within the next `withinMinutes`),
 * oldest first. Powers the in-app notification poller and the dispatch endpoint.
 */
export async function listDueReminders(
  workspaceId: string,
  options: { withinMinutes?: number; limit?: number; now?: Date } = {},
): Promise<Reminder[]> {
  const db = await getDatabase();
  const now = options.now ?? new Date();
  const threshold = new Date(
    now.getTime() + (options.withinMinutes ?? 0) * 60 * 1000,
  ).toISOString();

  const rows = await db.query<ReminderRow>(
    `SELECT * FROM reminders
      WHERE workspace_id = $1 AND sent = false AND remind_at <= $2
      ORDER BY remind_at ASC
      LIMIT $3`,
    [workspaceId, threshold, options.limit ?? 50],
  );
  return rows.map(mapReminder);
}

/** Mark a reminder as delivered and return the updated record. */
export async function markReminderSent(
  workspaceId: string,
  id: string,
): Promise<Reminder | null> {
  const db = await getDatabase();
  const rows = await db.query<ReminderRow>(
    `UPDATE reminders
        SET sent = true, sent_at = now(), updated_at = now()
      WHERE workspace_id = $1 AND id = $2
      RETURNING *`,
    [workspaceId, id],
  );
  return rows[0] ? mapReminder(rows[0]) : null;
}
