// src/features/field/components/DateScrubber.tsx
import { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import {
  daysInMonth,
  isSameLocalDay,
  startOfLocalDay,
  toLocalDateKey,
} from "../utils/dateKeys";

interface DateScrubberProps {
  selectedDate: Date;
  /** Month currently on screen — may differ from selectedDate while browsing. */
  viewMonth: Date;
  /** Hours logged per local date key (`YYYY-MM-DD`), used for the day badges. */
  dayCounts: Record<string, number>;
  onSelectDate: (date: Date) => void;
  onChangeMonth: (month: Date) => void;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DateScrubber({
  selectedDate,
  viewMonth,
  dayCounts,
  onSelectDate,
  onChangeMonth,
}: DateScrubberProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const days = useMemo(() => daysInMonth(viewMonth), [viewMonth]);

  // Keep the active day in view when the month or selection changes, otherwise
  // landing on a past month leaves the strip scrolled to the 1st.
  useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      selectedRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [selectedDate, viewMonth]);

  const shiftMonth = (delta: number) =>
    onChangeMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1));

  const isViewingCurrentMonth =
    viewMonth.getFullYear() === today.getFullYear() &&
    viewMonth.getMonth() === today.getMonth();

  return (
    <div className="space-y-3">
      {/* Month header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <CalendarDays size={14} className="text-gray-400" />
          <span className="text-xs font-black text-gray-800 uppercase tracking-wider">
            {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {!isSameLocalDay(selectedDate, today) && (
            <button
              type="button"
              onClick={() => {
                onChangeMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                onSelectDate(today);
              }}
              className="px-2.5 py-1 rounded-lg bg-brand-50 border border-brand-100 text-[9px] font-black uppercase tracking-wider text-brand-600 hover:bg-brand-100 transition-colors cursor-pointer"
            >
              Today
            </button>
          )}
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            disabled={isViewingCurrentMonth}
            aria-label="Next month"
            className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${
              isViewingCurrentMonth
                ? "bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed"
                : "bg-white border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 cursor-pointer"
            }`}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Horizontal day strip */}
      <div
        ref={scrollRef}
        className="flex items-stretch gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1"
      >
        {days.map((day) => {
          const key = toLocalDateKey(day);
          const isSelected = isSameLocalDay(day, selectedDate);
          const isToday = isSameLocalDay(day, today);
          const isFuture = day.getTime() > today.getTime();
          const count = dayCounts[key] || 0;

          return (
            <button
              key={key}
              ref={isSelected ? selectedRef : undefined}
              type="button"
              disabled={isFuture}
              onClick={() => onSelectDate(day)}
              className={`shrink-0 w-12 py-2 rounded-2xl border flex flex-col items-center gap-0.5 transition-all ${
                isFuture
                  ? "bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed"
                  : isSelected
                    ? "bg-slate-900 border-slate-950 text-white shadow-md cursor-pointer"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 cursor-pointer"
              }`}
            >
              <span
                className={`text-[8px] font-black uppercase tracking-wider ${
                  isSelected ? "text-slate-300" : isFuture ? "text-gray-300" : "text-gray-400"
                }`}
              >
                {WEEKDAY[day.getDay()]}
              </span>
              <span className="text-sm font-black leading-none font-mono">{day.getDate()}</span>

              {/* Logged-hours badge: how much of that day actually has data. */}
              <span
                className={`text-[8px] font-black leading-none mt-0.5 px-1 py-0.5 rounded-full min-w-[18px] ${
                  count === 0
                    ? isSelected
                      ? "bg-white/10 text-slate-400"
                      : "bg-gray-50 text-gray-300"
                    : count >= 24
                      ? isSelected
                        ? "bg-ok-400 text-slate-900"
                        : "bg-ok-100 text-ok-700"
                      : isSelected
                        ? "bg-warn-400 text-slate-900"
                        : "bg-warn-50 text-warn-700"
                }`}
              >
                {count === 0 ? "–" : count}
              </span>

              {isToday && (
                <span
                  className={`w-1 h-1 rounded-full ${isSelected ? "bg-brand-400" : "bg-brand-500"}`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default DateScrubber;
