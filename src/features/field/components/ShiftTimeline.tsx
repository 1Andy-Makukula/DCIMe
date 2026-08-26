import { CheckCircle2, AlertTriangle, Play, Lock } from "lucide-react";
import { isSameLocalDay, startOfLocalDay } from "../utils/dateKeys";

interface ShiftTimelineProps {
  currentTime: Date;
  /** The local day being inspected. Defaults to today when omitted. */
  selectedDate?: Date;
  completedHours: number[];
  onSelectSlot: (hour: number) => void;
}

export function ShiftTimeline({
  currentTime,
  selectedDate,
  completedHours,
  onSelectSlot,
}: ShiftTimelineProps) {
  const currentHour = currentTime.getHours();

  const today = startOfLocalDay(currentTime);
  const viewDay = startOfLocalDay(selectedDate ?? currentTime);

  const isToday = isSameLocalDay(viewDay, today);
  const isPastDay = viewDay.getTime() < today.getTime();
  const isFutureDay = viewDay.getTime() > today.getTime();

  const headingDate = isToday
    ? "Today"
    : viewDay.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-xs font-black text-neutral-400 uppercase tracking-widest">
            24-Hour Shift Timeline
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            {isFutureDay
              ? "Future date — slots open once the day arrives."
              : isPastDay
                ? "Past date — open any slot to review or backfill."
                : "Select an active or overdue slot to log telemetry."}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-bold bg-neutral-100 text-neutral-600 px-2.5 py-1 rounded-full font-mono uppercase tracking-wide">
            {isToday
              ? currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : headingDate}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {Array.from({ length: 24 }).map((_, hour) => {
          const isCompleted = completedHours.includes(hour);

          let status: "completed" | "active" | "overdue" | "future" = "future";
          if (isCompleted) {
            status = "completed";
          } else if (isFutureDay) {
            // Nothing on a future day can be logged yet.
            status = "future";
          } else if (isPastDay) {
            // The day is over, so any unlogged hour is a gap, not a pending slot.
            status = "overdue";
          } else if (hour === currentHour) {
            status = "active";
          } else if (hour < currentHour) {
            status = "overdue";
          }

          const formattedHour = `${hour.toString().padStart(2, "0")}:00`;

          let btnClass = "";
          let icon = null;

          switch (status) {
            case "completed":
              btnClass = "bg-ok-50 border-ok-200 text-ok-700 hover:bg-ok-100/50 hover:border-ok-300";
              icon = <CheckCircle2 size={14} className="text-ok-600" />;
              break;
            case "active":
              btnClass = "bg-info-50 border-info-400 text-info-800 ring-2 ring-info-400/50 hover:bg-info-100/80 animate-pulse";
              icon = <Play size={10} fill="currentColor" className="text-info-600" />;
              break;
            case "overdue":
              btnClass = "bg-danger-50 border-danger-200 text-danger-700 hover:bg-danger-100/50 hover:border-danger-300";
              icon = <AlertTriangle size={14} className="text-danger-600" />;
              break;
            case "future":
              btnClass = "bg-neutral-50 border-neutral-100 text-neutral-400 cursor-not-allowed opacity-50";
              icon = <Lock size={11} className="text-neutral-300" />;
              break;
          }

          return (
            <button
              key={hour}
              disabled={status === "future"}
              onClick={() => onSelectSlot(hour)}
              className={`flex flex-col items-center justify-between p-3 rounded-2xl border text-center font-bold transition-all duration-200 active:scale-95 shadow-sm min-h-[70px] ${btnClass}`}
            >
              <span className="text-[11px] font-mono leading-none">{formattedHour}</span>
              <div className="flex items-center justify-center h-4 mt-1">
                {icon}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ShiftTimeline;
