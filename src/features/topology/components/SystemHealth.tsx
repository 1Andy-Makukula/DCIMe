import { useEffect, useState, useCallback } from "react";
import { Activity, RefreshCw, CheckCircle2, XCircle, PauseCircle, Network } from "lucide-react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { StatTable } from "@/shared/ui";

// ─────────────────────────────────────────────────────────────────────────────
// Is the machinery itself running?
//
// WHY THIS SCREEN EXISTS
// Three diagnostic views were already in the database and nothing displayed
// them. During the architecture audit, dcime_ingestion_health turned out to
// have been failing every fifteen minutes — through 19, 20, 21 and 22 August,
// then again on the 26th. Several hundred failed runs. Nobody could have
// known: scheduled_job_status has held the answer the whole time, unread.
//
// A monitoring system whose own monitors fail silently is worse than none,
// because it produces confidence rather than information.
//
// The topology checks are usually empty, and that is the point — an empty
// result here is the HEALTHY reading, so it says so in words rather than
// showing a bare "no rows" that reads like something failed to load.
// ─────────────────────────────────────────────────────────────────────────────

interface JobRow {
  jobname: string;
  schedule: string;
  active: boolean;
  last_status: string | null;
  last_run: string | null;
  return_message: string | null;
}

interface TopologyIssue {
  site_uuid: string;
  equipment_id: string;
  issue: string;
  detail: string | null;
}

type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

/** What the schedule means, for people who do not read crontab. */
function humanSchedule(cron: string): string {
  const map: Record<string, string> = {
    "*/15 * * * *": "every 15 minutes",
    "10 * * * *": "hourly, at ten past",
    "0 6 * * *": "daily at 06:00"
  };
  return map[cron] ?? cron;
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = (Date.now() - new Date(iso).getTime()) / 60000;
  if (mins < 90) return `${Math.round(mins)} min ago`;
  if (mins < 2880) return `${(mins / 60).toFixed(1)} h ago`;
  return `${(mins / 1440).toFixed(1)} d ago`;
}

export function SystemHealth() {
  const { currentSite } = useCurrentSite();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [graph, setGraph] = useState<TopologyIssue[]>([]);
  const [layout, setLayout] = useState<TopologyIssue[]>([]);
  const [isLoading, setLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoad(true);
    setError(null);
    try {
      const [j, g, l] = await Promise.all([
        from("scheduled_job_status").select("*"),
        from("topology_graph_issues").select("*"),
        from("topology_layout_issues").select("*")
      ]);
      if (j.error) throw new Error(j.error.message);
      setJobs((j.data as JobRow[]) ?? []);
      // The topology views are site-scoped; the job view is not, because cron
      // runs for the whole database rather than for one facility.
      const mine = (rows: TopologyIssue[] | null) =>
        (rows ?? []).filter((r) => !currentSite?.id || r.site_uuid === currentSite.id);
      setGraph(mine(g.data as TopologyIssue[] | null));
      setLayout(mine(l.data as TopologyIssue[] | null));
    } catch (e: any) {
      setError(e?.message ?? "Could not read system health");
    } finally {
      setLoad(false);
    }
  }, [currentSite?.id]);

  useEffect(() => { load(); }, [load]);

  const failing = jobs.filter((j) => j.last_status === "failed");
  const paused = jobs.filter((j) => !j.active);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Activity size={20} className="mt-0.5 text-neutral-400" />
          <div>
            <h1 className="text-[17px] font-black leading-tight text-neutral-900">System health</h1>
            <p className="mt-0.5 text-[12px] text-neutral-500">
              Whether the scheduled jobs and the topology model are themselves in order.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-neutral-200 px-3 text-[11px] font-black uppercase tracking-wider text-neutral-600 hover:bg-neutral-50"
        >
          <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} /> Refresh
        </button>
      </header>

      {error && (
        <div className="rounded-2xl border border-danger-200 bg-danger-50 p-4 text-[12px] font-bold text-danger-700">
          {error}
        </div>
      )}

      {!isLoading && !error && (
        <div
          className={`flex items-start gap-3 rounded-2xl border p-4 text-[12px] font-semibold ${
            failing.length
              ? "border-danger-200 bg-danger-50 text-danger-800"
              : "border-ok-200 bg-ok-50 text-ok-800"
          }`}
        >
          {failing.length ? (
            <XCircle size={16} className="mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          )}
          <span>
            {failing.length
              ? `${failing.length} scheduled ${failing.length === 1 ? "job is" : "jobs are"} failing. Until that is fixed, whatever ${failing.length === 1 ? "it does" : "they do"} is not happening.`
              : `All ${jobs.length} scheduled jobs ran successfully.`}
            {paused.length > 0 && ` ${paused.length} paused.`}
          </span>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
          Scheduled jobs
        </h2>
        <StatTable
          rows={jobs}
          rowKey={(j) => j.jobname}
          rowTone={(j) => (j.last_status === "failed" ? "breach" : !j.active ? "warn" : "none")}
          emptyMessage="No scheduled jobs are registered."
          columns={[
            {
              key: "name",
              header: "Job",
              render: (j) => (
                <span className="font-mono text-[11px] font-bold text-neutral-900">{j.jobname}</span>
              )
            },
            {
              key: "sched",
              header: "Runs",
              render: (j) => <span className="text-neutral-600">{humanSchedule(j.schedule)}</span>
            },
            {
              key: "last",
              header: "Last run",
              numeric: true,
              render: (j) => <span className="text-neutral-600">{ago(j.last_run)}</span>
            },
            {
              key: "state",
              header: "Result",
              render: (j) =>
                !j.active ? (
                  <span className="flex items-center gap-1 font-bold text-warn-700">
                    <PauseCircle size={12} /> Paused
                  </span>
                ) : j.last_status === "failed" ? (
                  <span className="flex items-center gap-1 font-black text-danger-700">
                    <XCircle size={12} /> Failed
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-bold text-ok-700">
                    <CheckCircle2 size={12} /> Succeeded
                  </span>
                )
            },
            {
              key: "msg",
              header: "Message",
              // Truncated on screen, complete in the tooltip: a Postgres error
              // is the whole diagnosis and must not be lost, but it is also 300
              // characters and would wreck the row.
              render: (j) =>
                j.last_status === "failed" && j.return_message ? (
                  <span
                    title={j.return_message}
                    className="block max-w-md truncate font-mono text-[10px] text-danger-700"
                  >
                    {j.return_message}
                  </span>
                ) : (
                  <span className="text-neutral-300">—</span>
                )
            }
          ]}
        />
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-400">
          <Network size={12} /> Topology model
        </h2>
        {graph.length === 0 && layout.length === 0 ? (
          <div className="rounded-xl border border-ok-100 bg-ok-50/50 px-4 py-3 text-[12px] font-semibold text-ok-800">
            No problems found. Every asset is connected and placed.
          </div>
        ) : (
          <StatTable
            rows={[
              ...graph.map((g) => ({ ...g, kind: "Graph" })),
              ...layout.map((l) => ({ ...l, kind: "Layout" }))
            ]}
            rowKey={(r: any) => `${r.kind}:${r.equipment_id}:${r.issue}`}
            rowTone={() => "warn"}
            columns={[
              {
                key: "kind",
                header: "Check",
                width: "90px",
                render: (r: any) => <span className="font-bold text-neutral-700">{r.kind}</span>
              },
              {
                key: "eq",
                header: "Asset",
                render: (r: any) => (
                  <span className="font-mono text-[11px] text-neutral-900">{r.equipment_id}</span>
                )
              },
              {
                key: "issue",
                header: "Problem",
                render: (r: any) => (
                  <span className="font-semibold text-neutral-800">{r.issue}</span>
                )
              },
              {
                key: "detail",
                header: "Detail",
                render: (r: any) => <span className="text-neutral-500">{r.detail ?? "—"}</span>
              }
            ]}
          />
        )}
      </section>
    </div>
  );
}

export default SystemHealth;
