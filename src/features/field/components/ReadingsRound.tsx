import { useState } from "react";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { useTelemetryMutation } from "@/features/field/hooks/useTelemetryMutation";
import { DynamicReadingForm } from "./DynamicReadingForm";
import type { Frequency } from "@/features/field/hooks/useFormDefinition";

// ─────────────────────────────────────────────────────────────────────────────
// The registry-driven reading round.
//
// Mounted ALONGSIDE RoutineTasksDashboard rather than replacing it. The V1
// dashboard carries facility-mode logic this form does not yet have —
// getVisibleMetrics hides generator fields unless the site is in DAILY_TEST,
// OUTAGE or ON_LOAD_TEST, and hides grid fields during an outage. Swapping it
// out now would silently drop that.
//
// Migrating it means expressing visibility as DATA (a rule column on
// equipment_parameters) rather than a switch statement — worth doing, and worth
// doing deliberately rather than as a side effect of mounting a route.
//
// The submit path is the real one: the same submitTelemetryLog and the same
// flat metrics shape, so a round recorded here is indistinguishable from one
// recorded on the V1 dashboard, and every existing chart and export keeps working.
// ─────────────────────────────────────────────────────────────────────────────

const ROUNDS: { value: Frequency; label: string }[] = [
  { value: "hourly", label: "Hourly" },
  { value: "2-hour", label: "2-Hour" },
  { value: "4-hour", label: "4-Hour" },
  { value: "daily",  label: "Daily"  }
];

export function ReadingsRound() {
  const [frequency, setFrequency] = useState<Frequency>("hourly");
  const { submitTelemetryLog, isMutating } = useTelemetryMutation();

  const handleSubmit = async (
    values: Record<string, string>,
    suspect: string[]
  ) => {
    // Blank fields are omitted rather than written as empty strings — an absent
    // reading and a reading of "" are different facts, and the charts already
    // treat a missing key as "not taken".
    const metrics: Record<string, any> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v !== "") metrics[k] = v;
    }

    // Values are recorded regardless; the flag travels WITH them so a reviewer
    // can find them later. Refusing the submission would only teach the
    // technician to type something plausible instead.
    if (suspect.length > 0) {
      metrics.quality_flags = suspect;
    }

    const ok = await submitTelemetryLog("facility_wide", metrics, new Date());

    if (ok) {
      toast.success(
        suspect.length > 0
          ? `Round saved — ${suspect.length} reading${suspect.length === 1 ? "" : "s"} flagged for review`
          : "Round saved"
      );
    } else {
      toast.error("Could not save the round. Your entries are still on screen.");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <div className="flex items-center gap-2 overflow-x-auto">
        <Clock size={14} className="shrink-0 text-gray-400" />
        {ROUNDS.map(r => (
          <button
            key={r.value}
            onClick={() => setFrequency(r.value)}
            aria-pressed={frequency === r.value}
            className={[
              "shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
              frequency === r.value
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            ].join(" ")}
          >
            {r.label}
          </button>
        ))}
      </div>

      <DynamicReadingForm
        frequency={frequency}
        onSubmit={isMutating ? undefined : handleSubmit}
      />
    </div>
  );
}
