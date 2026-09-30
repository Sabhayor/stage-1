import { getDatabase } from "@/lib/db";
import { endOfTodayIso, startOfTodayIso } from "@/lib/repositories/todos";

export interface WorkspaceStats {
  todos: {
    total: number;
    active: number;
    completed: number;
    overdue: number;
    dueToday: number;
  };
  notes: { total: number; pinned: number };
  events: { total: number; upcoming: number };
  reminders: { total: number; pending: number; due: number };
}

async function scalar(sql: string, params: unknown[]): Promise<number> {
  const db = await getDatabase();
  const rows = await db.query<{ value: string | number }>(sql, params);
  return Number(rows[0]?.value ?? 0);
}

/** Aggregated counters rendered on the dashboard. */
export async function getWorkspaceStats(
  workspaceId: string,
  now: Date = new Date(),
): Promise<WorkspaceStats> {
  const nowIso = now.toISOString();
  const dayStart = startOfTodayIso(now);
  const dayEnd = endOfTodayIso(now);

  const [
    todosTotal,
    todosActive,
    todosCompleted,
    todosOverdue,
    todosDueToday,
    notesTotal,
    notesPinned,
    eventsTotal,
    eventsUpcoming,
    remindersTotal,
    remindersPending,
    remindersDue,
  ] = await Promise.all([
    scalar("SELECT COUNT(*)::int AS value FROM todos WHERE workspace_id = $1", [workspaceId]),
    scalar(
      "SELECT COUNT(*)::int AS value FROM todos WHERE workspace_id = $1 AND completed = false",
      [workspaceId],
    ),
    scalar(
      "SELECT COUNT(*)::int AS value FROM todos WHERE workspace_id = $1 AND completed = true",
      [workspaceId],
    ),
    scalar(
      `SELECT COUNT(*)::int AS value FROM todos
        WHERE workspace_id = $1 AND completed = false AND due_at IS NOT NULL AND due_at < $2`,
      [workspaceId, nowIso],
    ),
    scalar(
      `SELECT COUNT(*)::int AS value FROM todos
        WHERE workspace_id = $1 AND due_at >= $2 AND due_at < $3`,
      [workspaceId, dayStart, dayEnd],
    ),
    scalar("SELECT COUNT(*)::int AS value FROM notes WHERE workspace_id = $1", [workspaceId]),
    scalar(
      "SELECT COUNT(*)::int AS value FROM notes WHERE workspace_id = $1 AND pinned = true",
      [workspaceId],
    ),
    scalar("SELECT COUNT(*)::int AS value FROM events WHERE workspace_id = $1", [workspaceId]),
    scalar(
      "SELECT COUNT(*)::int AS value FROM events WHERE workspace_id = $1 AND end_at >= $2",
      [workspaceId, nowIso],
    ),
    scalar("SELECT COUNT(*)::int AS value FROM reminders WHERE workspace_id = $1", [workspaceId]),
    scalar(
      "SELECT COUNT(*)::int AS value FROM reminders WHERE workspace_id = $1 AND sent = false",
      [workspaceId],
    ),
    scalar(
      `SELECT COUNT(*)::int AS value FROM reminders
        WHERE workspace_id = $1 AND sent = false AND remind_at <= $2`,
      [workspaceId, nowIso],
    ),
  ]);

  return {
    todos: {
      total: todosTotal,
      active: todosActive,
      completed: todosCompleted,
      overdue: todosOverdue,
      dueToday: todosDueToday,
    },
    notes: { total: notesTotal, pinned: notesPinned },
    events: { total: eventsTotal, upcoming: eventsUpcoming },
    reminders: {
      total: remindersTotal,
      pending: remindersPending,
      due: remindersDue,
    },
  };
}
