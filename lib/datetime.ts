/**
 * Local-time date helpers shared by the dashboard, todos, calendar and reminder
 * UI.
 *
 * Everything works in the viewer's local timezone and stays framework-free so
 * the helpers can be unit tested in the Vitest node environment. Only ISO-8601
 * strings cross the API boundary.
 */

export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `YYYY-MM-DD` in local time - used to group records per calendar day. */
export function dayKey(value: Date | string): string {
  const date = toDate(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Value for `<input type="datetime-local">` (local time, no timezone suffix). */
export function toLocalInputValue(value: Date | string): string {
  const date = toDate(value);
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `datetime-local` value -> ISO-8601 instant (empty string when unparsable). */
export function fromLocalInputValue(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function formatTime(value: Date | string): string {
  return toDate(value).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: Date | string): string {
  return toDate(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: Date | string): string {
  return `${formatDate(value)} · ${formatTime(value)}`;
}

export function formatMonth(value: Date | string): string {
  return toDate(value).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** `true` when both instants fall on the same local calendar day. */
export function isSameDay(a: Date | string, b: Date | string): boolean {
  return dayKey(a) === dayKey(b);
}

export function startOfDay(value: Date | string = new Date()): Date {
  const date = toDate(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfMonth(value: Date | string = new Date()): Date {
  const date = toDate(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addDays(value: Date | string, days: number): Date {
  const date = toDate(value);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

export function addMonths(value: Date | string, months: number): Date {
  const date = toDate(value);
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/**
 * Six-week (42 day) grid for a month view. Starts on the Sunday on or before
 * the 1st so week rows always line up with the weekday headers.
 */
export function monthGrid(value: Date | string = new Date()): Date[] {
  const first = startOfMonth(value);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

/** Human-friendly distance to an instant ("in 5 min", "2 days ago"). */
export function formatRelative(value: Date | string, now: Date = new Date()): string {
  const target = toDate(value);
  const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
    style: "short",
  });
  const minutes = Math.round((target.getTime() - now.getTime()) / 60_000);

  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}
