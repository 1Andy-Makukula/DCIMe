// src/features/field/components/ShiftCheckInPrompt.tsx
import { useState } from "react";
import { Sun, Moon, X, LogIn } from "lucide-react";
import { toast } from "sonner";
import { useShiftSession, ShiftType } from "@/shared/context/ShiftContext";
import { useCurrentSite } from "@/shared/context/SiteContext";

/**
 * Soft check-in prompt. Deliberately dismissible: telemetry logging must never
 * be blocked by shift bookkeeping, so skipping simply leaves records untagged.
 */
export function ShiftCheckInPrompt() {
  const { needsCheckIn, isPromptDismissed, dismissPrompt, checkIn } = useShiftSession();
  const { currentSite } = useCurrentSite();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!needsCheckIn || isPromptDismissed) return null;

  // Suggest the shift that matches the clock, but let the technician override:
  // someone starting at 18:05 may be closing out the day shift.
  const hour = new Date().getHours();
  const suggested: ShiftType = hour >= 8 && hour < 18 ? "DAY_SHIFT" : "NIGHT_SHIFT";

  const handleCheckIn = async (shiftType: ShiftType) => {
    setIsSubmitting(true);
    try {
      await checkIn(shiftType);
      toast.success(
        `Checked in — ${shiftType === "DAY_SHIFT" ? "Day" : "Night"} Shift at ${currentSite?.site_name || "site"}`
      );
    } catch (err: any) {
      console.error("[DCIMe] Shift check-in failed:", err);
      toast.error(err?.message || "Could not check in. You can still log telemetry.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const OPTIONS: { type: ShiftType; icon: typeof Sun; label: string; window: string }[] = [
    { type: "DAY_SHIFT",   icon: Sun,  label: "Day Shift",   window: "08:00 – 18:00" },
    { type: "NIGHT_SHIFT", icon: Moon, label: "Night Shift", window: "18:00 – 08:00" },
  ];

  return (
    <div className="max-w-md mx-auto bg-white border border-gray-200 rounded-3xl p-5 shadow-sm space-y-4 animate-fade-in relative">
      <button
        type="button"
        onClick={dismissPrompt}
        aria-label="Dismiss shift check-in"
        className="absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition-colors cursor-pointer"
      >
        <X size={16} />
      </button>

      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-500 shrink-0">
          <LogIn size={16} />
        </div>
        <div>
          <h3 className="text-sm font-black text-gray-900 tracking-tight">Check in to your shift</h3>
          <p className="text-[10px] font-semibold text-gray-400 mt-0.5">
            Tags your logs to this shift for handover and audit.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSuggested = opt.type === suggested;
          return (
            <button
              key={opt.type}
              type="button"
              disabled={isSubmitting}
              onClick={() => handleCheckIn(opt.type)}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer disabled:opacity-60 ${
                isSuggested
                  ? "bg-slate-900 border-slate-950 text-white shadow-sm"
                  : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Icon size={16} className={isSuggested ? "text-warn-300" : "text-gray-400"} />
              <span className="block text-[11px] font-black uppercase tracking-wider mt-1.5">
                {opt.label}
              </span>
              <span
                className={`block text-[9px] font-bold font-mono mt-0.5 ${
                  isSuggested ? "text-slate-300" : "text-gray-400"
                }`}
              >
                {opt.window}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={dismissPrompt}
        className="w-full text-[10px] font-bold text-gray-400 hover:text-gray-600 uppercase tracking-wider py-1 cursor-pointer"
      >
        Skip for now
      </button>
    </div>
  );
}

export default ShiftCheckInPrompt;
