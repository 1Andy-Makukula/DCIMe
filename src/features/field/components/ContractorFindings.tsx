import { useState } from "react";
import { Plus, Trash2, ClipboardCheck, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useContractorVisits } from "@/features/field/hooks/useContractorVisits";

// ─────────────────────────────────────────────────────────────────────────────
// What the contractor found, entered as separate items.
//
// The distinction this preserves: the VISIT is that someone came and looked;
// the FINDINGS are the defects they identified. V1 collapsed both into one
// notes field, so three defects became one paragraph and none of them were
// trackable (audit A-05).
//
// Findings are staged locally and submitted together once the visit exists —
// a visit has to be saved before anything can reference it, and asking a
// technician to save, wait, then type findings loses items to the gap.
// ─────────────────────────────────────────────────────────────────────────────

export type Severity = "P1" | "P2" | "P3" | "P4";

export interface DraftFinding {
  summary:   string;
  severity:  Severity;
  detail:    string;
  raiseWork: boolean;
}

const SEVERITY_META: Record<Severity, { label: string; cls: string }> = {
  P1: { label: "Critical", cls: "bg-danger-50 text-danger-700 border-danger-200" },
  P2: { label: "High",     cls: "bg-warn-50 text-warn-700 border-warn-200" },
  P3: { label: "Medium",   cls: "bg-warn-50 text-warn-700 border-warn-200" },
  P4: { label: "Low",      cls: "bg-slate-50 text-slate-600 border-slate-200" }
};

export const emptyFinding = (): DraftFinding => ({
  summary: "", severity: "P3", detail: "", raiseWork: true
});

/**
 * Collects findings while a visit is being written up. The parent owns the
 * list, so it can submit them after the visit is created.
 */
export function ContractorFindingsEditor({
  findings, onChange
}: {
  findings: DraftFinding[];
  onChange: (next: DraftFinding[]) => void;
}) {
  const update = (i: number, patch: Partial<DraftFinding>) =>
    onChange(findings.map((f, ix) => (ix === i ? { ...f, ...patch } : f)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <ClipboardCheck size={15} className="mt-0.5 shrink-0 text-gray-400" />
        <div>
          <p className="text-[12px] font-black uppercase tracking-wider text-gray-700">
            Findings
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
            Record each defect separately so it can be tracked and closed out.
            Anything left here as a note disappears into the visit history.
          </p>
        </div>
      </div>

      {findings.map((f, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-3">
          <div className="flex items-start gap-2">
            <input
              value={f.summary}
              onChange={e => update(i, { summary: e.target.value })}
              placeholder="What was found, e.g. Coolant hose perished on DG-2"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] placeholder-gray-400 focus:border-gray-400 focus:outline-none"
            />
            <button
              onClick={() => onChange(findings.filter((_, ix) => ix !== i))}
              aria-label="Remove finding"
              className="shrink-0 rounded-lg p-2 text-gray-300 hover:bg-danger-50 hover:text-danger-600"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <textarea
            value={f.detail}
            onChange={e => update(i, { detail: e.target.value })}
            placeholder="Any detail worth passing on (optional)"
            rows={2}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] placeholder-gray-400 focus:border-gray-400 focus:outline-none"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(SEVERITY_META) as Severity[]).map(s => (
              <button
                key={s}
                onClick={() => update(i, { severity: s })}
                className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                  f.severity === s ? SEVERITY_META[s].cls : "border-gray-200 bg-white text-gray-400"
                }`}
              >
                {s} · {SEVERITY_META[s].label}
              </button>
            ))}
          </div>

          {/* Not every observation is work. Forcing a job for each one would
              either fabricate work or stop people recording what they saw. */}
          <label className="flex cursor-pointer items-center gap-2 pt-0.5">
            <input
              type="checkbox"
              checked={f.raiseWork}
              onChange={e => update(i, { raiseWork: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 accent-gray-900"
            />
            <span className="text-[11px] font-semibold text-gray-600">
              Raise a job for this
            </span>
            {!f.raiseWork && (
              <span className="text-[10px] text-gray-400">— recorded as an observation only</span>
            )}
          </label>
        </div>
      ))}

      <button
        onClick={() => onChange([...findings, emptyFinding()])}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-2.5 text-[12px] font-bold text-gray-600 transition-colors hover:bg-gray-50"
      >
        <Plus size={14} /> Add a finding
      </button>

      {findings.length === 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-warn-50/60 p-2.5">
          <AlertCircle size={13} className="mt-0.5 shrink-0 text-warn-600" />
          <p className="text-[10px] leading-snug text-warn-800">
            No findings recorded. If the contractor identified defects, add them
            here — otherwise the next visit will rediscover them.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Submits staged findings against a saved visit. Returns how many were written,
 * and reports partial failure honestly rather than claiming a clean save.
 */
export function useSubmitFindings() {
  const { recordFinding } = useContractorVisits();
  const [busy, setBusy] = useState(false);

  const submit = async (visitId: string, findings: DraftFinding[]): Promise<number> => {
    const usable = findings.filter(f => f.summary.trim());
    if (usable.length === 0) return 0;

    setBusy(true);
    let written = 0;
    const failed: string[] = [];
    try {
      for (const f of usable) {
        try {
          await recordFinding(visitId, {
            summary:   f.summary,
            severity:  f.severity,
            detail:    f.detail || null,
            raiseWork: f.raiseWork
          });
          written += 1;
        } catch (e: any) {
          // Keep going: one bad finding must not discard the others the
          // technician already typed.
          failed.push(f.summary.slice(0, 40));
        }
      }
      if (failed.length > 0) {
        toast.error(`${written} saved, ${failed.length} failed — retry: ${failed.join(", ")}`);
      }
    } finally {
      setBusy(false);
    }
    return written;
  };

  return { submit, busy };
}

/** Small inline spinner for the parent's submit button. */
export function FindingsBusy() {
  return <Loader2 size={14} className="animate-spin" />;
}
