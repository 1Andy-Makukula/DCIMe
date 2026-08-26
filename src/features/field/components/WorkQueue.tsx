import { useState } from "react";
import {
  AlertTriangle, Loader2, RefreshCw, CheckCircle2, Clock,
  Hand, PlayCircle, Inbox, ChevronDown
} from "lucide-react";
import { toast } from "sonner";
import { useWorkQueue, type WorkItem } from "@/features/field/hooks/useWorkQueue";
import { useAuth } from "@/shared/context/AuthContext";

// ─────────────────────────────────────────────────────────────────────────────
// The technician's job list.
//
// Built for a phone held in one hand in a plant room: large tap targets, one
// job per card, and the next action always a single visible button. A
// technician should never have to work out what to do with a job — the card
// tells them.
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY: Record<string, { chip: string; bar: string }> = {
  P1: { chip: "bg-danger-50 text-danger-700 border-danger-200",        bar: "bg-danger-500" },
  P2: { chip: "bg-warn-50 text-warn-700 border-warn-200", bar: "bg-warn-500" },
  P3: { chip: "bg-warn-50 text-warn-700 border-warn-200",  bar: "bg-warn-400" },
  P4: { chip: "bg-neutral-50 text-neutral-600 border-neutral-200",  bar: "bg-neutral-300" }
};

/** Overdue reads as elapsed time, not a timestamp — "4h overdue" needs no arithmetic. */
function dueLabel(item: WorkItem): { text: string; cls: string } {
  if (item.is_breached) {
    const h = Math.round(Math.abs(item.overdue_minutes) / 60);
    return { text: h >= 1 ? `${h}h overdue` : `${Math.round(Math.abs(item.overdue_minutes))}m overdue`,
             cls: "text-danger-600 font-bold" };
  }
  if (!item.resolve_by) return { text: "No target", cls: "text-neutral-400" };
  const mins = Math.round((new Date(item.resolve_by).getTime() - Date.now()) / 60000);
  if (mins < 60) return { text: `Due in ${mins}m`, cls: "text-warn-600 font-bold" };
  const h = Math.round(mins / 60);
  return { text: h < 24 ? `Due in ${h}h` : `Due in ${Math.round(h / 24)}d`, cls: "text-neutral-500" };
}

function JobCard({
  item, myId, onAcknowledge, onStart, onResolve
}: {
  item: WorkItem;
  myId: string | null;
  onAcknowledge: () => void;
  onStart: () => void;
  onResolve: (note: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const sev = SEVERITY[item.severity] ?? SEVERITY.P4;
  const due = dueLabel(item);

  const iOwn      = myId !== null && item.assignee_id === myId;
  const taken     = item.assignee_id !== null && !iOwn;
  // A null assigned_to predates directed assignment and still reads site-wide.
  const forMe     = myId !== null &&
                    (item.assigned_to === null || item.assigned_to.includes(myId));
  // Only worth showing when the job went to more than one person — "1 of 1"
  // is noise on a card built to be read at arm's length.
  const showAcks  = item.assigned_count > 1;

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="flex">
        {/* Severity reads as a colour before anything is parsed. */}
        <div className={`w-1.5 shrink-0 ${sev.bar}`} aria-hidden="true" />
        <div className="min-w-0 flex-1 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-bold leading-snug text-neutral-900">{item.title}</p>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${sev.chip}`}>
              {item.severity}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className={due.cls}>
              <Clock size={11} className="mr-1 inline align-[-1px]" />{due.text}
            </span>
            {/* Who is ON it, which is not the same as who was told. Nobody
                started yet is the state that invites you to. */}
            {item.assignee_name
              ? <span className="text-neutral-500">
                  {iOwn ? "You are on it" : `${item.assignee_name} is on it`}
                </span>
              : <span className="font-semibold text-info-600">Nobody started yet</span>}
            {showAcks && (
              <span className="text-neutral-400">
                {item.ack_count} of {item.assigned_count} acknowledged
              </span>
            )}
            {item.origin === "SYSTEM" && (
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-neutral-500">
                Auto
              </span>
            )}
          </div>

          {item.detail && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-neutral-500"
              aria-expanded={expanded}
            >
              <ChevronDown size={12} className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
              {expanded ? "Less" : "Why this was raised"}
            </button>
          )}
          {expanded && item.detail && (
            <p className="mt-1.5 rounded-lg bg-neutral-50 p-2.5 text-[11px] leading-relaxed text-neutral-600">
              {item.detail}
            </p>
          )}

          {/* One visible next action, never a menu of them.
              Ordered by what is true of the job rather than by state alone,
              because the same state means different things depending on
              whether this technician was told to do it and whether somebody
              else got there first. */}
          <div className="mt-3">
            {iOwn && item.state === "IN_PROGRESS" ? (
              <div className="space-y-2">
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="What did you do?"
                  rows={2}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 text-[12px] placeholder-neutral-400 focus:border-neutral-400 focus:outline-none"
                />
                <button
                  onClick={() => onResolve(note)}
                  disabled={!note.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-ok-600 py-2.5 text-[12px] font-bold text-white disabled:bg-neutral-200 disabled:text-neutral-400 active:scale-[0.98]"
                >
                  <CheckCircle2 size={14} /> Mark complete
                </button>
              </div>
            ) : taken ? (
              // Somebody else owns it. No button at all: a second person
              // arriving at the same plant room is the waste this prevents.
              <p className="rounded-xl bg-neutral-50 py-2.5 text-center text-[11px] font-semibold text-neutral-500">
                {item.assignee_name} is handling this
              </p>
            ) : !forMe ? (
              // Visible for awareness, but not this technician's instruction.
              <p className="rounded-xl bg-neutral-50 py-2.5 text-center text-[11px] font-semibold text-neutral-400">
                Assigned to someone else
              </p>
            ) : !item.i_acknowledged ? (
              <button onClick={onAcknowledge}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-2.5 text-[12px] font-bold text-white active:scale-[0.98]">
                <Hand size={14} /> Acknowledge — assigned to you
              </button>
            ) : (
              <button onClick={onStart}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-info-600 py-2.5 text-[12px] font-bold text-white active:scale-[0.98]">
                <PlayCircle size={14} /> Start work
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkQueue() {
  const {
    items, forMe, working, unanswered, breached,
    isLoading, error, refresh, acknowledge, start, advance
  } = useWorkQueue();
  const { employee } = useAuth();
  const myId = employee?.id ?? null;
  const [tab, setTab] = useState<"all" | "forMe" | "working">("all");

  const act = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); toast.success(ok); }
    catch (e: any) { toast.error(e?.message ?? "That did not work"); }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[20rem] items-center justify-center text-neutral-400">
        <Loader2 size={18} className="mr-2 animate-spin" />
        <span className="text-[12px] font-bold uppercase tracking-wider">Loading jobs…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[20rem] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={22} className="text-danger-500" />
        <p className="text-[13px] font-bold text-neutral-800">Could not load your jobs</p>
        <p className="max-w-xs text-[12px] text-neutral-500">{error}</p>
        <button onClick={refresh}
          className="mt-1 flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-600">
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  const shown = tab === "forMe" ? forMe : tab === "working" ? working : items;

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-black text-neutral-900">Jobs</h1>
          <p className="text-[11px] text-neutral-500">
            {items.length} open
            {breached > 0 && <span className="font-bold text-danger-600"> · {breached} overdue</span>}
          </p>
        </div>
        <button onClick={refresh} aria-label="Refresh"
          className="rounded-lg border border-neutral-200 p-2 text-neutral-500 active:scale-95">
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="flex gap-1 rounded-xl bg-neutral-100 p-1">
        {([
          ["all",     `All (${items.length})`],
          ["forMe",   `For me (${forMe.length})`],
          ["working", `Working (${working.length})`]
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`relative flex-1 rounded-lg py-2 text-[12px] font-bold transition-colors ${
              tab === k ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}>
            {label}
            {/* An unanswered instruction is the one thing a technician must
                not miss — not merely unstarted work, which may be somebody
                else's to start. */}
            {k === "forMe" && unanswered > 0 && tab !== k && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand-500" />
            )}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="flex min-h-[16rem] flex-col items-center justify-center gap-2 text-center">
          <Inbox size={26} className="text-neutral-300" />
          <p className="text-[13px] font-bold text-neutral-700">
            {tab === "working"  ? "You have not started anything"
             : tab === "forMe"  ? "Nothing assigned to you"
             : "No open jobs"}
          </p>
          <p className="max-w-[15rem] text-[11px] text-neutral-400">
            {tab === "working" && forMe.length > 0
              ? `${forMe.length} job${forMe.length === 1 ? "" : "s"} assigned to you — start one when you are ready.`
              : "Jobs appear here when a reading goes out of range or someone raises one."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.map(item => (
            <JobCard
              key={item.id}
              item={item}
              myId={myId}
              onAcknowledge={() => act(() => acknowledge(item.id), "Acknowledged")}
              // start_work_item(), not a state update: it takes ownership and
              // records the receipt in one transaction, so two technicians
              // tapping at once cannot both end up owning the job.
              onStart={()       => act(() => start(item.id), "Started — it's yours")}
              onResolve={n      => act(() => advance(item.id, "RESOLVED", n), "Job complete")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
