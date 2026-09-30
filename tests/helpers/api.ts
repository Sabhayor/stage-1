import { WORKSPACE_HEADER } from "@/lib/workspace";

export const BASE_URL = "http://localhost:3000";

export interface RequestOptions {
  /** Workspace the request is scoped to (defaults to `test-workspace`). */
  workspaceId?: string;
  /** Query string parameters appended to the path. */
  query?: Record<string, string | number | undefined>;
  /** Request body; objects are JSON-encoded automatically. */
  body?: unknown;
  headers?: Record<string, string>;
}

/** Build a `Request` for a route handler, mirroring what Next.js provides. */
export function makeRequest(
  method: string,
  path: string,
  options: RequestOptions = {},
): Request {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers = new Headers(options.headers);
  headers.set(WORKSPACE_HEADER, options.workspaceId ?? "test-workspace");

  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(options.body);
  }
  return new Request(url.toString(), init);
}

export const get = (path: string, options?: RequestOptions) =>
  makeRequest("GET", path, options);
export const post = (path: string, options?: RequestOptions) =>
  makeRequest("POST", path, options);
export const patch = (path: string, options?: RequestOptions) =>
  makeRequest("PATCH", path, options);
export const del = (path: string, options?: RequestOptions) =>
  makeRequest("DELETE", path, options);

/** Context object for routes with dynamic segments (`/api/todos/[id]`). */
export function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

export async function readJson<T = Record<string, unknown>>(
  response: Response,
): Promise<T> {
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** Convenience helper: create a todo and return its id. */
export async function createTodo(
  workspaceId: string,
  input: Record<string, unknown>,
): Promise<{ id: string }> {
  const { POST } = await import("@/app/api/todos/route");
  const response = await POST(
    post("/api/todos", { workspaceId, body: input }),
  );
  const payload = await readJson<{ todo: { id: string } }>(response);
  return payload.todo;
}
