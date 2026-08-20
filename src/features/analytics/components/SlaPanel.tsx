import { AlertTriangle, Loader2, RefreshCw, Clock, UserX, ShieldCheck, Inbox } from "lucide-react";
import { useSlaPerformance, type SlaBreach } from "@/features/analytics/hooks/useSlaPerformance";

// ─────────────────────────────────────────────────────────────────────────────
// Service performance, for management.
//
// The design rule: never report a count without what is behind it. "3 breaches"
// makes a manager feel something; three named jobs with owners and ages let
// them do something.
// ─────────────────────────────────────────────────────────────────────────────

/** Minutes rendered at a human scale — 6.7 min, 4.2 h, 3.1 d. */
function duration(mins: number | null): string {
  if (mins === null || Number.isNaN(mins)) return "—";
  if (mins < 90)   return `${Math.round(mins)} min`;
  if (mins < 2880) return `${(mins / 60).toFixed(1)} h`;
  return `${(mins / 1440).toFixed(1)} d`;
}

function Stat({ label, value, tone = "plain", hint }: {
  label: string; value: string; tone?: "plain" | "warn" | "bad" | "good"; hint?: string;
}) {
  const cls = {
    plain: "text-gray-900", good: "text-ok-600",
    warn:  "text-warn-600", bad:  "text-danger-600"
  }[tone];
  return (
    <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4">
      <p className="font-mono text-[10px] uppercase leading-snug tracking-[0.12em] text-gray-400">
        {label}
      </p>
      <p className={`mt-1 whitespace-nowrap text-[22px] font-black tabular-nums leading-none ${cls}`}>
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[10px] leading-snug text-gray-400">{hint}</p>}
    </div>
  );
}

function BreachRow({ b }: { b: SlaBreach }) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[12px] font-bold leading-snug text-gray-900">{b.out_title}</p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-gray-400">
          {b.out_severity} · {b.out_kind} · {b.out_origin.toLowerCase()}
          {b.out_assignee === "Unassigned"
            ? <span className="ml-1 font-bold text-danger-600">· unassigned</span>
            : <span className="ml-1">· {b.out_assignee}</span>}
        </p>
      </div>
      <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-danger-600">
        {b.out_overdue_hours < 24
          ? `${b.out_overdue_hours.toFixed(1)}h`
          : `${(b.out_overdue_hours / 24).toFixed(1)}d`} over
      </span>
    </li>
  );
}

export function SlaPanel() {
  const { performance: p, breaches, isLoading, error, refresh } = useSlaPerformance();

  if (isLoading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center text-gray-400">
        <Loader2 size={18} className="mr-2 animate-spin" />
        <span className="text-[12px] font-bold uppercase tracking-wider">Loading service performance…</span>
      </div>
    );
  }

  if (error || !p) {
    return (
      <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={22} className="text-danger-500" />
        <p className="text-[13px] font-bold text-gray-800">Could not load service performance</p>
        {error && <p className="max-w-md text-[12px] text-gray-500">{error}</p>}
        <button onClick={refresh}
          className="mt-1 flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-600">
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  const sev = p.by_severity ?? {};
  const critical = (sev.P1 ?? 0) + (sev.P2 ?? 0);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-black uppercase tracking-wider text-gray-900">
            Service Performance
          </h2>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">
            Last 30 days · {p.resolved_in_window} resolved
          </p>
        </div>
        <button onClick={refresh}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-600 hover:bg-gray-50">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Open work" value={String(p.open_total)}
          tone={critical > 0 ? "warn" : "plain"}
          hint={critical > 0 ? `${critical} at P1 or P2` : "Nothing critical outstanding"}
        />
        <Stat
          label="Breaching now" value={String(p.breached_now)}
          tone={p.breached_now > 0 ? "bad" : "good"}
          hint={p.breached_now > 0 ? "Past the agreed resolution target" : "All work inside target"}
        />
        {/* Unacknowledged is the number that says whether anyone is watching
            the queue at all — worse than late, because nobody has looked. */}
        <Stat
          label="Unacknowledged" value={String(p.unacknowledged)}
          tone={p.unacknowledged > 0 ? "warn" : "good"}
          hint={p.unassigned > 0 ? `${p.unassigned} with no owner` : "Everything has an owner"}
        />
        <Stat
          label="On-time rate"
          value={p.compliance_pct === null ? "—" : `${p.compliance_pct}%`}
          tone={p.compliance_pct === null ? "plain" : p.compliance_pct >= 90 ? "good" : "warn"}
          hint={`${p.met_target} of ${p.resolved_in_window} met target`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">
            <Clock size={11} /> Time to acknowledge
          </p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-gray-900">{duration(p.mtta_minutes)}</p>
          <p className="mt-1 text-[10px] text-gray-400">How long before someone picks work up</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">
            <ShieldCheck size={11} /> Time to resolve
          </p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-gray-900">{duration(p.mttr_minutes)}</p>
          <p className="mt-1 text-[10px] text-gray-400">How long from raised to fixed</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">
            <UserX size={11} /> Engineer hours
          </p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-gray-900">{p.engineer_hours}</p>
          {/* Deliberately not a currency figure — see the hook. */}
          <p className="mt-1 text-[10px] text-gray-400">Apply your own labour rate for cost</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-[12px] font-black uppercase tracking-wider text-gray-900">
            Past target
          </h3>
          <p className="mt-0.5 text-[10px] text-gray-400">
            Worst first. A count tells you there is a problem; this tells you which one.
          </p>
        </div>
        {breaches.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-8 text-center">
            <Inbox size={22} className="text-gray-300" />
            <p className="text-[12px] font-bold text-gray-600">Nothing past target</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {breaches.slice(0, 8).map(b => <BreachRow key={b.out_id} b={b} />)}
          </ul>
        )}
      </div>
    </section>
  );
}
