"use client";

import { useMemo, useState } from "react";
import { apiDelete, apiPost, messageOf, queryString, useApi } from "@/components/useApi";
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
  SectionHeading,
  Select,
  Textarea,
} from "@/components/ui";
import { ClientOnly, useIsMounted } from "@/components/ClientOnly";
import {
  addDays,
  addMonths,
  dayKey,
  formatDate,
  formatMonth,
  formatTime,
  isSameDay,
  monthGrid,
  startOfDay,
  startOfMonth,
  toDate,
} from "@/lib/datetime";
import type { CalendarEvent } from "@/lib/repositories/events";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const EVENT_COLORS = ["indigo", "emerald", "amber", "rose", "sky"] as const;

const COLOR_CLASSES: Record<string, string> = {
  indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
};

function colorClass(color: string): string {
  return COLOR_CLASSES[color] ?? COLOR_CLASSES.indigo;
}

/** `HH:MM` on a specific day, in local time. */
function atTime(day: Date, value: string): Date {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours || 0, minutes || 0);
}

interface DayDetailsProps {
  day: Date;
  events: CalendarEvent[];
  onChanged: (message: string) => void;
}

/** Selected-day panel: the day's events plus a create form. */
function DayDetails({ day, events, onChanged }: DayDetailsProps) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [color, setColor] = useState("indigo");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    const startAt = allDay ? startOfDay(day) : atTime(day, start);
    const endAt = allDay ? addDays(startOfDay(day), 1) : atTime(day, end);
    if (endAt.getTime() <= startAt.getTime()) {
      setError("The end time must be after the start time");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/events", {
        title: title.trim(),
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        allDay,
        color,
        location,
        description,
      });
      setTitle("");
      setLocation("");
      setDescription("");
      onChanged("Event added");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: CalendarEvent) {
    setError(null);
    try {
      await apiDelete(`/api/events/${item.id}`);
      onChanged("Event deleted");
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  return (
    <Card className="self-start">
      <SectionHeading
        title={formatDate(day)}
        hint={`${events.length} event${events.length === 1 ? "" : "s"}`}
      />

      {events.length === 0 ? (
        <EmptyState title="Nothing scheduled" hint="Add an event below." />
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {events.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3">
              <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${colorClass(item.color)}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {item.allDay
                    ? "All day"
                    : `${formatTime(item.startAt)} – ${formatTime(item.endAt)}`}
                  {item.location ? ` · ${item.location}` : ""}
                </p>
                {item.description ? (
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {item.description}
                  </p>
                ) : null}
              </div>
              <Button variant="danger" onClick={() => void remove(item)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={create}
        className="space-y-3 border-t border-zinc-100 px-4 py-3 dark:border-zinc-800"
      >
        <Field label="New event">
          <Input
            value={title}
            onChange={(changeEvent) => setTitle(changeEvent.target.value)}
            placeholder="Team sync"
            maxLength={200}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Start">
            <Input
              type="time"
              value={start}
              onChange={(changeEvent) => setStart(changeEvent.target.value)}
              disabled={allDay}
            />
          </Field>
          <Field label="End">
            <Input
              type="time"
              value={end}
              onChange={(changeEvent) => setEnd(changeEvent.target.value)}
              disabled={allDay}
            />
          </Field>
          <Field label="Colour">
            <Select value={color} onChange={(changeEvent) => setColor(changeEvent.target.value)}>
              {EVENT_COLORS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(changeEvent) => setAllDay(changeEvent.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          All day
        </label>

        <Field label="Location">
          <Input
            value={location}
            onChange={(changeEvent) => setLocation(changeEvent.target.value)}
            maxLength={200}
          />
        </Field>

        <Field label="Description">
          <Textarea
            rows={2}
            value={description}
            onChange={(changeEvent) => setDescription(changeEvent.target.value)}
            maxLength={5000}
          />
        </Field>

        <ErrorNote message={error} />
        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add event"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  // The month label, the `aria-label`s and the "today" highlight are all derived
  // from the browser's locale and clock, so they are only rendered after
  // hydration - otherwise React reports a text mismatch against the server HTML.
  const mounted = useIsMounted();
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const days = useMemo(() => monthGrid(viewMonth), [viewMonth]);
  const path = useMemo(() => {
    const from = days[0]?.toISOString() ?? new Date().toISOString();
    const last = days[days.length - 1] ?? new Date();
    return `/api/events${queryString({ from, to: addDays(last, 1).toISOString(), limit: 500 })}`;
  }, [days]);
  const { data, error, loading, refresh } = useApi<{ events: CalendarEvent[]; count: number }>(
    path,
  );
  const events = useMemo(() => data?.events ?? [], [data]);

  /** dayKey -> events overlapping that day (multi-day events repeat). */
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const item of events) {
      const start = startOfDay(item.startAt);
      const end = toDate(item.endAt);
      for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
        const key = dayKey(cursor);
        map.set(key, [...(map.get(key) ?? []), item]);
      }
    }
    return map;
  }, [events]);

  function changed(message: string) {
    setNotice(message);
    setActionError(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Month view with events and day details."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setViewMonth(addMonths(viewMonth, -1))}>
              ← Prev
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const now = new Date();
                setViewMonth(startOfMonth(now));
                setSelectedDay(startOfDay(now));
              }}
            >
              Today
            </Button>
            <Button variant="secondary" onClick={() => setViewMonth(addMonths(viewMonth, 1))}>
              Next →
            </Button>
          </div>
        }
      />

      <ErrorNote message={actionError ?? error} />
      <Notice message={notice} />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              <ClientOnly fallback="Month">{formatMonth(viewMonth)}</ClientOnly>
            </h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {loading ? "Loading…" : `${events.length} event${events.length === 1 ? "" : "s"}`}
            </span>
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-800">
            {WEEKDAYS.map((label) => (
              <div
                key={label}
                className="bg-zinc-50 px-2 py-1.5 text-center text-[11px] font-medium uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
              >
                {label}
              </div>
            ))}

            {days.map((day) => {
              const key = dayKey(day);
              const dayEvents = byDay.get(key) ?? [];
              const outside = day.getMonth() !== viewMonth.getMonth();
              const selected = isSameDay(day, selectedDay);

              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setSelectedDay(startOfDay(day))}
                  aria-label={mounted ? formatDate(day) : key}
                  aria-pressed={selected}
                  className={`min-h-[5.5rem] bg-white p-1.5 text-left align-top transition dark:bg-zinc-900 ${
                    outside ? "text-zinc-400 dark:text-zinc-600" : ""
                  } ${
                    selected
                      ? "ring-2 ring-inset ring-indigo-500"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      mounted && isSameDay(day, today)
                        ? "bg-indigo-600 font-semibold text-white"
                        : ""
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  <span className="mt-1 block space-y-0.5">
                    {dayEvents.slice(0, 3).map((item) => (
                      <span
                        key={item.id}
                        className={`block truncate rounded px-1 py-0.5 text-[11px] ${colorClass(item.color)}`}
                      >
                        {item.allDay ? "" : `${formatTime(item.startAt)} `}
                        {item.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 ? (
                      <span className="block px-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        +{dayEvents.length - 3} more
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {mounted ? (
          <DayDetails
            day={selectedDay}
            events={byDay.get(dayKey(selectedDay)) ?? []}
            onChanged={changed}
          />
        ) : (
          <Card>
            <Loading label="Loading day…" />
          </Card>
        )}
      </div>
    </div>
  );
}
