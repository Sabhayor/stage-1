"use client";

import { useMemo, useState } from "react";
import {
  apiDelete,
  apiPatch,
  apiPost,
  messageOf,
  queryString,
  useApi,
} from "@/components/useApi";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Loading,
  Notice,
  PageHeader,
  Pill,
  SectionHeading,
  Select,
  Textarea,
} from "@/components/ui";
import { formatDateTime, formatRelative, toDate, toLocalInputValue } from "@/lib/datetime";
import { ClientOnly, useIsMounted } from "@/components/ClientOnly";
import type { Reminder } from "@/lib/repositories/reminders";

const TARGET_TYPES = ["standalone", "todo", "event", "note"] as const;

interface PushPanelProps {
  onMessage: (message: string) => void;
}

/** Notification permission, background push registration and a manual dispatch. */
function PushPanel({ onMessage }: PushPanelProps) {
  // `Notification` only exists in the browser, and the permission can only be
  // read after hydration - until then the panel stays in its neutral state so
  // the server and client render the same markup.
  const mounted = useIsMounted();
  const [permission, setPermission] = useState<string>("unsupported");
  const { data, error, refresh } = useApi<{
    configured: boolean;
    publicKey: string | null;
    subscriptions: number;
  }>("/api/push/vapid-public-key");

  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);

  async function enableNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setLocalError("This browser does not support the Notification API");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") onMessage("Browser notifications enabled");
  }

  async function enableBackgroundPush() {
    setBusy(true);
    setLocalError(null);
    try {
      const publicKey = data?.publicKey;
      if (!publicKey) throw new Error("This deployment has no VAPID keys configured");
      if (!("serviceWorker" in navigator)) {
        throw new Error("Service workers are unavailable in this browser");
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(
          atob(publicKey.replace(/-/g, "+").replace(/_/g, "/").padEnd(
            publicKey.length + ((4 - (publicKey.length % 4)) % 4),
            "=",
          )),
          (character) => character.charCodeAt(0),
        ),
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        throw new Error("The browser returned an incomplete push subscription");
      }

      const payload = await apiPost<{ subscriptions: number }>("/api/push/subscribe", {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      refresh();
      onMessage(`Background push enabled on ${payload.subscriptions} device(s)`);
    } catch (cause) {
      setLocalError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function dispatchNow() {
    setBusy(true);
    setLocalError(null);
    try {
      const payload = await apiPost<{
        dispatched: number;
        candidates: number;
        push: { configured: boolean; failed: number };
      }>("/api/notifications/dispatch", {});
      setDispatchResult(
        `${payload.candidates} due · ${payload.dispatched} acknowledged · ${payload.push.failed} push failure(s)`,
      );
      refresh();
    } catch (cause) {
      setLocalError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  // After hydration the live browser value wins; `permission` holds whatever the
  // user last chose through this panel.
  const currentPermission =
    mounted && typeof Notification !== "undefined" ? Notification.permission : permission;
  const permissionTone =
    currentPermission === "granted"
      ? "emerald"
      : currentPermission === "denied"
        ? "rose"
        : "amber";

  return (
    <Card>
      <SectionHeading
        title="Notifications"
        hint="Foreground alerts come from the in-app poller; background alerts need push"
      />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-600 dark:text-zinc-300">Browser permission</span>
          <ClientOnly fallback={<Pill tone="neutral">checking…</Pill>}>
            <Pill tone={permissionTone}>{currentPermission}</Pill>
          </ClientOnly>
          <Button variant="secondary" onClick={() => void enableNotifications()}>
            Enable notifications
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-600 dark:text-zinc-300">Background push</span>
          <Pill tone={data?.configured ? "indigo" : "neutral"}>
            {data?.configured ? "configured" : "not configured"}
          </Pill>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {data?.subscriptions ?? 0} subscription(s)
          </span>
          <Button
            variant="secondary"
            onClick={() => void enableBackgroundPush()}
            disabled={busy || !data?.configured}
          >
            {busy ? "Working…" : "Enable background push"}
          </Button>
          <Button variant="ghost" onClick={() => void dispatchNow()} disabled={busy}>
            Dispatch due now
          </Button>
        </div>

        {!data?.configured && !error ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Add <code className="font-mono">VAPID_PUBLIC_KEY</code> and{" "}
            <code className="font-mono">VAPID_PRIVATE_KEY</code> (see{" "}
            <code className="font-mono">scripts/generate-vapid-keys.mjs</code>) to enable push.
          </p>
        ) : null}

        {dispatchResult ? (
          <p className="text-xs text-zinc-600 dark:text-zinc-300">{dispatchResult}</p>
        ) : null}
        <ErrorNote message={localError ?? error} />
      </div>
    </Card>
  );
}

export default function RemindersPage() {
  const now = useMemo(() => new Date(), []);
  // The pre-filled reminder time comes from the local clock, so it is only shown
  // after hydration (otherwise the server and client would render different
  // `datetime-local` values).
  const mounted = useIsMounted();
  const [pending, setPending] = useState<"all" | "true" | "false">("true");

  const path = useMemo(
    () =>
      `/api/reminders${queryString({
        pending: pending === "all" ? undefined : pending,
        limit: 200,
      })}`,
    [pending],
  );
  const { data, error, loading, refresh } = useApi<{ reminders: Reminder[]; count: number }>(path);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [remindAt, setRemindAt] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 30 * 60 * 1000)),
  );
  const [targetType, setTargetType] = useState("standalone");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setFormError("Title is required");
      return;
    }
    if (!remindAt) {
      setFormError("Pick a date and time for the reminder");
      return;
    }

    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      await apiPost("/api/reminders", {
        title: title.trim(),
        body,
        remindAt: new Date(remindAt).toISOString(),
        targetType,
        targetId: targetId.trim() || null,
      });
      setTitle("");
      setBody("");
      setTargetId("");
      setNotice("Reminder scheduled");
      refresh();
    } catch (cause) {
      setFormError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function acknowledge(reminder: Reminder) {
    setFormError(null);
    try {
      await apiPost(`/api/reminders/${reminder.id}/acknowledge`, {});
      setNotice(`“${reminder.title}” acknowledged`);
      refresh();
    } catch (cause) {
      setFormError(messageOf(cause));
    }
  }

  async function snooze(reminder: Reminder) {
    setFormError(null);
    try {
      await apiPatch(`/api/reminders/${reminder.id}`, {
        remindAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        sent: false,
      });
      setNotice("Snoozed for 15 minutes");
      refresh();
    } catch (cause) {
      setFormError(messageOf(cause));
    }
  }

  async function remove(reminder: Reminder) {
    setFormError(null);
    try {
      await apiDelete(`/api/reminders/${reminder.id}`);
      setNotice("Reminder deleted");
      refresh();
    } catch (cause) {
      setFormError(messageOf(cause));
    }
  }

  const reminders = data?.reminders ?? [];
  const count = data?.count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reminders"
        description="Schedule reminders, grant notification permission and manage delivery."
      />

      <PushPanel onMessage={setNotice} />
      <ErrorNote message={formError ?? error} />
      <Notice message={notice} />

      <Card className="p-4">
        <form onSubmit={create} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Stand-up meeting"
                maxLength={200}
              />
            </Field>
            <Field label="Remind at">
              <Input
                type="datetime-local"
                value={mounted ? remindAt : ""}
                onChange={(event) => setRemindAt(event.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Link to">
              <Select value={targetType} onChange={(event) => setTargetType(event.target.value)}>
                {TARGET_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Target id" hint="Optional record id this reminder belongs to">
              <Input
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
                placeholder="e.g. a todo id"
                disabled={targetType === "standalone"}
              />
            </Field>
          </div>

          <Field label="Body">
            <Textarea
              rows={2}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={2000}
              placeholder="Optional message shown with the notification"
            />
          </Field>

          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Scheduling…" : "Schedule reminder"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <SectionHeading
          title={`${count} reminder${count === 1 ? "" : "s"}`}
          hint="Soonest first"
          action={
            <Button variant="secondary" onClick={refresh}>
              Refresh
            </Button>
          }
        />

        <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <Field label="Show">
            <Select
              value={pending}
              onChange={(event) => setPending(event.target.value as typeof pending)}
            >
              <option value="true">Pending</option>
              <option value="false">Delivered</option>
              <option value="all">All</option>
            </Select>
          </Field>
        </div>

        {loading && !data ? (
          <Loading />
        ) : reminders.length === 0 ? (
          <EmptyState
            title="No reminders here"
            hint="Schedule one above to try the notification flow."
          />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {reminders.map((reminder) => {
              const due = !reminder.sent && toDate(reminder.remindAt) <= now;
              return (
                <li key={reminder.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{reminder.title}</p>
                    {reminder.body ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {reminder.body}
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Pill tone={reminder.sent ? "emerald" : due ? "rose" : "indigo"}>
                        {reminder.sent ? "delivered" : due ? "due now" : "pending"}
                      </Pill>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDateTime(reminder.remindAt)}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {formatRelative(reminder.remindAt, now)}
                      </span>
                      {reminder.targetType !== "standalone" ? (
                        <Pill tone="neutral">{reminder.targetType}</Pill>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {reminder.sent ? null : (
                      <>
                        <Button variant="ghost" onClick={() => void acknowledge(reminder)}>
                          Acknowledge
                        </Button>
                        <Button variant="ghost" onClick={() => void snooze(reminder)}>
                          Snooze 15m
                        </Button>
                      </>
                    )}
                    <Button variant="danger" onClick={() => void remove(reminder)}>
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
