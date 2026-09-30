import { apiError, json, parseBody, readParams, route } from "@/lib/http";
import { deleteTodo, getTodo, updateTodo } from "@/lib/repositories/todos";
import { todoUpdateSchema } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

/** GET /api/todos/:id */
export const GET = route(async (request: Request, context: Context) => {
  const { id } = await readParams(context);
  const todo = await getTodo(resolveWorkspaceId(request), id);
  if (!todo) return apiError("Todo not found", 404);
  return json({ todo });
});

/** PATCH /api/todos/:id - partial update (title, notes, priority, dueAt, completed). */
export const PATCH = route(async (request: Request, context: Context) => {
  const { id } = await readParams(context);
  const body = await parseBody(request, todoUpdateSchema);
  if (!body.ok) return body.response!;

  const todo = await updateTodo(resolveWorkspaceId(request), id, body.data!);
  if (!todo) return apiError("Todo not found", 404);
  return json({ todo });
});

/** DELETE /api/todos/:id */
export const DELETE = route(async (request: Request, context: Context) => {
  const { id } = await readParams(context);
  const deleted = await deleteTodo(resolveWorkspaceId(request), id);
  if (!deleted) return apiError("Todo not found", 404);
  return json({ deleted: true, id });
});
