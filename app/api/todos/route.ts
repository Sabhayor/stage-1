import { json, parseBody, parseQuery, route } from "@/lib/http";
import { createTodo, listTodos } from "@/lib/repositories/todos";
import { todoCreateSchema, todoQuerySchema } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** GET /api/todos - list todos for the workspace (filter by status/due/query). */
export const GET = route(async (request: Request) => {
  const query = parseQuery(request, todoQuerySchema);
  if (!query.ok) return query.response!;

  const todos = await listTodos(resolveWorkspaceId(request), query.data!);
  return json({ todos, count: todos.length });
});

/** POST /api/todos - create a todo. */
export const POST = route(async (request: Request) => {
  const body = await parseBody(request, todoCreateSchema);
  if (!body.ok) return body.response!;

  const todo = await createTodo(resolveWorkspaceId(request), body.data!);
  return json({ todo }, 201);
});
