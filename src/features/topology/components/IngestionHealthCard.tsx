import { useState, useEffect, useCallback } from "react";
import { Activity, Check, Loader2, RadioTower, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";

// ─────────────────────────────────────────────────────────────────────────────
// Whether readings are still arriving, and how long is too long.
//
// V1 could not tell the difference between a healthy site and a silent one: if
// telemetry stopped entirely, the screens simply kept showing yesterday's
// numbers and nothing complained. Silence looked exactly like stability.
//
// The interval is per site because sites genuinely differ — one logging hourly
// and one logging every four hours are both healthy, and a single global
// threshold would either nag the first or ignore the second.
// ─────────────────────────────────────────────────────────────────────────────

type Health = "HEALTHY" | "LATE" | "SILENT" | "NO_DATA";

interface HealthRow {
  site_uuid:                 string;
  expected_interval_minutes: number;
  ingestion_grace_minutes:   number;
  last_reading_at:           string | null;
  minutes_since:             number | null;
  health:                    Health;
}

const STATE: Record<Health, { label: string; cls: string; note: string }> = {
  HEALTHY:  { label: "Receiving",  cls: "bg-ok-50 text-ok-700 border-ok-200",
              note: "Readings are arriving on schedule." },
  LATE:     { label: "Late",       cls: "bg-warn-50 text-warn-700 border-warn-200",
              note: "Overdue, but not yet long enough to raise an alarm." },
  SILENT:   { label: "Silent",     cls: "bg-danger-50 text-danger-700 border-danger-200",
              note: "Nothing has arrived for some time. A job has been raised." },
  NO_DATA:  { label: "No data",    cls: "bg-slate-100 text-slate-600 border-slate-300",
              note: "This site has never logged a reading." }
};

/** database.types.ts predates these columns — see useWorkQueue for the rationale. */
type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

export function IngestionHealthCard() {
  const { currentSite } = useCurrentSite();
  const [row, setRow]       = useState<HealthRow | null>(null);
  const [isLoading, setLoad]= useState(true);
  const [editing, setEdit]  = useState(false);
  const [busy, setBusy]     = useState(false);
  const [interval, setInterval_] = useState("60");
  const [grace, setGrace]        = useState("30");

  const siteId = currentSite?.id ?? null;

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoad(true);
    const { data } = await from("site_ingestion_health").select("*").eq("site_uuid", siteId).maybeSingle();
    const h = (data as HealthRow | null) ?? null;
    setRow(h);
    if (h) {
      setInterval_(String(h.expected_interval_minutes));
      setGrace(String(h.ingestion_grace_minutes));
    }
    setLoad(false);
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!siteId) return;
    const iv = Number(interval), gr = Number(grace);
    if (!Number.isFinite(iv) || iv < 1)  { toast.error("Interval must be at least 1 minute"); return; }
    if (!Number.isFinite(gr) || gr < 0)  { toast.error("Grace cannot be negative"); return; }

    setBusy(true);
    try {
      const { error } = await from("sites")
        .update({ expected_interval_minutes: iv, ingestion_grace_minutes: gr })
        .eq("id", siteId);
      if (error) throw new Error(error.message);
      toast.success("Saved");
      setEdit(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-3xl border border-gray-100 bg-white p-6 text-gray-400">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-[11px] font-bold uppercase tracking-wider">Checking data flow…</span>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="flex items-start gap-2 rounded-3xl border border-gray-100 bg-white p-5">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn-500" />
        <p className="text-[11px] text-gray-500">
          Data-flow monitoring is not set up for this site yet.
        </p>
      </div>
    );
  }

  const st = STATE[row.health] ?? STATE.NO_DATA;
  const since = row.minutes_since === null
    ? "never"
    : row.minutes_since < 90
      ? `${Math.round(row.minutes_since)} min ago`
      : row.minutes_since < 2880
        ? `${(row.minutes_since / 60).toFixed(1)} h ago`
        : `${(row.minutes_since / 1440).toFixed(1)} d ago`;

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <RadioTower size={18} className="mt-0.5 text-gray-400" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Data flow
            </p>
            <p className="mt-0.5 text-[14px] font-black leading-none text-gray-900">
              Last reading {since}
            </p>
            <p className="mt-1 text-[11px] text-gray-500">{st.note}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider ${st.cls}`}>
          {st.label}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        {!editing ? (
          <>
            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
              Expected every {row.expected_interval_minutes} min
              {" · "}alarm after {row.expected_interval_minutes + row.ingestion_grace_minutes} min
            </p>
            <button onClick={() => setEdit(true)}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-50">
              Change
            </button>
          </>
        ) : (
          <div className="flex w-full flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-wider text-gray-400">Every (min)</span>
              <input value={interval} onChange={e => setInterval_(e.target.value)} inputMode="numeric"
                className="w-24 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] tabular-nums focus:border-gray-400 focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-wider text-gray-400">Grace (min)</span>
              <input value={grace} onChange={e => setGrace(e.target.value)} inputMode="numeric"
                className="w-24 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] tabular-nums focus:border-gray-400 focus:outline-none" />
            </label>
            <button onClick={save} disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-[11px] font-bold text-white disabled:bg-gray-300">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
            </button>
            <button onClick={() => setEdit(false)}
              className="px-2 py-2 text-[11px] font-bold text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Grace exists so a technician five minutes late does not raise an alarm.
          Saying so stops it being tuned to zero by someone assuming it is slack. */}
      {editing && (
        <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-gray-400">
          <Activity size={11} className="mt-0.5 shrink-0" />
          Grace absorbs normal lateness — a round logged a few minutes behind
          schedule should not raise a job.
        </p>
      )}
    </div>
  );
}
