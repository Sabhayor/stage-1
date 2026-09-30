"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, apiPost, messageOf } from "@/components/useApi";
import { Button, Card } from "@/components/ui";
import { formatDateTime } from "@/lib/datetime";
import type { Reminder } from "@/lib/repositories/reminders";

/**
 * In-app reminder poller.
 *
 * Covers the "app is open" case on its own: every minute it asks
 * `GET /api/notifications/due` for reminders whose time has arrived, raises a
 * browser notification when the user has granted permission, acknowledges them
 * (the API deliberately leaves that to the client) and keeps a dismissable
 * toast in the corner so nothing is missed while the tab is in the background.
 *
 * Background delivery while the app is closed is handled by
 * `POST /api/notifications/dispatch` plus the service worker in `public/sw.js`.
 */

const POLL_INTERVAL_MS = 60_000;
const DUE_WINDOW_MINUTES = 0;

interface DueResponse {
  reminders: Reminder[];
  count: number;
  checkedAt: string;
}

async function registerServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    /* push is optional - the in-app poller still works */
  }
}

function showBrowserNotification(reminder: Reminder): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const body = reminder.body || "Reminder from your workspace";
  try {
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        if (registration) {
          return registration.showNotification(reminder.title, {
            body,
            tag: reminder.id,
            data: { url: "/reminders" },
          });
        }
        new Notification(reminder.title, { body, tag: reminder.id });
        return undefined;
      })
      .catch(() => {
        /* notifications are best effort */
      });
  } catch {
    /* notifications are best effort */
  }
}

export default function ReminderEngine() {
  const [queue, setQueue] = useState<Reminder[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Ids already surfaced, so a slow acknowledgement cannot double-notify. */
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    void registerServiceWorker();

    const poll = async () => {
      try {
        const payload = await apiFetch<DueResponse>(
          `/api/notifications/due?withinMinutes=${DUE_WINDOW_MINUTES}&limit=20`,
        );
        if (!active) return;
        setError(null);

        const fresh = payload.reminders.filter(
          (reminder) => !handled.current.has(reminder.id),
        );
        const surfaced: Reminder[] = [];

        for (const reminder of fresh) {
          handled.current.add(reminder.id);
          try {
            await apiPost(`/api/reminders/${reminder.id}/acknowledge`, {});
          } catch {
            // Gone (deleted, or already acknowledged in another tab): skip it.
            handled.current.delete(reminder.id);
            continue;
          }
          showBrowserNotification(reminder);
          surfaced.push(reminder);
        }

        if (active && surfaced.length > 0) {
          setQueue((current) => [...current, ...surfaced]);
        }
      } catch (cause) {
        if (active) setError(messageOf(cause));
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (queue.length === 0 && !error) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6">
      {error ? (
        <p className="pointer-events-auto rounded-lg bg-rose-600 px-3 py-2 text-xs text-white shadow-lg">
          Reminder poller: {error}
        </p>
      ) : null}

      {queue.map((reminder) => (
        <Card key={reminder.id} className="pointer-events-auto w-full max-w-sm p-4 shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
            Reminder
          </p>
          <p className="mt-1 text-sm font-semibold">{reminder.title}</p>
          {reminder.body ? (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{reminder.body}</p>
          ) : null}
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {formatDateTime(reminder.remindAt)}
          </p>
          <div className="mt-3 flex justify-end">
            <Button
              variant="secondary"
              onClick={() =>
                setQueue((current) => current.filter((item) => item.id !== reminder.id))
              }
            >
              Dismiss
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
