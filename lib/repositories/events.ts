import { getDatabase } from "@/lib/db";
import { hasOwn, requireIso } from "@/lib/serialize";

/**
 * Raw `events` row as returned by `SELECT *`.
 *
 * Declared as a type alias (not an interface) on purpose: only type aliases get
 * an implicit index signature, which is what `SqlDatabase.query<T>` expects
 * (`T extends Record<string, unknown>`).
 */
type EventRow = {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  location: string;
  start_at: Date | string;
  end_at: Date | string;
  all_day: boolean;
  color: string;
  created_at: Date | string;
  updated_at: Date | string;
};

export interface CalendarEvent {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventListOptions {
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
}

/** One hour, used when an event is created without an explicit end. */
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

export function defaultEndAt(startAt: string, allDay: boolean): string {
  const start = new Date(startAt);
  if (allDay) {
    return new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(start.getTime() + DEFAULT_DURATION_MS).toISOString();
}

export function mapEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    description: row.description,
    location: row.location,
    startAt: requireIso(row.start_at),
    endAt: requireIso(row.end_at),
    allDay: Boolean(row.all_day),
    color: row.color,
    createdAt: requireIso(row.created_at),
    updatedAt: requireIso(row.updated_at),
  };
}

export async function listEvents(
  workspaceId: string,
  options: EventListOptions = {},
): Promise<CalendarEvent[]> {
  const db = await getDatabase();
  const where = ["workspace_id = $1"];
  const params: unknown[] = [workspaceId];

  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  // Overlap test: the event ends after the window starts and starts before it ends.
  if (options.from) where.push(`end_at >= ${add(options.from)}`);
  if (options.to) where.push(`start_at <= ${add(options.to)}`);
  if (options.q) {
    const placeholder = add(`%${options.q}%`);
    where.push(
      `(title ILIKE ${placeholder} OR description ILIKE ${placeholder} OR location ILIKE ${placeholder})`,
    );
  }
  const limit = add(options.limit ?? 200);

  const rows = await db.query<EventRow>(
    `SELECT * FROM events
      WHERE ${where.join(" AND ")}
      ORDER BY start_at ASC
      LIMIT ${limit}`,
    params,
  );
  return rows.map(mapEvent);
}

export async function getEvent(
  workspaceId: string,
  id: string,
): Promise<CalendarEvent | null> {
  const db = await getDatabase();
  const rows = await db.query<EventRow>(
    "SELECT * FROM events WHERE workspace_id = $1 AND id = $2",
    [workspaceId, id],
  );
  return rows[0] ? mapEvent(rows[0]) : null;
}

export interface EventInput {
  title: string;
  description?: string;
  location?: string;
  startAt: string;
  endAt?: string;
  allDay?: boolean;
  color?: string;
}

export async function createEvent(
  workspaceId: string,
  input: EventInput,
): Promise<CalendarEvent> {
  const db = await getDatabase();
  const allDay = Boolean(input.allDay);
  const rows = await db.query<EventRow>(
    `INSERT INTO events
       (id, workspace_id, title, description, location, start_at, end_at, all_day, color)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      crypto.randomUUID(),
      workspaceId,
      input.title,
      input.description ?? "",
      input.location ?? "",
      input.startAt,
      input.endAt ?? defaultEndAt(input.startAt, allDay),
      allDay,
      input.color ?? "indigo",
    ],
  );
  return mapEvent(rows[0]);
}

export interface EventPatch {
  title?: string;
  description?: string;
  location?: string;
  startAt?: string;
  endAt?: string | null;
  allDay?: boolean;
  color?: string;
}

export async function updateEvent(
  workspaceId: string,
  id: string,
  patch: EventPatch,
): Promise<CalendarEvent | null> {
  const db = await getDatabase();
  const assignments: string[] = [];
  const params: unknown[] = [workspaceId, id];

  const add = (column: string, value: unknown): void => {
    params.push(value);
    assignments.push(`${column} = $${params.length}`);
  };

  const current = await getEvent(workspaceId, id);
  if (!current) return null;

  if (hasOwn(patch, "title")) add("title", patch.title);
  if (hasOwn(patch, "description")) add("description", patch.description);
  if (hasOwn(patch, "location")) add("location", patch.location);
  if (hasOwn(patch, "allDay")) add("all_day", Boolean(patch.allDay));
  if (hasOwn(patch, "color")) add("color", patch.color);

  const startAt = patch.startAt ?? current.startAt;
  if (hasOwn(patch, "startAt")) add("start_at", startAt);

  const allDay = patch.allDay ?? current.allDay;
  if (hasOwn(patch, "endAt")) {
    add(
      "end_at",
      patch.endAt ?? defaultEndAt(patch.startAt ?? current.startAt, allDay),
    );
  } else if (hasOwn(patch, "startAt")) {
    // Keep the duration stable when only the start moves.
    const duration = Date.parse(current.endAt) - Date.parse(current.startAt);
    const nextEnd = new Date(Date.parse(startAt) + duration).toISOString();
    add("end_at", nextEnd);
  }

  if (assignments.length === 0) return current;
  assignments.push("updated_at = now()");

  const rows = await db.query<EventRow>(
    `UPDATE events SET ${assignments.join(", ")}
      WHERE workspace_id = $1 AND id = $2
      RETURNING *`,
    params,
  );
  return rows[0] ? mapEvent(rows[0]) : null;
}

export async function deleteEvent(
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.query<{ id: string }>(
    "DELETE FROM events WHERE workspace_id = $1 AND id = $2 RETURNING id",
    [workspaceId, id],
  );
  return rows.length > 0;
}
