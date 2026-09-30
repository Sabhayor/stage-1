"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { apiPatch, apiPost, messageOf, queryString, useApi } from "@/components/useApi";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Loading,
  PageHeader,
  Pill,
  SectionHeading,
  StatCard,
} from "@/components/ui";
import { addDays, formatRelative, formatTime, isSameDay, toDate } from "@/lib/datetime";
import type { CalendarEvent } from "@/lib/repositories/events";
import type { Reminder } from "@/lib/repositories/reminders";
import type { WorkspaceStats } from "@/lib/repositories/stats";
import type { Todo } from "@/lib/repositories/todos";

const PRIORITY_TONES = { low: "neutral", medium: "amber", high: "rose" } as const;

function dueLabel(todo: Todo, now: Date): string {
  if (!todo.dueAt) return "";
  const due = toDate(todo.dueAt);
  if (isSameDay(due, now)) return `Today · ${formatTime(due)}`;
  return formatRelative(due, now);
}

export default function DashboardPage() {
  const now = useMemo(() => new Date(), []);
  const todayPath = useMemo(
    () => `/api/todos${queryString({ status: "active", due: "today", limit: 8 })}`,
    [],
  );
  const overduePath = useMemo(
    () => `/api/todos${queryString({ status: "active", due: "overdue", limit: 5 })}`,
    [],
  );
  const eventsPath = useMemo(() => {
    const from = new Date().toISOString();
    const to = addDays(new Date(), 14).toISOString();
    return `/api/events${queryString({ from, to, limit: 5 })}`;
  }, []);
  const remindersPath = useMemo(
    () => `/api/reminders${queryString({ pending: "true", limit: 5 })}`,
    [],
  );

  const stats = useApi<{ stats: WorkspaceStats }>("/api/stats");
  const today = useApi<{ todos: Todo[]; count: number }>(todayPath);
  const overdue = useApi<{ todos: Todo[]; count: number }>(overduePath);
  const upcoming = useApi<{ events: CalendarEvent[]; count: number }>(eventsPath);
  const reminders = useApi<{ reminders: Reminder[]; count: number }>(remindersPath);

  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = () => {
    stats.refresh();
    today.refresh();
    overdue.refresh();
    upcoming.refresh();
    reminders.refresh();
  };

  async function addTodo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/todos", {
        title: title.trim(),
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      });
      setTitle("");
      setDueAt("");
      refreshAll();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(todo: Todo) {
    setError(null);
    try {
      await apiPatch(`/api/todos/${todo.id}`, { completed: !todo.completed });
      refreshAll();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  const counters = stats.data?.stats;
  const eventLabel = (item: CalendarEvent) =>
    item.allDay ? "All day" : formatTime(item.startAt);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Everything that needs attention today."
        actions={
          <Button variant="secondary" onClick={refreshAll}>
            Refresh
          </Button>
        }
      />

      <ErrorNote message={error ?? stats.error ?? today.error} />

      <Card className="p-4">
        <form onSubmit={addTodo} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <Field label="Quick add">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What needs doing?"
                maxLength={200}
              />
            </Field>
          </div>
          <div>
            <Field label="Due (optional)">
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </Field>
          </div>
          <Button type="submit" disabled={busy || title.trim().length === 0}>
            {busy ? "Adding…" : "Add todo"}
          </Button>
        </form>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Active todos" value={counters?.todos.active ?? "–"} />
        <StatCard label="Due today" value={counters?.todos.dueToday ?? "–"} />
        <StatCard label="Overdue" value={counters?.todos.overdue ?? "–"} />
        <StatCard
          label="Notes"
          value={counters?.notes.total ?? "–"}
          hint={counters ? `${counters.notes.pinned} pinned` : undefined}
        />
        <StatCard label="Upcoming events" value={counters?.events.upcoming ?? "–"} />
        <StatCard
          label="Pending reminders"
          value={counters?.reminders.pending ?? "–"}
          hint={counters ? `${counters.reminders.due} due now` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading
            title="Due today"
            hint="Active todos due today"
            action={
              <Link
                href="/todos"
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400"
              >
                All todos →
              </Link>
            }
          />
          {today.loading && !today.data ? (
            <Loading />
          ) : (today.data?.todos.length ?? 0) === 0 ? (
            <EmptyState title="Nothing due today" hint="Use quick add to plan your day." />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {today.data?.todos.map((todo) => (
                <li key={todo.id} className="flex items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => void toggle(todo)}
                    aria-label={`Complete ${todo.title}`}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  <span className="flex-1 truncate text-sm">{todo.title}</span>
                  <Pill
                    tone={
                      PRIORITY_TONES[todo.priority as keyof typeof PRIORITY_TONES] ?? "neutral"
                    }
                  >
                    {todo.priority}
                  </Pill>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {dueLabel(todo, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionHeading
            title="Overdue"
            hint="Past their due date"
            action={
              <Link
                href="/todos"
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400"
              >
                All todos →
              </Link>
            }
          />
          {overdue.loading && !overdue.data ? (
            <Loading />
          ) : (overdue.data?.todos.length ?? 0) === 0 ? (
            <EmptyState title="Nothing overdue" hint="You are on top of things." />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {overdue.data?.todos.map((todo) => (
                <li key={todo.id} className="flex items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => void toggle(todo)}
                    aria-label={`Complete ${todo.title}`}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  <span className="flex-1 truncate text-sm">{todo.title}</span>
                  <Pill tone="rose">{dueLabel(todo, now)}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionHeading
            title="Upcoming events"
            hint="Next 14 days"
            action={
              <Link
                href="/calendar"
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400"
              >
                Calendar →
              </Link>
            }
          />
          {upcoming.loading && !upcoming.data ? (
            <Loading />
          ) : (upcoming.data?.events.length ?? 0) === 0 ? (
            <EmptyState title="No upcoming events" hint="Add one from the calendar." />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {upcoming.data?.events.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex-1 truncate text-sm">{item.title}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {eventLabel(item)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionHeading
            title="Pending reminders"
            hint="Waiting to be delivered"
            action={
              <Link
                href="/reminders"
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400"
              >
                Reminders →
              </Link>
            }
          />
          {reminders.loading && !reminders.data ? (
            <Loading />
          ) : (reminders.data?.reminders.length ?? 0) === 0 ? (
            <EmptyState title="No pending reminders" />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {reminders.data?.reminders.map((reminder) => (
                <li key={reminder.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex-1 truncate text-sm">{reminder.title}</span>
                  <Pill tone={toDate(reminder.remindAt) <= now ? "rose" : "indigo"}>
                    {formatRelative(reminder.remindAt, now)}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
