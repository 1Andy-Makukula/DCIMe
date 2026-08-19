// src/shared/utils/useDateRange.ts
import { useMemo, useState } from "react";

// Deliberately not imported from features/field/utils/dateKeys — shared/
// must not depend on features/, so the one function needed here is
// duplicated rather than inverting that dependency direction.
const startOfLocalDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

export type DateRangePreset =
  | "today"
  | "7d"
  | "30d"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "allTime"
  | "custom";

export interface DateRangeValue {
  /** Inclusive start of the range, local midnight. */
  start: Date;
  /** Inclusive end of the range, local 23:59:59.999. */
  end: Date;
  preset: DateRangePreset;
  label: string;
}

const endOfLocalDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const formatShort = (d: Date): string => `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

/**
 * Every admin/analytics screen needs "what period am I looking at" — this is
 * the one place that answers it. Before this hook, each screen either had no
 * date filter at all (unbounded queries, or a hardcoded `.limit(50)` standing
 * in for a real range) or — in ShiftReports — a picker whose selection was
 * never actually passed to the query.
 */
export function computeRange(preset: DateRangePreset, customStart?: Date, customEnd?: Date): DateRangeValue {
  const today = startOfLocalDay(new Date());

  switch (preset) {
    case "today":
      return { start: today, end: endOfLocalDay(today), preset, label: "Today" };

    case "7d": {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      return { start, end: endOfLocalDay(today), preset, label: "Last 7 Days" };
    }

    case "30d": {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
      return { start, end: endOfLocalDay(today), preset, label: "Last 30 Days" };
    }

    case "thisMonth": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        start,
        end: endOfLocalDay(today),
        preset,
        label: `This Month (${MONTH_NAMES[today.getMonth()]} ${today.getFullYear()})`,
      };
    }

    case "lastMonth": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
      return { start, end, preset, label: `Last Month (${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()})` };
    }

    case "thisYear": {
      const start = new Date(today.getFullYear(), 0, 1);
      return { start, end: endOfLocalDay(today), preset, label: `This Year (${today.getFullYear()})` };
    }

    case "allTime": {
      // No real telemetry predates the platform; this is just a wide-enough
      // floor so every consumer can use the same .gte/.lte shape instead of
      // special-casing "no filter at all".
      const start = new Date(2020, 0, 1);
      return { start, end: endOfLocalDay(today), preset, label: "All Time" };
    }

    case "custom": {
      const start = customStart ? startOfLocalDay(customStart) : today;
      const end = customEnd ? endOfLocalDay(customEnd) : endOfLocalDay(today);
      // start is midnight and end is 23:59:59.999, so their timestamps can
      // never be equal even on the same calendar day — compare the dates
      // themselves, not the instants.
      const sameDay = start.toDateString() === end.toDateString();
      const label = sameDay ? formatShort(start) : `${formatShort(start)} – ${formatShort(end)}`;
      return { start, end, preset, label };
    }
  }
}

export function useDateRange(defaultPreset: DateRangePreset = "30d") {
  const [preset, setPresetState] = useState<DateRangePreset>(defaultPreset);
  const [customStart, setCustomStart] = useState<Date | undefined>(undefined);
  const [customEnd, setCustomEnd] = useState<Date | undefined>(undefined);

  const range = useMemo(
    () => computeRange(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );

  const setPreset = (p: DateRangePreset) => {
    setPresetState(p);
  };

  const setCustomRange = (start: Date, end: Date) => {
    setCustomStart(start);
    setCustomEnd(end);
    setPresetState("custom");
  };

  return { range, preset, setPreset, setCustomRange };
}
