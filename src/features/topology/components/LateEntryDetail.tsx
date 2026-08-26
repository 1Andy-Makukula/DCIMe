import { useEffect, useState } from "react";
import { X, Printer, Clock, AlertTriangle } from "lucide-react";
import { supabase } from "@/shared/api/supabaseClient";
import { StatTable, Num } from "@/shared/ui";

// ─────────────────────────────────────────────────────────────────────────────
// The register behind "7 of 65 rounds were late".
//
// A count tells you there is a problem. Doing something about it needs the
// rows: which round, which hour it was meant to describe, when it was actually
// typed, how big that gap was, and whose name is on it.
//
// TWO TIMESTAMPS, ALWAYS BOTH
//   Describes   the hour the reading is ABOUT
//   Entered     the moment somebody typed it
// A round logged at 06:05 for 06:00 was observed. The same round logged at
// 22:00 for 06:00 was remembered. The gap between those columns is the finding,
// and showing only one of them hides it entirely.
//
// PROVENANCE IS ON EVERY ROW
// This site currently holds both real submissions and generated demonstration
// ones. Presenting them together as if they were the same evidence would be
// the worst thing this screen could do — somebody would take a conversation to
// a technician about a round that was never walked. Real rows are unmarked;
// generated rows carry a badge and are excluded from the summary by default.
// ─────────────────────────────────────────────────────────────────────────────

interface LateEntry {
  log_id: string;
  target_hour: string;
  submitted_at: string;
  lag_minutes: number;
  tolerance_minutes: number;
  is_late: boolean;
  technician_id: string | null;
  technician_name: string | null;
  shift_session_id: string | null;
  n_readings: number;
  frequency: string | null;
  provenance: string;
}

interface ByTechnician {
  technician_id: string;
  technician_name: string | null;
  n_entries: number;
  n_late: number;
  late_share: number;
  avg_lag_minutes: number | null;
  worst_lag_minutes: number | null;
  last_late_at: string | null;
}

type UntypedRpc = (
  fn: string, args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

/** "1317.3" → "22 h 0 min". Minutes alone stop meaning anything past a day. */
function humanLag(mins: number): string {
  if (mins < 90) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h < 48) return m === 0 ? `${h} h` : `${h} h ${m} min`;
  return `${(h / 24).toFixed(1)} days`;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  });

export function LateEntryDetail({ siteUuid, days = 30, onClose }: {
  siteUuid: string;
  days?: number;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<LateEntry[]>([]);
  const [byTech, setByTech]   = useState<ByTechnician[]>([]);
  const [isLoading, setLoad]  = useState(true);
  const [error, setError]     = useState<string | null>(null);
  // Demonstration rows are hidden by default. Somebody acting on this register
  // should not have to remember which half of it was invented.
  const [includeSynthetic, setIncludeSynthetic] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const from = new Date(Date.now() - days * 86_400_000).toISOString();
    const to   = new Date().toISOString();

    Promise.all([
      rpc("get_late_entries", {
        p_site_uuid: siteUuid, p_from: from, p_to: to, p_late_only: true
      }),
      rpc("get_late_entry_by_technician", {
        p_site_uuid: siteUuid, p_from: from, p_to: to
      })
    ])
      .then(([a, b]) => {
        if (cancelled) return;
        if (a.error) throw new Error(a.error.message);
        if (b.error) throw new Error(b.error.message);
        setEntries((a.data as LateEntry[] | null) ?? []);
        setByTech((b.data as ByTechnician[] | null) ?? []);
        setLoad(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Could not load the entry register");
        setLoad(false);
      });

    return () => { cancelled = true; };
  }, [siteUuid, days]);

  const shown = includeSynthetic
    ? entries
    : entries.filter((e) => e.provenance === "FIELD");

  const synthCount = entries.length - entries.filter((e) => e.provenance === "FIELD").length;
  const worst = shown.length ? Math.max(...shown.map((e) => e.lag_minutes)) : null;
  const tolerance = entries[0]?.tolerance_minutes ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-xs print:static print:bg-white print:p-0"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-5xl rounded-3xl border border-neutral-200 bg-white shadow-xl print:my-0 print:max-w-none print:rounded-none print:border-0 print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 p-5">
          <div className="flex items-start gap-2.5">
            <Clock size={18} className="mt-0.5 shrink-0 text-neutral-400" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                Entry discipline · last {days} days
              </p>
              <h2 className="mt-0.5 text-[15px] font-black leading-tight text-neutral-900">
                Rounds written up after the fact
              </h2>
              {tolerance !== null && (
                <p className="mt-1 text-[11px] text-neutral-500">
                  Counted as late when typed more than{" "}
                  <span className="font-bold text-neutral-700">{tolerance} minutes</span>{" "}
                  after the hour the reading describes.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-neutral-200 px-3 text-[11px] font-black uppercase tracking-wider text-neutral-600 hover:bg-neutral-50"
            >
              <Printer size={13} /> Print
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="space-y-6 p-5">
          {error && (
            <div className="rounded-2xl border border-danger-200 bg-danger-50 p-4 text-[12px] font-bold text-danger-700">
              {error}
            </div>
          )}

          {isLoading ? (
            <p className="py-10 text-center text-[12px] font-bold text-neutral-400">
              Loading the register…
            </p>
          ) : (
            <>
              {/* Demonstration data is called out, never quietly mixed in. */}
              {synthCount > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-info-100 bg-info-50/60 px-4 py-3">
                  <p className="flex items-start gap-2 text-[12px] font-medium text-info-900">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-info-600" />
                    <span>
                      <strong className="font-black">{synthCount}</strong> of these late
                      entries are generated demonstration data, not real rounds. They are
                      hidden by default so nobody takes a conversation to a technician
                      about a round that was never walked.
                    </span>
                  </p>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[11px] font-bold text-info-800 print:hidden">
                    <input
                      type="checkbox"
                      checked={includeSynthetic}
                      onChange={(e) => setIncludeSynthetic(e.target.checked)}
                      className="h-3.5 w-3.5 accent-current"
                    />
                    Include them
                  </label>
                </div>
              )}

              {/* ── Headline ─────────────────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Figure label="Late rounds" value={shown.length.toString()} />
                <Figure
                  label="Worst gap"
                  value={worst !== null ? humanLag(worst) : "—"}
                />
                <Figure
                  label="Technicians involved"
                  value={String(new Set(shown.map((e) => e.technician_name).filter(Boolean)).size)}
                />
              </div>

              {/* ── Per technician ───────────────────────────────────────── */}
              <section className="space-y-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  By technician
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Ordered by the share of their own rounds that were late, not the raw
                  count — whoever is rostered most would otherwise always look worst.
                </p>
                <StatTable
                  rows={byTech.filter((t) => t.n_late > 0)}
                  rowKey={(t) => t.technician_id}
                  rowTone={(t) => t.late_share >= 0.3 ? "breach"
                                : t.late_share >= 0.1 ? "warn" : "none"}
                  emptyMessage="No late entries by anybody in this period."
                  columns={[
                    { key: "who", header: "Technician",
                      render: (t) => (
                        <span className="font-bold text-neutral-900">
                          {t.technician_name ?? "Unattributed"}
                        </span>
                      ) },
                    { key: "late", header: "Late", numeric: true,
                      render: (t) => `${t.n_late} of ${t.n_entries}` },
                    { key: "share", header: "Share", numeric: true,
                      render: (t) => `${(t.late_share * 100).toFixed(1)}%` },
                    { key: "avg", header: "Average gap", numeric: true,
                      render: (t) => t.avg_lag_minutes != null
                        ? humanLag(t.avg_lag_minutes) : "—" },
                    { key: "worst", header: "Worst gap", numeric: true,
                      render: (t) => t.worst_lag_minutes != null
                        ? humanLag(t.worst_lag_minutes) : "—" },
                    { key: "last", header: "Most recent",
                      render: (t) => (
                        <span className="font-mono text-[11px] text-neutral-500">
                          {t.last_late_at ? when(t.last_late_at) : "—"}
                        </span>
                      ) }
                  ]}
                />
              </section>

              {/* ── The register ─────────────────────────────────────────── */}
              <section className="space-y-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  Every late round
                </h3>
                <StatTable
                  maxHeight={420}
                  rows={shown}
                  rowKey={(e) => e.log_id}
                  rowTone={(e) => e.lag_minutes >= 480 ? "breach"
                                : e.lag_minutes >= 180 ? "warn" : "none"}
                  emptyMessage="No real late entries in this period."
                  columns={[
                    { key: "who", header: "Technician",
                      render: (e) => (
                        <span className="font-bold text-neutral-900">
                          {e.technician_name ?? "Unattributed"}
                        </span>
                      ) },
                    { key: "describes", header: "Reading describes",
                      render: (e) => (
                        <span className="font-mono text-[11px] text-neutral-600">
                          {when(e.target_hour)}
                        </span>
                      ) },
                    { key: "entered", header: "Actually entered",
                      render: (e) => (
                        <span className="font-mono text-[11px] font-bold text-neutral-800">
                          {when(e.submitted_at)}
                        </span>
                      ) },
                    { key: "gap", header: "Gap", numeric: true, width: "110px",
                      render: (e) => (
                        <span className={e.lag_minutes >= 480 ? "font-black text-danger-700" : ""}>
                          {humanLag(e.lag_minutes)}
                        </span>
                      ) },
                    { key: "n", header: "Readings", numeric: true, width: "90px",
                      render: (e) => <Num value={e.n_readings} decimals={0} /> },
                    { key: "prov", header: "", width: "80px",
                      render: (e) => e.provenance === "FIELD" ? null : (
                        <span className="rounded border border-info-200 bg-info-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-info-700">
                          Demo
                        </span>
                      ) }
                  ]}
                />
                <p className="text-[11px] text-neutral-400">
                  "Readings" is how many measurements rode on that one late submission —
                  a round covering 260 of them matters more than one covering three.
                </p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-100 bg-neutral-50/60 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-1 font-mono text-[20px] font-black leading-none tabular-nums text-neutral-900">
        {value}
      </p>
    </div>
  );
}

export default LateEntryDetail;
