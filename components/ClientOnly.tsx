"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

/**
 * Client-only rendering helpers.
 *
 * Anything that depends on the browser - `Notification.permission`, the local
 * clock, or the user's locale - cannot be rendered on the server without
 * producing a hydration mismatch (the server has no `window` and a different
 * locale/time zone). These helpers render a stable placeholder during SSR and
 * the real value once the component is mounted.
 */

const subscribe = () => () => {
  /* the mounted state never changes after hydration */
};

/** `false` while rendering on the server (and the first client render). */
export function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useIsMounted() ? <>{children}</> : <>{fallback}</>;
}
