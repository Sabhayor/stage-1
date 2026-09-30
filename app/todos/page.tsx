"use client";

import { useDeferredValue, useMemo, useState } from "react";
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
import type { Todo } from "@/lib/repositories/todos";

const PRIORITY_TONES: Record<string, "neutral" | "amber" | "rose"> = {
  low: "neutral",
  medium: "amber",
  high: "rose",
};
const PRIORITIES = ["low", "medium", "high"] as const;

function priorityTone(priority: string): "neutral" | "amber" | "rose" {
  return PRIORITY_TONES[priority] ?? "neutral";
}

function isOverdue(todo: Todo, now: Date): boolean {
  return Boolean(todo.dueAt) && !todo.completed && toDate(todo.dueAt as string) < now;
}

interface EditorProps {
  todo: Todo;
  onDone: (message?: string) => void;
}

/** Inline editor: change the fields and/or schedule a reminder for the todo. */
function TodoEditor({ todo, onDone }: EditorProps) {
  const [draft, setDraft] = useState({
    title: todo.title,
    notes: todo.notes,
    priority: todo.priority,
    dueAt: todo.dueAt ? toLocalInputValue(todo.dueAt) : "",
  });
  const [remindAt, setRemindAt] = useState(() => {
    const fallback =
      todo.dueAt && toDate(todo.dueAt) > new Date()
        ? todo.dueAt
        : new Date(Date.now() + 15 * 60 * 1000);
    return toLocalInputValue(fallback);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) {
      setError("Title is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/api/todos/${todo.id}`, {
        title: draft.title.trim(),
        notes: draft.notes,
        priority: draft.priority,
        dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
      });
      onDone("Todo updated");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function scheduleReminder() {
    if (!remindAt) {
      setError("Pick a reminder time first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/reminders", {
        title: draft.title.trim() || todo.title,
        body: draft.notes.slice(0, 2000),
        remindAt: new Date(remindAt).toISOString(),
        targetType: "todo",
        targetId: todo.id,
      });
      onDone("Reminder scheduled");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="space-y-3 border-t border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/40"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <Input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            maxLength={200}
          />
        </Field>
        <Field label="Priority">
          <Select
            value={draft.priority}
            onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
          >
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date">
          <Input
            type="datetime-local"
            value={draft.dueAt}
            onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })}
          />
        </Field>
        <Field label="Reminder at" hint="Schedules a reminder linked to this todo">
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={remindAt}
              onChange={(event) => setRemindAt(event.target.value)}
            />
            <Button variant="secondary" onClick={() => void scheduleReminder()} disabled={busy}>
              Remind
            </Button>
          </div>
        </Field>
      </div>
      <Field label="Notes">
        <Textarea
          rows={3}
          value={draft.notes}
          onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          maxLength={5000}
        />
      </Field>
      <ErrorNote message={error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

export default function TodosPage() {
  const now = useMemo(() => new Date(), []);
  const [status, setStatus] = useState<"all" | "active" | "completed">("active");
  const [due, setDue] = useState<"any" | "today" | "overdue" | "upcoming">("any");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const path = useMemo(
    () => `/api/todos${queryString({ status, due, q: deferredSearch.trim(), limit: 200 })}`,
    [status, due, deferredSearch],
  );
  const { data, error, loading, refresh } = useApi<{ todos: Todo[]; count: number }>(path);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function createTodo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setFormError("Title is required");
      return;
    }
    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      await apiPost("/api/todos", {
        title: title.trim(),
        notes,
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      });
      setTitle("");
      setNotes("");
      setPriority("medium");
      setDueAt("");
      setNotice("Todo added");
      refresh();
    } catch (cause) {
      setFormError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(todo: Todo) {
    setFormError(null);
    try {
      await apiPatch(`/api/todos/${todo.id}`, { completed: !todo.completed });
      refresh();
    } catch (cause) {
      setFormError(messageOf(cause));
    }
  }

  async function remove(todo: Todo) {
    setFormError(null);
    try {
      await apiDelete(`/api/todos/${todo.id}`);
      setNotice("Todo deleted");
      refresh();
    } catch (cause) {
      setFormError(messageOf(cause));
    }
  }

  const todos = data?.todos ?? [];
  const count = data?.count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Todos"
        description="Filter, search and schedule reminders for your tasks."
      />

      <Card className="p-4">
        <form onSubmit={createTodo} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Field label="Title">
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ship the release notes"
                  maxLength={200}
                />
              </Field>
            </div>
            <Field label="Priority">
              <Select value={priority} onChange={(event) => setPriority(event.target.value)}>
                {PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date">
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={5000}
              placeholder="Optional details"
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add todo"}
            </Button>
          </div>
        </form>
        <div className="mt-3 space-y-2">
          <ErrorNote message={formError} />
          <Notice message={notice} />
        </div>
      </Card>

      <Card>
        <SectionHeading
          title={`${count} todo${count === 1 ? "" : "s"}`}
          hint="Workspace-scoped, newest first"
          action={
            <Button variant="secondary" onClick={refresh}>
              Refresh
            </Button>
          }
        />

        <div className="grid gap-3 border-b border-zinc-100 px-4 py-3 sm:grid-cols-3 dark:border-zinc-800">
          <Field label="Status">
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </Select>
          </Field>
          <Field label="Due">
            <Select value={due} onChange={(event) => setDue(event.target.value as typeof due)}>
              <option value="any">Any</option>
              <option value="today">Today</option>
              <option value="overdue">Overdue</option>
              <option value="upcoming">Upcoming</option>
            </Select>
          </Field>
          <Field label="Search">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Title or notes"
            />
          </Field>
        </div>

        {error ? (
          <div className="px-4 py-3">
            <ErrorNote message={error} />
          </div>
        ) : null}

        {loading && !data ? (
          <Loading />
        ) : todos.length === 0 ? (
          <EmptyState
            title="No todos match these filters"
            hint="Try clearing the search or switching the status filter."
          />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {todos.map((todo) => (
              <li key={todo.id}>
                <div className="flex items-start gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => void toggle(todo)}
                    aria-label={`Complete ${todo.title}`}
                    className="mt-1 h-4 w-4 accent-indigo-600"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm font-medium ${
                        todo.completed ? "text-zinc-400 line-through dark:text-zinc-500" : ""
                      }`}
                    >
                      {todo.title}
                    </p>
                    {todo.notes ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {todo.notes}
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Pill tone={priorityTone(todo.priority)}>{todo.priority}</Pill>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {todo.dueAt ? formatDateTime(todo.dueAt) : "No due date"}
                      </span>
                      {isOverdue(todo, now) ? <Pill tone="rose">overdue</Pill> : null}
                      {todo.completed && todo.completedAt ? (
                        <span className="text-xs text-zinc-400">
                          completed {formatRelative(todo.completedAt, now)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      onClick={() => setEditingId(editingId === todo.id ? null : todo.id)}
                    >
                      {editingId === todo.id ? "Close" : "Edit"}
                    </Button>
                    <Button variant="danger" onClick={() => void remove(todo)}>
                      Delete
                    </Button>
                  </div>
                </div>
                {editingId === todo.id ? (
                  <TodoEditor
                    todo={todo}
                    onDone={(message) => {
                      setEditingId(null);
                      setNotice(message ?? null);
                      refresh();
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
