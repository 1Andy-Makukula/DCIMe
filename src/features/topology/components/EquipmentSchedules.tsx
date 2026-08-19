import { useState } from "react";
import {
  Loader2, Plus, Trash2, CalendarClock, Gauge, AlertTriangle, CheckCircle2, X
} from "lucide-react";
import { toast } from "sonner";
import {
  useMaintenanceSchedules,
  type DueSchedule,
  type ScheduleBasis,
  type ScheduleStatus
} from "@/features/topology/hooks/useMaintenanceSchedules";

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance schedules for one machine.
//
// Lives inside the equipment modal, so "click the asset, add a service
// interval" is one flow rather than a separate screen someone has to find.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS: Record<ScheduleStatus, { label: string; cls: string; hint: string }> = {
  "ok":        { label: "On track",  cls: "bg-ok-50 text-ok-700 border-ok-200", hint: "" },
  "due-soon":  { label: "Due soon",  cls: "bg-warn-50 text-warn-700 border-warn-200",       hint: "" },
  "due":       { label: "Due now",   cls: "bg-danger-50 text-danger-700 border-danger-200",             hint: "" },
  // A schedule with no meter reading is BLIND, not healthy. Saying so is the
  // difference between a machine that is fine and one nobody is watching.
  "no-meter":  { label: "No reading", cls: "bg-slate-100 text-slate-600 border-slate-300",
                 hint: "No run-hour reading has been logged, so this schedule cannot fire." }
};

function ScheduleRow({ s, onDelete }: { s: DueSchedule; onDelete: () => void }) {
  const st = STATUS[s.status] ?? STATUS.ok;
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-bold text-gray-900">{s.task}</p>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${st.cls}`}>
            {st.label}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-gray-400">
          {s.basis === "RUN_HOURS" ? (
            <>
              <span className="inline-flex items-center gap-1"><Gauge size={11} /> Run hours</span>
              {s.current_hours !== null && <span>meter {Math.round(s.current_hours)}h</span>}
              {s.hours_remaining !== null && (
                <span className={s.hours_remaining < 0 ? "font-bold text-danger-600" : ""}>
                  {s.hours_remaining < 0
                    ? `${Math.abs(Math.round(s.hours_remaining))}h overdue`
                    : `${Math.round(s.hours_remaining)}h remaining`}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1"><CalendarClock size={11} /> Calendar</span>
              {s.due_date && <span>due {new Date(s.due_date).toLocaleDateString()}</span>}
            </>
          )}
          <span>{s.severity}</span>
        </div>

        {st.hint && <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{st.hint}</p>}
        {s.detail && <p className="mt-1.5 text-[11px] leading-snug text-gray-500">{s.detail}</p>}

        <p className="mt-1.5 text-[10px] text-gray-400">
          {s.last_done_at
            ? `Last done ${new Date(s.last_done_at).toLocaleDateString()}` +
              (s.last_done_hours !== null ? ` at ${Math.round(s.last_done_hours)}h` : "")
            : "Never recorded as done"}
        </p>
      </div>

      <button
        onClick={onDelete}
        aria-label={`Delete schedule ${s.task}`}
        className="shrink-0 rounded-lg p-2 text-gray-300 transition-colors hover:bg-danger-50 hover:text-danger-600"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function EquipmentSchedules({
  equipmentId, templateId
}: {
  equipmentId: string;
  /** Present when the machine was deployed from a template — enables fleet-wide scope. */
  templateId?: string | null;
}) {
  const { schedules, isLoading, error, create, remove } = useMaintenanceSchedules(equipmentId);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy]     = useState(false);

  const [task, setTask]         = useState("");
  const [detail, setDetail]     = useState("");
  const [basis, setBasis]       = useState<ScheduleBasis>("RUN_HOURS");
  const [hours, setHours]       = useState("250");
  const [days, setDays]         = useState("90");
  const [severity, setSeverity] = useState("P3");
  const [lead, setLead]         = useState("20");
  const [scope, setScope]       = useState<"EQUIPMENT" | "TEMPLATE">("EQUIPMENT");

  const submit = async () => {
    if (!task.trim()) { toast.error("Give the task a name"); return; }
    setBusy(true);
    try {
      await create({
        task, detail, severity, basis,
        interval_hours: basis === "RUN_HOURS" ? Number(hours) : undefined,
        interval_days:  basis === "CALENDAR"  ? Number(days)  : undefined,
        lead_hours: Number(lead),
        scope, template_id: templateId ?? null
      });
      toast.success("Schedule added");
      setAdding(false);
      setTask(""); setDetail("");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add the schedule");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-[11px] font-bold uppercase tracking-wider">Loading schedules…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger-600" />
          <p className="text-[11px] text-danger-800">{error}</p>
        </div>
      )}

      {schedules.length === 0 && !adding && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-300 py-8 text-center">
          <CalendarClock size={22} className="text-gray-300" />
          <p className="text-[12px] font-bold text-gray-700">No maintenance scheduled</p>
          <p className="max-w-xs text-[11px] leading-snug text-gray-400">
            Run hours are already being recorded for this equipment. Add an
            interval and the job will raise itself when it comes due.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {schedules.map(s => (
          <ScheduleRow
            key={s.schedule_id}
            s={s}
            onDelete={async () => {
              try { await remove(s.schedule_id); toast.success("Schedule removed"); }
              catch (e: any) { toast.error(e?.message ?? "Could not remove it"); }
            }}
          />
        ))}
      </div>

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center justify-center gap-2 rounded-xl border border-gray-300 py-2.5 text-[12px] font-bold text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Plus size={14} /> Add a schedule
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-black uppercase tracking-wider text-gray-700">New schedule</p>
            <button onClick={() => setAdding(false)} aria-label="Cancel"
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-200">
              <X size={14} />
            </button>
          </div>

          <input
            value={task} onChange={e => setTask(e.target.value)}
            placeholder="e.g. 250-hour service"
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[12px] focus:border-gray-400 focus:outline-none"
          />
          <textarea
            value={detail} onChange={e => setDetail(e.target.value)}
            placeholder="What the job involves (optional)" rows={2}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[12px] focus:border-gray-400 focus:outline-none"
          />

          {/* Run hours vs calendar. A generator that ran 400 hours needs service
              sooner than one that ran 12, so the default is usage-based. */}
          <div className="grid grid-cols-2 gap-2">
            {(["RUN_HOURS", "CALENDAR"] as const).map(b => (
              <button key={b} onClick={() => setBasis(b)}
                className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-[11px] font-bold transition-colors ${
                  basis === b ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-600"}`}>
                {b === "RUN_HOURS" ? <Gauge size={13} /> : <CalendarClock size={13} />}
                {b === "RUN_HOURS" ? "Run hours" : "Calendar"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
                {basis === "RUN_HOURS" ? "Every (hours)" : "Every (days)"}
              </span>
              <input
                type="number" min={1}
                value={basis === "RUN_HOURS" ? hours : days}
                onChange={e => basis === "RUN_HOURS" ? setHours(e.target.value) : setDays(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] tabular-nums focus:border-gray-400 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">Warn ahead by</span>
              <input
                type="number" min={0} value={lead} onChange={e => setLead(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] tabular-nums focus:border-gray-400 focus:outline-none"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">Priority</span>
            <select value={severity} onChange={e => setSeverity(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] focus:border-gray-400 focus:outline-none">
              <option value="P1">P1 · Critical</option>
              <option value="P2">P2 · High</option>
              <option value="P3">P3 · Medium</option>
              <option value="P4">P4 · Low</option>
            </select>
          </label>

          {/* Fleet-wide is the right default for a model-level interval, but it
              is only offered when the machine actually came from a template. */}
          {templateId && (
            <div className="grid grid-cols-2 gap-2">
              {([["EQUIPMENT", "This unit only"], ["TEMPLATE", "All of this model"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setScope(k)}
                  className={`rounded-xl border py-2.5 text-[11px] font-bold transition-colors ${
                    scope === k ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-600"}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={submit} disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 py-2.5 text-[12px] font-bold text-white disabled:bg-gray-300"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Save schedule
          </button>
        </div>
      )}
    </div>
  );
}
