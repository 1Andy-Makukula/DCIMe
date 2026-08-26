import { useState } from "react";
import {
  Plus, RefreshCw, CheckCircle2, X, Wrench, User, Users, Clock, AlertTriangle, BellRing
} from "lucide-react";
import {
  useWorkOrders,
  type WorkState, type NewWorkOrder, type WorkOrder, type Technician
} from "../hooks/useWorkOrders";
import { SignaturePad, FSelect, FMultiSelect } from "@/shared/ui";
import { useAuth } from "@/shared/context/AuthContext";
import { resolveSignerName, signingBlockedReason } from "@/shared/utils/identity";

// ─────────────────────────────────────────────────────────────────────────────
// Admin work orders — the half of the job flow that did not exist.
//
// Raise a job, give it to one person, several, or everyone on shift, watch it
// move, and CLOSE it when the work is confirmed. Closing is the piece that was
// missing entirely: technicians could mark work RESOLVED but nothing ever took
// it further, so the queue never reached a terminal state.
//
// Assignment is an instruction. Everyone it names is expected to acknowledge,
// and whoever starts the work owns it from that point — so this page shows two
// separate facts about every job: how many have answered, and who is on it.
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
  CLOSED:       "bg-neutral-100 text-neutral-500 border-neutral-200",
  CANCELLED:    "bg-neutral-100 text-neutral-400 border-neutral-200"
};

const SEV_STYLE: Record<string, string> = {
  P1: "bg-danger-500 text-white",
  P2: "bg-warn-500 text-white",
  P3: "bg-info-500 text-white",
  P4: "bg-neutral-400 text-white"
};

const EMPTY: NewWorkOrder = {
  title: "", detail: "", kind: "FAULT", severity: "P3", assigned_to: [], due_at: null
};

/**
 * Who the job was given to, named where naming is useful.
 *
 * One or two people are worth spelling out — that is the whole content of the
 * line. Beyond that a count plus how the group was chosen says more than a
 * list of names nobody reads, and ALL_ACTIVE is called out because it means
 * the shift roster was empty and the job was widened, not that somebody
 * deliberately told the entire site.
 */
function assignedLabel(o: WorkOrder, techs: Technician[]): string {
  const ids = o.assigned_to;
  if (!ids || ids.length === 0) return "Site-wide";      // predates assignment
  const name = (id: string) => techs.find(t => t.id === id)?.full_name ?? "Unknown";
  if (ids.length <= 2) return ids.map(name).join(" and ");
  if (o.assigned_scope === "ON_SHIFT")   return `${ids.length} on shift`;
  if (o.assigned_scope === "ALL_ACTIVE") return `All ${ids.length} — shift was empty`;
  return `${ids.length} technicians`;
}

export function WorkOrders() {
  const {
    orders, techs, onShift, isLoading, error, refresh, create, reassign, close, cancel
  } = useWorkOrders();
  // The job being redirected, and the people it is being redirected to.
  // Kept here rather than per-card so only one panel can be open at a time.
  const [redirect, setRedirect] = useState<WorkOrder | null>(null);
  const [redirectTo, setRedirectTo] = useState<string[]>([]);
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

  // Reported from what create() actually did, not from what the form asked
  // for: an empty on-shift roster widens the audience, and announcing the
  // intent instead of the outcome would hide that.
  const submit = async () => {
    if (!draft.title.trim()) return;
    setBusy(true);
    try {
      const { recipients, scope } = await create(draft);
      setDraft(EMPTY); setShowNew(false);
      const people = `${recipients} ${recipients === 1 ? "person" : "people"}`;
      say(
        scope === "INDIVIDUAL" ? "Job assigned"
        : scope === "ON_SHIFT" ? `Job assigned to ${people} on shift`
        : scope === "ALL_ACTIVE"
          ? `Nobody is checked in — job assigned to all ${recipients} technicians`
          : `Job assigned to ${people}`
      );
    } catch (e: any) {
      say(e.message ?? "Could not create the job");
    } finally { setBusy(false); }
  };

  return (
    <div className="h-full overflow-y-auto bg-neutral-50 p-5">
      <div className="mx-auto max-w-5xl">

        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-[15px] font-black uppercase tracking-tight text-neutral-900">Work Orders</h1>
            <p className="mt-0.5 text-[11px] font-semibold text-neutral-500">
              Raise work, assign it, and close it out when the job is confirmed done.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} aria-label="Refresh"
              className="rounded-xl border border-neutral-200 bg-white p-2 text-neutral-400 transition-colors hover:text-neutral-700">
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
          <div className="mb-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  What needs doing
                </label>
                <input
                  value={draft.title}
                  onChange={e => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Replace UPS-2 fan tray"
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-[13px] font-semibold outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  Detail <span className="font-bold normal-case tracking-normal text-neutral-300">optional</span>
                </label>
                <textarea
                  value={draft.detail}
                  onChange={e => setDraft({ ...draft, detail: e.target.value })}
                  rows={2}
                  placeholder="Bearing noise on the upper tray. Spare is in the store."
                  className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-[12px] font-medium outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
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
                <p className="mt-1 text-[10px] font-semibold text-neutral-400">
                  {SEVERITIES.find(s => s.v === draft.severity)?.hint}
                </p>
              </div>

              <div>
                {/* One person, several, or everyone on shift — all three are
                    the same act. Nobody accepts or declines; they acknowledge
                    and one of them does the work. */}
                <FMultiSelect
                  label="Assign to"
                  value={draft.assigned_to}
                  onChange={v => setDraft({ ...draft, assigned_to: v })}
                  allowAll
                  allLabel={onShift.length > 0
                    ? `Everyone on shift (${onShift.length})`
                    : "Everyone on shift"}
                  allHint={onShift.length > 0
                    ? onShift.map(t => t.full_name).join(", ")
                    : "Nobody is checked in right now"}
                  placeholder="Pick technicians..."
                  options={techs.map(x => ({
                    value: x.id,
                    label: x.full_name,
                    hint: [
                      x.on_shift ? "On shift" : null,
                      x.role === "ADMIN" ? "Administrator" : null
                    ].filter(Boolean).join(" · ") || undefined
                  }))}
                />
                {/* Said before the button is pressed, not after. Check-in is a
                    soft prompt, so an empty roster usually means nobody tapped
                    it rather than that the site is unmanned — the job still
                    goes out, but the admin should know how wide. */}
                {draft.assigned_to.length === 0 && onShift.length === 0 && (
                  <p className="mt-1 text-[10px] font-bold text-warn-600">
                    Nobody is checked in. This will go to all {techs.length} technicians on site.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  Due <span className="font-bold normal-case tracking-normal text-neutral-300">optional</span>
                </label>
                {/* Held in the control's own local format. Converting to ISO
                    here fed back a value it cannot parse, so the field blanked
                    itself on every keystroke. The conversion happens once, at
                    the API boundary in useWorkOrders.create(). */}
                <input
                  type="datetime-local"
                  value={draft.due_at ?? ""}
                  onChange={e => setDraft({ ...draft, due_at: e.target.value || null })}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-[12px] font-bold text-neutral-900 outline-none focus:border-brand-400"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
              <button onClick={() => { setShowNew(false); setDraft(EMPTY); }}
                className="rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wider text-neutral-400 hover:text-neutral-700">
                Cancel
              </button>
              <button onClick={submit} disabled={!draft.title.trim() || busy}
                className="rounded-xl bg-neutral-900 px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-neutral-700 disabled:bg-neutral-200 disabled:text-neutral-400">
                {busy ? "Assigning..."
                  : draft.assigned_to.length === 0 ? "Assign to Shift" : "Assign Job"}
              </button>
            </div>
          </div>
        )}

        <div className="mb-3 flex gap-1 rounded-xl bg-neutral-100 p-1">
          {([["active", "Active", active.length],
             ["review", "Awaiting Close", review.length],
             ["done",   "Closed", done.length]] as const).map(([k, label, n]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all ${
                tab === k ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-400 hover:text-neutral-600"
              }`}>
              {label} ({n})
            </button>
          ))}
        </div>

        <div className="space-y-2 pb-10">
          {shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center">
              <Wrench size={22} className="mx-auto mb-2 text-neutral-300" />
              <p className="text-[12px] font-bold text-neutral-400">
                {tab === "review" ? "Nothing waiting to be closed." : "No jobs here."}
              </p>
            </div>
          ) : shown.map(o => (
            <div key={o.id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-black ${SEV_STYLE[o.severity] ?? SEV_STYLE.P4}`}>
                      {o.severity}
                    </span>
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${STATE_STYLE[o.state]}`}>
                      {o.state.replace("_", " ")}
                    </span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-neutral-500">
                      {o.origin}
                    </span>
                  </div>

                  <p className="truncate text-[13px] font-black text-neutral-900">{o.title}</p>
                  {o.detail && <p className="mt-0.5 text-[11px] font-medium text-neutral-500">{o.detail}</p>}

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-bold text-neutral-400">
                    {/* Two separate facts, deliberately not collapsed into one
                        line: who was TOLD, and who is actually ON it. A job
                        four people acknowledged and nobody started is the
                        failure this page exists to make visible. */}
                    <span className="flex items-center gap-1">
                      <Users size={11} /> {assignedLabel(o, techs)}
                    </span>
                    {o.assigned_to && o.assigned_to.length > 0 && (() => {
                      // Only current recipients count. A redirected job keeps
                      // the old acknowledgement rows as history, and counting
                      // them would report the job as answered on the strength
                      // of a confirmation from somebody no longer being asked.
                      const answered = o.acked_by.filter(id => o.assigned_to!.includes(id)).length;
                      return (
                        <span className={`flex items-center gap-1 ${answered === 0 ? "text-warn-600" : ""}`}>
                          <BellRing size={11} />
                          {answered} of {o.assigned_to.length} acknowledged
                        </span>
                      );
                    })()}
                    <span className={`flex items-center gap-1 ${
                      o.assignee_name ? "text-neutral-500" : "text-neutral-300"}`}>
                      <User size={11} />
                      {o.assignee_name ? `${o.assignee_name} is on it` : "Not started"}
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
                      <p className="mt-0.5 text-[11px] font-semibold text-neutral-700">{o.resolution_note}</p>
                    </div>
                  )}

                  {/* Who confirmed the work, and the mark they made. */}
                  {o.signature_image && (
                    <div className="mt-2 flex items-end gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2">
                      <img
                        src={o.signature_image}
                        alt="Closing signature"
                        className="max-h-10 w-auto max-w-[9rem] object-contain"
                      />
                      <div className="min-w-0 border-t border-neutral-300 pt-1">
                        <p className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
                          Closed by
                        </p>
                        <p className="truncate text-[10px] font-black text-neutral-700">
                          {o.signed_name ?? "Administrator"}
                        </p>
                        {o.signed_at && (
                          <p className="font-mono text-[9px] text-neutral-400">
                            {new Date(o.signed_at).toLocaleString(undefined, {
                              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Redirecting is the only correction there is: a technician
                    cannot decline, so a job pointed at the wrong person stays
                    pointed there until somebody moves it. Offered while the
                    job has not been started — retargeting after that strands
                    a person mid-task, and Reject is the honest route. */}
                {["OPEN", "ACKNOWLEDGED"].includes(o.state) && !o.assignee_id && (
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      onClick={() => {
                        setRedirect(redirect?.id === o.id ? null : o);
                        setRedirectTo(o.assigned_to ?? []);
                      }}
                      className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-neutral-500 transition-colors hover:text-neutral-800">
                      <Users size={13} /> Reassign
                    </button>
                  </div>
                )}

                {o.state === "RESOLVED" && (
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      onClick={() => setClosing(o)}
                      disabled={!!signingBlocked}
                      title={signingBlocked ?? undefined}
                      className="flex items-center gap-1.5 rounded-xl bg-ok-500 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:bg-ok-600 disabled:bg-neutral-200 disabled:text-neutral-400">
                      <CheckCircle2 size={13} /> Close
                    </button>
                    <button
                      onClick={async () => { await cancel(o.id, "Reopened by admin: work not accepted."); say("Sent back"); }}
                      className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-neutral-500 transition-colors hover:text-neutral-800">
                      <X size={13} /> Reject
                    </button>
                  </div>
                )}
              </div>

              {redirect?.id === o.id && (
                <div className="mt-3 border-t border-neutral-100 pt-3">
                  <FMultiSelect
                    label="Reassign to"
                    value={redirectTo}
                    onChange={setRedirectTo}
                    placeholder="Pick technicians..."
                    options={techs.map(x => ({
                      value: x.id,
                      label: x.full_name,
                      hint: x.on_shift ? "On shift" : undefined
                    }))}
                  />
                  {/* No "everyone on shift" here, and no empty selection: this
                      is a correction to a specific mistake, not a fresh
                      dispatch decision. */}
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button onClick={() => setRedirect(null)}
                      className="rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider text-neutral-400 hover:text-neutral-700">
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await reassign(o.id, redirectTo);
                          setRedirect(null);
                          say(`Reassigned to ${redirectTo.length} ${redirectTo.length === 1 ? "person" : "people"}`);
                        } catch (e: any) {
                          say(e?.message ?? "Could not reassign the job");
                        }
                      }}
                      disabled={redirectTo.length === 0}
                      className="rounded-xl bg-neutral-900 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:bg-neutral-700 disabled:bg-neutral-200 disabled:text-neutral-400">
                      Save
                    </button>
                  </div>
                </div>
              )}
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
              ? "The database does not recognise the signature columns — either 20260829_countersignatures.sql has not been applied, or PostgREST is serving a stale schema cache."
              : e?.message ?? "Could not close the job");
          }
        }}
      />
    </div>
  );
}
