"use client";

import { useCallback, useEffect, useState } from "react";
import { WORKSPACE_HEADER } from "@/lib/workspace";

/**
 * Client-side data access for the UI.
 *
 * Every request carries the `x-workspace-id` header: the browser generates one
 * id per browser profile and stores it locally, so the app stays
 * authentication-free while records remain scoped to "your" workspace.
 */

const WORKSPACE_STORAGE_KEY = "reminder.workspaceId";

export interface ApiIssue {
  path: string;
  message: string;
}

/** Error thrown by {@link apiFetch}; carries the API's `{ error }` payload. */
export class ApiError extends Error {
  readonly status: number;
  readonly issues: ApiIssue[];

  constructor(message: string, status: number, issues: ApiIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.issues = issues;
  }
}

function createWorkspaceId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `ws-${suffix}`;
}

/** The workspace id for this browser (created on first use). */
export function getWorkspaceId(): string {
  if (typeof window === "undefined") return "default";

  const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (stored) return stored;

  const created = createWorkspaceId();
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, created);
  return created;
}

/** Readable message for anything thrown by the helpers below. */
export function messageOf(cause: unknown): string {
  if (cause instanceof ApiError) {
    const first = cause.issues[0];
    return first ? `${cause.message}: ${first.path || "body"} ${first.message}` : cause.message;
  }
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

/** JSON fetch against the app's own API, with workspace scoping. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set(WORKSPACE_HEADER, getWorkspaceId());
  if (init.body !== undefined) headers.set("content-type", "application/json");

  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = (payload as { error?: { message?: string; issues?: ApiIssue[] } }).error;
    throw new ApiError(
      error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      error?.issues,
    );
  }
  return payload as T;
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}

export interface UseApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-run the request (call after a mutation). */
  refresh: () => void;
}

/** Snapshot of the most recent settled request, tagged with its request key. */
interface ApiSnapshot<T> {
  path: string;
  version: number;
  data: T | null;
  error: string | null;
}

/**
 * Fetch `path` and re-fetch whenever the path changes. Pass `null` to skip
 * fetching (conditional data). Mutations should call `refresh()`.
 *
 * State is only written from the promise callbacks - `loading` is derived by
 * comparing the requested key with the settled snapshot - so the hook never
 * triggers cascading renders from inside the effect.
 */
export function useApi<T>(path: string | null): UseApiResult<T> {
  const [version, setVersion] = useState(0);
  const [snapshot, setSnapshot] = useState<ApiSnapshot<T> | null>(null);

  useEffect(() => {
    if (!path) return;

    let active = true;
    apiFetch<T>(path)
      .then((payload) => {
        if (active) setSnapshot({ path, version, data: payload, error: null });
      })
      .catch((cause: unknown) => {
        if (active) setSnapshot({ path, version, data: null, error: messageOf(cause) });
      });

    return () => {
      active = false;
    };
  }, [path, version]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  if (!path) return { data: null, error: null, loading: false, refresh };

  const current =
    snapshot && snapshot.path === path && snapshot.version === version ? snapshot : null;

  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: current === null,
    refresh,
  };
}

/** Query-string builder that drops empty values. */
export function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}
