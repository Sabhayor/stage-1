import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  dayKey,
  formatDate,
  formatDateTime,
  formatMonth,
  formatRelative,
  formatTime,
  fromLocalInputValue,
  isSameDay,
  monthGrid,
  startOfDay,
  startOfMonth,
  toLocalInputValue,
} from "@/lib/datetime";

describe("lib/datetime", () => {
  it("groups instants by local calendar day", () => {
    const morning = new Date(2026, 4, 17, 8, 30);
    const evening = new Date(2026, 4, 17, 22, 15);

    expect(dayKey(morning)).toBe("2026-05-17");
    expect(dayKey(evening)).toBe(dayKey(morning));
    expect(isSameDay(morning, evening)).toBe(true);
    expect(isSameDay(morning, addDays(morning, 1))).toBe(false);
  });

  it("round-trips `datetime-local` values through ISO-8601", () => {
    const local = new Date(2026, 4, 17, 14, 45);

    expect(toLocalInputValue(local)).toBe("2026-05-17T14:45");
    expect(fromLocalInputValue(toLocalInputValue(local))).toBe(local.toISOString());
    expect(fromLocalInputValue("")).toBe("");
    expect(fromLocalInputValue("not-a-date")).toBe("");
  });

  it("builds a six-week month grid that starts on a Sunday", () => {
    // May 2026 starts on a Friday, so the grid opens on Sunday 26 April.
    const grid = monthGrid(new Date(2026, 4, 17));

    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(0);
    expect(dayKey(grid[0])).toBe("2026-04-26");
    expect(grid.map(dayKey)).toContain("2026-05-17");
    expect(startOfMonth(new Date(2026, 4, 17)).getDate()).toBe(1);
  });

  it("normalises days and moves between days and months", () => {
    expect(startOfDay(new Date(2026, 0, 2, 23, 59)).getHours()).toBe(0);
    expect(addDays(new Date(2026, 0, 31), 1).getMonth()).toBe(1);
    expect(addMonths(new Date(2026, 0, 31), 1).getMonth()).toBe(1);
    expect(addMonths(new Date(2026, 0, 31), -1).getMonth()).toBe(11);
  });

  it("formats values for display", () => {
    const value = new Date(2026, 4, 17, 9, 5);

    expect(formatDate(value).length).toBeGreaterThan(0);
    expect(formatMonth(value).length).toBeGreaterThan(0);
    expect(formatTime(value)).toContain(":");
    expect(formatDateTime(value)).toContain("·");

    const inFiveMinutes = new Date(Date.now() + 5 * 60 * 1000);
    const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    expect(formatRelative(inFiveMinutes).length).toBeGreaterThan(0);
    expect(formatRelative(inFiveMinutes)).not.toBe(formatRelative(inTwoDays));
  });
});
