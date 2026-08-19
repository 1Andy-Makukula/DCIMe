// src/shared/ui/DateRangePicker.tsx
import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { DateRangePreset } from "@/shared/utils/useDateRange";

const PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "thisMonth", label: "This Month" },
  { id: "lastMonth", label: "Last Month" },
  { id: "thisYear", label: "This Year" },
  { id: "allTime", label: "All Time" },
];

const toInputDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

interface DateRangePickerProps {
  label: string;
  preset: DateRangePreset;
  /** Currently active bounds, used only to pre-fill the custom inputs. */
  activeStart: Date;
  activeEnd: Date;
  onSelectPreset: (preset: DateRangePreset) => void;
  onSelectCustom: (start: Date, end: Date) => void;
}

export function DateRangePicker({ label, preset, activeStart, activeEnd, onSelectPreset, onSelectCustom }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isOpen]);

  // Reopening the picker while already on a custom range must show what's
  // actually selected, not blank inputs that look like the choice was lost.
  useEffect(() => {
    if (isOpen && preset === "custom") {
      setCustomStart(toInputDate(activeStart));
      setCustomEnd(toInputDate(activeEnd));
    }
  }, [isOpen, preset, activeStart, activeEnd]);

  const applyCustom = () => {
    if (!customStart || !customEnd) return;
    const start = new Date(`${customStart}T00:00:00`);
    const end = new Date(`${customEnd}T00:00:00`);
    if (start.getTime() > end.getTime()) return;
    onSelectCustom(start, end);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 h-9 px-3.5 rounded-xl border border-gray-200 bg-white text-[11px] font-black text-gray-700 uppercase tracking-wider hover:border-gray-300 transition-all cursor-pointer"
      >
        <Calendar size={13} className="text-gray-500" />
        {label}
        <ChevronDown size={12} className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-20 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden w-56">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onSelectPreset(p.id); setIsOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-[11px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                preset === p.id ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          ))}

          <div className={`border-t border-gray-100 px-4 py-3 space-y-2 ${preset === "custom" ? "bg-gray-50" : ""}`}>
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">
              Custom Range
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="flex-1 min-w-0 h-8 px-2 rounded-lg border border-gray-200 text-[10px] font-bold text-gray-700"
              />
              <span className="text-gray-400 text-[10px]">–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="flex-1 min-w-0 h-8 px-2 rounded-lg border border-gray-200 text-[10px] font-bold text-gray-700"
              />
            </div>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!customStart || !customEnd}
              className="w-full h-8 rounded-lg bg-gray-900 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:bg-gray-800 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DateRangePicker;
