import { useState } from "react";
import { Check, Loader2, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/shared/api/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Safe operating range for a single parameter.
//
// These bounds do real work in three places:
//   · the reading form rejects a value outside them at entry
//   · evaluate_thresholds() raises a job when a logged reading breaches them
//   · severity comes from HOW FAR outside the band the reading sits, so the
//     width of the range matters as much as its edges
//
// V1 had none of this. Bounds were inferred at submit time by grepping the
// metric's name — anything containing "load" or "kw" got a range of 0 to
// 99,999,999, so a site load typed as 47600 instead of 476 passed validation,
// reached the database, and was reported to management (audit T-02).
// ─────────────────────────────────────────────────────────────────────────────

/** database.types.ts predates these columns — see useWorkQueue for the rationale. */
type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

export interface ParameterLimitsProps {
  parameterId: string;
  min:  number | null;
  max:  number | null;
  unit: string | null;
  onSaved: (min: number | null, max: number | null) => void;
}

export function ParameterLimits({ parameterId, min, max, unit, onSaved }: ParameterLimitsProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [lo, setLo] = useState(min === null ? "" : String(min));
  const [hi, setHi] = useState(max === null ? "" : String(max));

  const save = async () => {
    const nLo = lo.trim() === "" ? null : Number(lo);
    const nHi = hi.trim() === "" ? null : Number(hi);

    if (nLo !== null && Number.isNaN(nLo)) { toast.error("Minimum must be a number"); return; }
    if (nHi !== null && Number.isNaN(nHi)) { toast.error("Maximum must be a number"); return; }
    // Caught here as well as by the database, so the message names the problem
    // rather than surfacing a constraint violation.
    if (nLo !== null && nHi !== null && nLo > nHi) {
      toast.error("Minimum cannot be above maximum");
      return;
    }

    setBusy(true);
    try {
      const { error } = await from("equipment_parameters")
        .update({ min_value: nLo, max_value: nHi })
        .eq("id", parameterId);
      if (error) throw new Error(error.message);
      onSaved(nLo, nHi);
      setEditing(false);
      toast.success(
        nLo === null && nHi === null
          ? "Limits cleared — this reading will no longer raise alarms"
          : "Limits saved"
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save the limits");
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    const hasBand = min !== null || max !== null;
    return (
      <button
        onClick={() => setEditing(true)}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
          hasBand
            ? "border-ok-200 bg-ok-50 text-ok-700 hover:bg-ok-100"
            : "border-gray-200 bg-white text-gray-400 hover:text-gray-600"
        }`}
        title={hasBand ? "Edit the safe range" : "No range set — this reading cannot raise an alarm"}
      >
        <SlidersHorizontal size={11} />
        {hasBand
          ? `${min ?? "–"} to ${max ?? "–"}${unit ? ` ${unit}` : ""}`
          : "Set range"}
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <input
        value={lo} onChange={e => setLo(e.target.value)}
        placeholder="min" inputMode="decimal" aria-label="Minimum"
        className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-[11px] tabular-nums focus:border-gray-500 focus:outline-none"
      />
      <span className="text-[10px] text-gray-400">to</span>
      <input
        value={hi} onChange={e => setHi(e.target.value)}
        placeholder="max" inputMode="decimal" aria-label="Maximum"
        className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-[11px] tabular-nums focus:border-gray-500 focus:outline-none"
      />
      {unit && <span className="text-[10px] font-bold uppercase text-gray-400">{unit}</span>}
      <button
        onClick={save} disabled={busy} aria-label="Save limits"
        className="rounded-lg bg-gray-900 p-1.5 text-white disabled:bg-gray-300"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      </button>
      <button
        onClick={() => { setEditing(false); setLo(min === null ? "" : String(min)); setHi(max === null ? "" : String(max)); }}
        aria-label="Cancel"
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
      >
        <X size={12} />
      </button>
    </div>
  );
}
