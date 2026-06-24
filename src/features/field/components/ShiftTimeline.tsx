import { CheckCircle2, AlertTriangle, Play, Lock } from "lucide-react";

interface ShiftTimelineProps {
  currentTime: Date;
  completedHours: number[];
  onSelectSlot: (hour: number) => void;
}

export function ShiftTimeline({ currentTime, completedHours, onSelectSlot }: ShiftTimelineProps) {
  const currentHour = currentTime.getHours();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">
            24-Hour Shift Timeline
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Select an active or overdue slot to log telemetry.
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-mono uppercase tracking-wide">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {Array.from({ length: 24 }).map((_, hour) => {
          const isCompleted = completedHours.includes(hour);
          const isActive = hour === currentHour;
          const isOverdue = hour < currentHour && !isCompleted;

          let status: "completed" | "active" | "overdue" | "future" = "future";
          if (isCompleted) status = "completed";
          else if (isActive) status = "active";
          else if (isOverdue) status = "overdue";

          const formattedHour = `${hour.toString().padStart(2, "0")}:00`;

          let btnClass = "";
          let icon = null;

          switch (status) {
            case "completed":
              btnClass = "bg-green-50 border-green-200 text-green-700 hover:bg-green-100/50 hover:border-green-300";
              icon = <CheckCircle2 size={14} className="text-green-600" />;
              break;
            case "active":
              btnClass = "bg-blue-50 border-blue-400 text-blue-800 ring-2 ring-blue-400/50 hover:bg-blue-100/80 animate-pulse";
              icon = <Play size={10} fill="currentColor" className="text-blue-600" />;
              break;
            case "overdue":
              btnClass = "bg-red-50 border-red-200 text-red-700 hover:bg-red-100/50 hover:border-red-300";
              icon = <AlertTriangle size={14} className="text-red-600" />;
              break;
            case "future":
              btnClass = "bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed opacity-50";
              icon = <Lock size={11} className="text-gray-300" />;
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
