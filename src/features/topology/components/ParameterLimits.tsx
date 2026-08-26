import { useState } from "react";
import { Check, Loader2, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/shared/api/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Safe operating range for a single parameter.
//
// These bounds do real work in four places:
//   · the reading form flags a value outside them at entry
//   · evaluate_thresholds() raises a job when a logged reading breaches them
//   · severity comes from HOW FAR outside the band the reading sits
//   · reading_status() turns them into the red / amber / green every screen shows
//
// V1 had none of this. Bounds were inferred at submit time by grepping the
// metric's name — anything containing "load" or "kw" got a range of 0 to
// 99,999,999, so a site load typed as 47600 instead of 476 passed validation.
//
// FOUR NUMBERS, NOT TWO
// min and max are the hard limits: outside them is a breach and raises work.
// warn_min and warn_max sit INSIDE them and mean "still acceptable, heading the
// wrong way" — the amber that lets somebody act before the alarm. Without them
// a reading is only ever fine or failed, and every screen invents its own idea
// of "getting close".
//
// The warning band is optional. Hard limits alone still alarm; they just do it
// without warning first.
// ─────────────────────────────────────────────────────────────────────────────

/** database.types.ts predates these columns — see useWorkQueue for the rationale. */
type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

export interface ParameterBand {
  min:     number | null;
  warnMin: number | null;
  warnMax: number | null;
  max:     number | null;
}

export interface ParameterLimitsProps {
  parameterId: string;
  band: ParameterBand;
  unit: string | null;
  /** What this reading has actually done, when it is known — see below. */
  observed?: { p05: number | null; p95: number | null; n: number } | null;
  onSaved: (band: ParameterBand) => void;
}

const asNum = (s: string): number | null => (s.trim() === "" ? null : Number(s));

export function ParameterLimits({ parameterId, band, unit, observed, onSaved }: ParameterLimitsProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy]       = useState(false);

  const str = (v: number | null) => (v === null ? "" : String(v));
  const [lo, setLo]   = useState(str(band.min));
  const [wLo, setWLo] = useState(str(band.warnMin));
  const [wHi, setWHi] = useState(str(band.warnMax));
  const [hi, setHi]   = useState(str(band.max));

  const reset = () => {
    setLo(str(band.min)); setWLo(str(band.warnMin));
    setWHi(str(band.warnMax)); setHi(str(band.max));
  };

  const save = async () => {
    const next: ParameterBand = {
      min: asNum(lo), warnMin: asNum(wLo), warnMax: asNum(wHi), max: asNum(hi)
    };

    for (const [label, v] of [["Minimum", next.min], ["Warn low", next.warnMin],
                              ["Warn high", next.warnMax], ["Maximum", next.max]] as const) {
      if (v !== null && Number.isNaN(v)) { toast.error(`${label} must be a number`); return; }
    }

    // Checked here as well as by the database, so the message names the problem
    // rather than surfacing a constraint violation. The order these must hold
    // in is min ≤ warnMin ≤ warnMax ≤ max — a warning outside its own hard band
    // would show amber for a reading that is already a breach.
    const ordered = [next.min, next.warnMin, next.warnMax, next.max];
    const names   = ["minimum", "warn low", "warn high", "maximum"];
    let prev = -Infinity, prevName = "";
    for (let i = 0; i < ordered.length; i++) {
      const v = ordered[i];
      if (v === null) continue;
      if (v < prev) {
        toast.error(`The ${names[i]} cannot be below the ${prevName}`);
        return;
      }
      prev = v; prevName = names[i];
    }

    setBusy(true);
    try {
      const { error } = await from("equipment_parameters")
        .update({
          min_value: next.min, max_value: next.max,
          warn_min: next.warnMin, warn_max: next.warnMax
        })
        .eq("id", parameterId);
      if (error) throw new Error(error.message);
      onSaved(next);
      setEditing(false);
      toast.success(
        next.min === null && next.max === null
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
    const hasHard = band.min !== null || band.max !== null;
    const hasWarn = band.warnMin !== null || band.warnMax !== null;
    return (
      <button
        onClick={() => { reset(); setEditing(true); }}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
          hasHard
            ? "border-ok-200 bg-ok-50 text-ok-700 hover:bg-ok-100"
            : "border-neutral-200 bg-white text-neutral-400 hover:text-neutral-600"
        }`}
        title={hasHard
          ? (hasWarn ? "Edit the safe range and its warning band" : "Edit the safe range — no warning band set")
          : "No range set — this reading cannot raise an alarm and shows as unknown"}
      >
        <SlidersHorizontal size={11} />
        {hasHard
          ? `${band.min ?? "–"}${hasWarn ? ` · ${band.warnMin ?? "–"}–${band.warnMax ?? "–"} · ` : " to "}${band.max ?? "–"}${unit ? ` ${unit}` : ""}`
          : "Set range"}
      </button>
    );
  }

  const Field = ({ value, onChange, placeholder, label, tone }: {
    value: string; onChange: (v: string) => void;
    placeholder: string; label: string; tone: "hard" | "warn";
  }) => (
    <input
      value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} inputMode="decimal" aria-label={label} title={label}
      className={`w-14 rounded-lg border px-2 py-1.5 text-[11px] tabular-nums focus:outline-none ${
        tone === "hard"
          ? "border-danger-200 bg-danger-50/40 focus:border-danger-400"
          : "border-warn-200 bg-warn-50/40 focus:border-warn-400"
      }`}
    />
  );

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {/* Ordered as the band reads on a dial: breach, warn, warn, breach. */}
        <Field value={lo}  onChange={setLo}  placeholder="min"  label="Hard minimum — below this is a breach" tone="hard" />
        <Field value={wLo} onChange={setWLo} placeholder="↓"    label="Warn low — below this is amber"        tone="warn" />
        <Field value={wHi} onChange={setWHi} placeholder="↑"    label="Warn high — above this is amber"       tone="warn" />
        <Field value={hi}  onChange={setHi}  placeholder="max"  label="Hard maximum — above this is a breach" tone="hard" />
        {unit && <span className="text-[10px] font-bold uppercase text-neutral-400">{unit}</span>}
        <button
          onClick={save} disabled={busy} aria-label="Save limits"
          className="rounded-lg bg-neutral-900 p-1.5 text-white disabled:bg-neutral-300"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
        </button>
        <button
          onClick={() => { setEditing(false); reset(); }} aria-label="Cancel"
          className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100"
        >
          <X size={12} />
        </button>
      </div>

      {/* What this reading has actually done, offered as evidence and never as
          a suggestion. A parameter that has been out of range all month has an
          out-of-range p95, and the person setting the limit needs to see that
          rather than inherit it. */}
      {observed && observed.n > 0 && observed.p05 !== null && observed.p95 !== null && (
        <p className="text-[9px] font-semibold text-neutral-400">
          recorded: {observed.p05.toFixed(1)} – {observed.p95.toFixed(1)}
          {unit ? ` ${unit}` : ""} across {observed.n} readings (middle 90%)
        </p>
      )}
    </div>
  );
}
