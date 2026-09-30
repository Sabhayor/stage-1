/**
 * Workspace scoping.
 *
 * The app is intentionally authentication-free, so every record is scoped to a
 * "workspace" id that the browser generates once and stores locally. The id is
 * sent on every request through the `x-workspace-id` header (a `workspaceId`
 * query parameter is accepted as a fallback so the API stays easy to exercise
 * with curl/Postman). Requests without an id fall back to the public workspace.
 */
export const WORKSPACE_HEADER = "x-workspace-id";
export const DEFAULT_WORKSPACE_ID = "default";

const WORKSPACE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidWorkspaceId(value: string | null | undefined): boolean {
  return typeof value === "string" && WORKSPACE_PATTERN.test(value);
}

export function resolveWorkspaceId(request: Request): string {
  const header = request.headers.get(WORKSPACE_HEADER);
  if (isValidWorkspaceId(header)) return header as string;

  try {
    const query = new URL(request.url).searchParams.get("workspaceId");
    if (isValidWorkspaceId(query)) return query as string;
  } catch {
    /* ignore malformed URLs and use the default workspace */
  }

  return DEFAULT_WORKSPACE_ID;
}
