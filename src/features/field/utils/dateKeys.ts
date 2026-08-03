// src/features/field/utils/dateKeys.ts
//
// Telemetry slots are identified by a LOCAL calendar day plus an hour. Using
// toISOString().slice(0, 10) for that is wrong: in UTC+2 it rolls the key over
// to tomorrow at 22:00 local, so late-evening logs land on the wrong day.
// Everything here works from local date components for that reason.

/** `YYYY-MM-DD` for the local calendar day a Date falls on. */
export const toLocalDateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Midnight at the start of the local day a Date falls on. */
export const startOfLocalDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

/** Do two Dates fall on the same local calendar day? */
export const isSameLocalDay = (a: Date, b: Date): boolean =>
  toLocalDateKey(a) === toLocalDateKey(b);

/**
 * The exact instant of `hour:00` on the local day of `date`, as an ISO string.
 * This is the canonical `telemetry_logs.target_hour` value for a slot — built
 * from local components so it round-trips back to the same wall-clock hour.
 */
export const slotISO = (date: Date, hour: number): string => {
  const safeHour = Number.isFinite(hour) ? hour : 0;
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    safeHour, 0, 0, 0
  ).toISOString();
};

/** Parses a numeric hour out of `14`, `"14"` or `"14:00"`. */
export const parseHour = (h: number | string): number => {
  const n = typeof h === "number" ? h : parseInt(String(h ?? "0").split(":")[0], 10);
  return Number.isNaN(n) ? 0 : n;
};

/** Inclusive local-day bounds covering the calendar month `date` sits in. */
export const monthBounds = (date: Date): { start: Date; end: Date } => ({
  start: new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0),
  end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999),
});

/** Every local day in the calendar month `date` sits in. */
export const daysInMonth = (date: Date): Date[] => {
  const total = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Array.from(
    { length: total },
    (_, i) => new Date(date.getFullYear(), date.getMonth(), i + 1)
  );
};
