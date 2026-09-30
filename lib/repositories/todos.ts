import { getDatabase } from "@/lib/db";
import { toIso, hasOwn, requireIso } from "@/lib/serialize";

/** Raw `todos` row (`SELECT *`). Type alias => implicit index signature. */
type TodoRow = {
  id: string;
  workspace_id: string;
  title: string;
  notes: string;
  priority: string;
  due_at: Date | string | null;
  completed: boolean;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export const DEFAULT_LIST_LIMIT = 200;

/**
 * The shape the API returns and the UI consumes (camelCase, ISO strings).
 *
 * It is defined here without importing `@/lib/validation` so that the data
 * layer stays independent from the HTTP layer.
 */
export interface Todo {
  id: string;
  workspaceId: string;
  title: string;
  notes: string;
  priority: string;
  dueAt: string | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TodoListOptions {
  status?: "all" | "active" | "completed";
  due?: "any" | "today" | "overdue" | "upcoming";
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
}

export function mapTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    notes: row.notes,
    priority: row.priority,
    dueAt: toIso(row.due_at),
    completed: Boolean(row.completed),
    completedAt: toIso(row.completed_at),
    createdAt: requireIso(row.created_at),
    updatedAt: requireIso(row.updated_at),
  };
}

export function startOfTodayIso(reference: Date = new Date()): string {
  const start = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
  );
  return start.toISOString();
}

export function endOfTodayIso(reference: Date = new Date()): string {
  const start = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate() + 1,
  );
  return start.toISOString();
}

export async function listTodos(
  workspaceId: string,
  options: TodoListOptions = {},
): Promise<Todo[]> {
  const db = await getDatabase();
  const where: string[] = ["workspace_id = $1"];
  const params: unknown[] = [workspaceId];
  const now = new Date().toISOString();

  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (options.status === "active") where.push("completed = false");
  if (options.status === "completed") where.push("completed = true");

  let from = options.from;
  let to = options.to;
  if (options.due === "today") {
    from = from ?? startOfTodayIso();
    to = to ?? endOfTodayIso();
  }
  if (options.due === "overdue") {
    where.push("completed = false");
    where.push(`due_at IS NOT NULL AND due_at < ${add(now)}`);
  }
  if (options.due === "upcoming") {
    where.push(`due_at IS NOT NULL AND due_at >= ${add(now)}`);
  }
  if (from) where.push(`due_at IS NOT NULL AND due_at >= ${add(from)}`);
  if (to) where.push(`due_at IS NOT NULL AND due_at <= ${add(to)}`);
  if (options.q) {
    const needle = `%${options.q}%`;
    const placeholder = add(needle);
    where.push(`(title ILIKE ${placeholder} OR notes ILIKE ${placeholder})`);
  }

  const limit = add(options.limit ?? DEFAULT_LIST_LIMIT);

  const rows = await db.query<TodoRow>(
    `SELECT * FROM todos
      WHERE ${where.join(" AND ")}
      ORDER BY completed ASC, due_at ASC NULLS LAST, created_at DESC
      LIMIT ${limit}`,
    params,
  );
  return rows.map(mapTodo);
}

export async function getTodo(
  workspaceId: string,
  id: string,
): Promise<Todo | null> {
  const db = await getDatabase();
  const rows = await db.query<TodoRow>(
    "SELECT * FROM todos WHERE workspace_id = $1 AND id = $2",
    [workspaceId, id],
  );
  return rows[0] ? mapTodo(rows[0]) : null;
}

export interface TodoInput {
  title: string;
  notes?: string;
  priority?: string;
  dueAt?: string | null;
}

export async function createTodo(
  workspaceId: string,
  input: TodoInput,
): Promise<Todo> {
  const db = await getDatabase();
  const rows = await db.query<TodoRow>(
    `INSERT INTO todos (id, workspace_id, title, notes, priority, due_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      crypto.randomUUID(),
      workspaceId,
      input.title,
      input.notes ?? "",
      input.priority ?? "medium",
      input.dueAt ?? null,
    ],
  );
  return mapTodo(rows[0]);
}

export interface TodoPatch {
  title?: string;
  notes?: string;
  priority?: string;
  dueAt?: string | null;
  completed?: boolean;
}

export async function updateTodo(
  workspaceId: string,
  id: string,
  patch: TodoPatch,
): Promise<Todo | null> {
  const db = await getDatabase();
  const assignments: string[] = [];
  const params: unknown[] = [workspaceId, id];

  const add = (column: string, value: unknown): void => {
    params.push(value);
    assignments.push(`${column} = $${params.length}`);
  };

  if (hasOwn(patch, "title")) add("title", patch.title);
  if (hasOwn(patch, "notes")) add("notes", patch.notes);
  if (hasOwn(patch, "priority")) add("priority", patch.priority);
  if (hasOwn(patch, "dueAt")) add("due_at", patch.dueAt ?? null);
  if (hasOwn(patch, "completed")) {
    add("completed", Boolean(patch.completed));
    add("completed_at", patch.completed ? new Date().toISOString() : null);
  }
  if (assignments.length === 0) return getTodo(workspaceId, id);

  assignments.push("updated_at = now()");

  const rows = await db.query<TodoRow>(
    `UPDATE todos SET ${assignments.join(", ")}
      WHERE workspace_id = $1 AND id = $2
      RETURNING *`,
    params,
  );
  // `due_at`/`completed_at` may be explicitly nulled above; normalise via mapper.
  return rows[0] ? mapTodo(rows[0]) : null;
}

export async function deleteTodo(
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.query<{ id: string }>(
    "DELETE FROM todos WHERE workspace_id = $1 AND id = $2 RETURNING id",
    [workspaceId, id],
  );
  return rows.length > 0;
}
