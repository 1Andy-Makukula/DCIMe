import { useState } from "react";
import {
  Plus, RefreshCw, CheckCircle2, X, Wrench, User, Users, Clock, AlertTriangle
} from "lucide-react";
import { useWorkOrders, type WorkState, type NewWorkOrder, type WorkOrder } from "../hooks/useWorkOrders";
import { SignaturePad, FSelect, FMultiSelect } from "@/shared/ui";
import { useAuth } from "@/shared/context/AuthContext";
import { resolveSignerName, signingBlockedReason } from "@/shared/utils/identity";

// ─────────────────────────────────────────────────────────────────────────────
// Admin work orders — the half of the job flow that did not exist.
//
// Raise a job, point it at a technician (or leave it in the pool), watch it
// move, and CLOSE it when the work is confirmed. Closing is the piece that was
// missing entirely: technicians could mark work RESOLVED but nothing ever took
// it further, so the queue never reached a terminal state.
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITIES = [
  { v: "P1", label: "P1 · Critical", hint: "Service affecting. Respond 15m." },
  { v: "P2", label: "P2 · High",     hint: "Degraded but holding. Respond 1h." },
  { v: "P3", label: "P3 · Medium",   hint: "Within the working week." },
  { v: "P4", label: "P4 · Low",      hint: "Housekeeping." }
];
const KINDS = ["FAULT", "INSPECTION", "PREVENTIVE", "FINDING", "CHANGE"];

const STATE_STYLE: Record<WorkState, string> = {
  OPEN:         "bg-warn-50 text-warn-700 border-warn-200",
  ACKNOWLEDGED: "bg-info-50 text-info-700 border-info-200",
  IN_PROGRESS:  "bg-brand-50 text-brand-700 border-brand-200",
  RESOLVED:     "bg-ok-50 text-ok-700 border-ok-200",
  CLOSED:       "bg-gray-100 text-gray-500 border-gray-200",
  CANCELLED:    "bg-gray-100 text-gray-400 border-gray-200"
};

const SEV_STYLE: Record<string, string> = {
  P1: "bg-danger-500 text-white",
  P2: "bg-warn-500 text-white",
  P3: "bg-info-500 text-white",
  P4: "bg-gray-400 text-white"
};

const EMPTY: NewWorkOrder = {
  title: "", detail: "", kind: "FAULT", severity: "P3", offered_to: [], due_at: null
};

export function WorkOrders() {
  const { orders, techs, isLoading, error, refresh, create, close, cancel } = useWorkOrders();
  const { employee } = useAuth();
  // The job awaiting a closing signature. Closing opens the pad rather than
  // committing straight away, so the confirmation is attributable to a person.
  const [closing, setClosing] = useState<WorkOrder | null>(null);
  const signerName    = resolveSignerName(employee);
  const signingBlocked = signingBlockedReason(employee);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft]     = useState<NewWorkOrder>(EMPTY);
  const [busy, setBusy]       = useState(false);
  const [notice, setNotice]   = useState<string | null>(null);
  const [tab, setTab]         = useState<"active" | "review" | "done">("active");

  const active = orders.filter(o => ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"].includes(o.state));
  const review = orders.filter(o => o.state === "RESOLVED");
  const done   = orders.filter(o => ["CLOSED", "CANCELLED"].includes(o.state));
  const shown  = tab === "active" ? active : tab === "review" ? review : done;

  const say = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(null), 2600); };

  const submit = async () => {
    if (!draft.title.trim()) return;
    setBusy(true);
    try {
      await create(draft);
      setDraft(EMPTY); setShowNew(false);
      say(draft.offered_to.length === 0
        ? "Job broadcast to all technicians"
        : `Job offered to ${draft.offered_to.length} technician${draft.offered_to.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      say(e.message ?? "Could not create the job");
    } finally { setBusy(false); }
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-5">
      <div className="mx-auto max-w-5xl">

        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-[15px] font-black uppercase tracking-tight text-gray-900">Work Orders</h1>
            <p className="mt-0.5 text-[11px] font-semibold text-gray-500">
              Raise work, assign it, and close it out when the job is confirmed done.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} aria-label="Refresh"
              className="rounded-xl border border-gray-200 bg-white p-2 text-gray-400 transition-colors hover:text-gray-700">
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            </button>
            <button onClick={() => setShowNew(v => !v)}
              className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-brand-600">
              <Plus size={14} /> New Job
            </button>
          </div>
        </div>

        {notice && (
          <div className="mb-3 rounded-xl border border-ok-200 bg-ok-50 px-4 py-2.5 text-[11px] font-bold text-ok-700">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-danger-200 bg-danger-50 px-4 py-2.5 text-[11px] font-bold text-danger-700">
            <AlertTriangle size={13} /> {error}
          </div>
        )}

        {showNew && (
          <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-gray-400">
                  What needs doing
                </label>
                <input
                  value={draft.title}
                  onChange={e => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Replace UPS-2 fan tray"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-[13px] font-semibold outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Detail <span className="font-bold normal-case tracking-normal text-gray-300">optional</span>
                </label>
                <textarea
                  value={draft.detail}
                  onChange={e => setDraft({ ...draft, detail: e.target.value })}
                  rows={2}
                  placeholder="Bearing noise on the upper tray. Spare is in the store."
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-[12px] font-medium outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              <div>
                <FSelect
                  label="Kind"
                  value={draft.kind}
                  onChange={v => setDraft({ ...draft, kind: v })}
                  options={KINDS.map(k => ({ value: k, label: k }))}
                />
              </div>

              <div>
                {/* The response target rides along with each option, so the
                    choice is made against what it commits you to. */}
                <FSelect
                  label="Severity"
                  value={draft.severity}
                  onChange={v => setDraft({ ...draft, severity: v })}
                  options={SEVERITIES.map(s => ({ value: s.v, label: s.label, hint: s.hint }))}
                />
                <p className="mt-1 text-[10px] font-semibold text-gray-400">
                  {SEVERITIES.find(s => s.v === draft.severity)?.hint}
                </p>
              </div>

              <div>
                {/* Offering, not assigning. Ownership starts when somebody
                    accepts, which is what makes the response clock real. */}
                <FMultiSelect
                  label="Offer to"
                  value={draft.offered_to}
                  onChange={v => setDraft({ ...draft, offered_to: v })}
                  allowAll
                  allLabel="Broadcast to all technicians"
                  allHint="Anyone on site can accept it"
                  placeholder="Pick technicians..."
                  options={techs.map(x => ({
                    value: x.id,
                    label: x.full_name,
                    hint: x.role === "ADMIN" ? "Administrator" : undefined
                  }))}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Due <span className="font-bold normal-case tracking-normal text-gray-300">optional</span>
                </label>
                {/* Held in the control's own local format. Converting to ISO
                    here fed back a value it cannot parse, so the field blanked
                    itself on every keystroke. The conversion happens once, at
                    the API boundary in useWorkOrders.create(). */}
                <input
                  type="datetime-local"
                  value={draft.due_at ?? ""}
                  onChange={e => setDraft({ ...draft, due_at: e.target.value || null })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-[12px] font-bold text-gray-900 outline-none focus:border-brand-400"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
              <button onClick={() => { setShowNew(false); setDraft(EMPTY); }}
                className="rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wider text-gray-400 hover:text-gray-700">
                Cancel
              </button>
              <button onClick={submit} disabled={!draft.title.trim() || busy}
                className="rounded-xl bg-gray-900 px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-gray-700 disabled:bg-gray-200 disabled:text-gray-400">
                {busy ? "Creating..." : draft.offered_to.length === 0 ? "Broadcast Job" : "Offer Job"}
              </button>
            </div>
          </div>
        )}

        <div className="mb-3 flex gap-1 rounded-xl bg-gray-100 p-1">
          {([["active", "Active", active.length],
             ["review", "Awaiting Close", review.length],
             ["done",   "Closed", done.length]] as const).map(([k, label, n]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all ${
                tab === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}>
              {label} ({n})
            </button>
          ))}
        </div>

        <div className="space-y-2 pb-10">
          {shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
              <Wrench size={22} className="mx-auto mb-2 text-gray-300" />
              <p className="text-[12px] font-bold text-gray-400">
                {tab === "review" ? "Nothing waiting to be closed." : "No jobs here."}
              </p>
            </div>
          ) : shown.map(o => (
            <div key={o.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-black ${SEV_STYLE[o.severity] ?? SEV_STYLE.P4}`}>
                      {o.severity}
                    </span>
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${STATE_STYLE[o.state]}`}>
                      {o.state.replace("_", " ")}
                    </span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-gray-500">
                      {o.origin}
                    </span>
                  </div>

                  <p className="truncate text-[13px] font-black text-gray-900">{o.title}</p>
                  {o.detail && <p className="mt-0.5 text-[11px] font-medium text-gray-500">{o.detail}</p>}

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-bold text-gray-400">
                    <span className="flex items-center gap-1">
                      {o.assignee_name
                        ? <><User size={11} /> {o.assignee_name}</>
                        : o.offered_to === null
                          ? <><Users size={11} /> Broadcast · awaiting acceptance</>
                          : <><Users size={11} /> Offered to {o.offered_to.length} · awaiting acceptance</>}
                    </span>
                    {o.due_at && (
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> due {new Date(o.due_at).toLocaleString(undefined,
                          { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
                      </span>
                    )}
                  </div>

                  {o.resolution_note && (
                    <div className="mt-2 rounded-lg border border-ok-100 bg-ok-50/60 px-3 py-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-ok-600">Technician note</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-gray-700">{o.resolution_note}</p>
                    </div>
                  )}

                  {/* Who confirmed the work, and the mark they made. */}
                  {o.signature_image && (
                    <div className="mt-2 flex items-end gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                      <img
                        src={o.signature_image}
                        alt="Closing signature"
                        className="max-h-10 w-auto max-w-[9rem] object-contain"
                      />
                      <div className="min-w-0 border-t border-gray-300 pt-1">
                        <p className="font-mono text-[9px] uppercase tracking-widest text-gray-400">
                          Closed by
                        </p>
                        <p className="truncate text-[10px] font-black text-gray-700">
                          {o.signed_name ?? "Administrator"}
                        </p>
                        {o.signed_at && (
                          <p className="font-mono text-[9px] text-gray-400">
                            {new Date(o.signed_at).toLocaleString(undefined, {
                              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {o.state === "RESOLVED" && (
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      onClick={() => setClosing(o)}
                      disabled={!!signingBlocked}
                      title={signingBlocked ?? undefined}
                      className="flex items-center gap-1.5 rounded-xl bg-ok-500 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:bg-ok-600 disabled:bg-gray-200 disabled:text-gray-400">
                      <CheckCircle2 size={13} /> Close
                    </button>
                    <button
                      onClick={async () => { await cancel(o.id, "Reopened by admin: work not accepted."); say("Sent back"); }}
                      className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-800">
                      <X size={13} /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <SignaturePad
        open={!!closing}
        onClose={() => setClosing(null)}
        signerName={signerName || undefined}
        context={closing ? `Closing: ${closing.title}` : undefined}
        confirmLabel="Sign and close"
        onConfirm={async (sig) => {
          const job = closing;
          setClosing(null);
          if (!job) return;
          try {
            await close(job.id, sig, signerName);
            say("Job closed and signed");
          } catch (e: any) {
            say(e?.code === "PGRST204"
              ? "Signature columns missing. Apply 20260829_countersignatures.sql."
              : e?.message ?? "Could not close the job");
          }
        }}
      />
    </div>
  );
}
