import { useState, useEffect, useCallback } from "react";
import { Activity, Check, Loader2, RadioTower, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { LateEntryDetail } from "./LateEntryDetail";

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

/**
 * EXACTLY the column names site_ingestion_health returns.
 *
 * These were previously invented — `minutes_since` and `health` — and the view
 * returns `minutes_since_reading` and `status`. Because the row is fetched
 * through the untyped client and cast, TypeScript could not see the mismatch:
 * both fields read as undefined, so the status lookup fell through to its
 * NO_DATA default and the card reported "this site has never logged a reading"
 * on EVERY site, forever, while the chart beside it plotted live load. The
 * minutes formatter then divided undefined and printed "NaN d ago".
 *
 * Keep these identical to the view. See 20260818_ingestion_health.sql.
 */
type IngestionStatus = "HEALTHY" | "STALE" | "CRITICAL" | "NEVER_REPORTED" | "PAUSED";

type EntryStatus = "PROMPT" | "SLIPPING" | "RETROSPECTIVE" | "NO_DATA";

interface HealthRow {
  site_uuid:                 string;
  expected_interval_minutes: number;
  ingestion_grace_minutes:   number;
  monitoring_enabled:        boolean;
  last_reading_at:           string | null;
  last_technician:           string | null;
  minutes_since_reading:     number | null;
  status:                    IngestionStatus;
  // ── Whether readings were written down WHEN TAKEN ────────────────────────
  // A second question about the same data, deliberately on the same row and
  // the same card. `status` says the pipe is open; these say whether what came
  // down it was observed or remembered.
  entries_7d:                number;
  late_entries_7d:           number;
  worst_lag_minutes:         number | null;
  avg_lag_minutes:           number | null;
  last_late_at:              string | null;
  last_late_technician:      string | null;
  entry_status:              EntryStatus;
}

const ENTRY_STATE: Record<EntryStatus, { label: string; cls: string; note: string }> = {
  PROMPT:        { label: "Prompt", cls: "text-ok-700",
                   note: "Rounds are being written up as they are taken." },
  SLIPPING:      { label: "Slipping", cls: "text-warn-700",
                   note: "Some rounds are being written up well after the hour they describe." },
  RETROSPECTIVE: { label: "Retrospective", cls: "text-danger-700",
                   note: "Most rounds are logged long after the fact — these are recollections, not observations." },
  NO_DATA:       { label: "—", cls: "text-neutral-400", note: "" }
};

const STATE: Record<IngestionStatus, { label: string; cls: string; note: string }> = {
  HEALTHY:        { label: "Receiving", cls: "bg-ok-50 text-ok-700 border-ok-200",
                    note: "Readings are arriving on schedule." },
  STALE:          { label: "Late",      cls: "bg-warn-50 text-warn-700 border-warn-200",
                    note: "Overdue, but not yet long enough to raise an alarm." },
  CRITICAL:       { label: "Silent",    cls: "bg-danger-50 text-danger-700 border-danger-200",
                    note: "Nothing has arrived for some time. A job has been raised." },
  NEVER_REPORTED: { label: "No data",   cls: "bg-neutral-100 text-neutral-600 border-neutral-300",
                    note: "This site has never logged a reading." },
  PAUSED:         { label: "Paused",    cls: "bg-neutral-100 text-neutral-600 border-neutral-300",
                    note: "Monitoring is switched off for this site, so nothing is being checked." }
};

/** database.types.ts predates these columns — see useWorkQueue for the rationale. */
type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

export function IngestionHealthCard() {
  const { currentSite } = useCurrentSite();
  const [row, setRow]       = useState<HealthRow | null>(null);
  const [isLoading, setLoad]= useState(true);
  const [editing, setEdit]  = useState(false);
  const [showLate, setShowLate] = useState(false);
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
      <div className="flex items-center justify-center gap-2 rounded-3xl border border-neutral-100 bg-white p-6 text-neutral-400">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-[11px] font-bold uppercase tracking-wider">Checking data flow…</span>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="flex items-start gap-2 rounded-3xl border border-neutral-100 bg-white p-5">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn-500" />
        <p className="text-[11px] text-neutral-500">
          Data-flow monitoring is not set up for this site yet.
        </p>
      </div>
    );
  }

  const st = STATE[row.status] ?? STATE.NEVER_REPORTED;

  // Number.isFinite rather than a null check: the field arrives as undefined
  // when the shape is wrong and as null when there is genuinely no reading,
  // and `undefined === null` is false — which is how "NaN d ago" reached the
  // screen. Anything that is not a real number reads as "never".
  const mins = row.minutes_since_reading;
  const since = !Number.isFinite(mins as number)
    ? "never"
    : (mins as number) < 90
      ? `${Math.round(mins as number)} min ago`
      : (mins as number) < 2880
        ? `${((mins as number) / 60).toFixed(1)} h ago`
        : `${((mins as number) / 1440).toFixed(1)} d ago`;

  return (
    <div className="rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <RadioTower size={18} className="mt-0.5 text-neutral-400" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
              Data flow
            </p>
            <p className="mt-0.5 text-[14px] font-black leading-none text-neutral-900">
              {since === "never" ? "No reading yet" : `Last reading ${since}`}
            </p>
            <p className="mt-1 text-[11px] text-neutral-500">{st.note}</p>
            {row.last_technician && (
              <p className="mt-0.5 text-[11px] font-semibold text-neutral-400">
                Logged by {row.last_technician}
              </p>
            )}
          </div>
        </div>
        <span className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider ${st.cls}`}>
          {st.label}
        </span>
      </div>

      {/* ── Written down when taken? ──────────────────────────────────────
          Sits under arrival rather than beside it: you read "is it arriving"
          first, and only then "was it observed or remembered". Shown only when
          there is something to say — a permanent green line saying everything
          is fine is a line people stop seeing. */}
      {row.entry_status !== "NO_DATA" && row.entry_status !== "PROMPT" && (
        <div className="mt-3 border-t border-neutral-100 pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
              Entry discipline
            </p>
            <span className={`text-[11px] font-black uppercase tracking-wider ${ENTRY_STATE[row.entry_status].cls}`}>
              {ENTRY_STATE[row.entry_status].label}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">
            <span className="font-black text-neutral-700">
              {row.late_entries_7d} of {row.entries_7d}
            </span>{" "}
            rounds in the last 7 days were written up more than{" "}
            {row.expected_interval_minutes + row.ingestion_grace_minutes} minutes
            after the hour they describe
            {row.worst_lag_minutes != null && (
              <> — the worst by <span className="font-black text-neutral-700">
                {row.worst_lag_minutes >= 120
                  ? `${(row.worst_lag_minutes / 60).toFixed(1)} hours`
                  : `${Math.round(row.worst_lag_minutes)} minutes`}
              </span></>
            )}.
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {ENTRY_STATE[row.entry_status].note}
          </p>
          {row.last_late_technician && (
            <p className="mt-0.5 text-[11px] font-semibold text-neutral-400">
              Most recent by {row.last_late_technician}
            </p>
          )}
          <button
            type="button"
            onClick={() => setShowLate(true)}
            className="mt-2 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-neutral-600 transition-colors hover:bg-neutral-50 print:hidden"
          >
            More detail
          </button>
        </div>
      )}

      {showLate && siteId && (
        <LateEntryDetail siteUuid={siteId} onClose={() => setShowLate(false)} />
      )}

      <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
        {!editing ? (
          <>
            <p className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
              Expected every {row.expected_interval_minutes} min
              {" · "}alarm after {row.expected_interval_minutes + row.ingestion_grace_minutes} min
            </p>
            <button onClick={() => setEdit(true)}
              className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500 hover:bg-neutral-50">
              Change
            </button>
          </>
        ) : (
          <div className="flex w-full flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-400">Every (min)</span>
              <input value={interval} onChange={e => setInterval_(e.target.value)} inputMode="numeric"
                className="w-24 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[12px] tabular-nums focus:border-neutral-400 focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-400">Grace (min)</span>
              <input value={grace} onChange={e => setGrace(e.target.value)} inputMode="numeric"
                className="w-24 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[12px] tabular-nums focus:border-neutral-400 focus:outline-none" />
            </label>
            <button onClick={save} disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-[11px] font-bold text-white disabled:bg-neutral-300">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
            </button>
            <button onClick={() => setEdit(false)}
              className="px-2 py-2 text-[11px] font-bold text-neutral-400 hover:text-neutral-600">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Grace exists so a technician five minutes late does not raise an alarm.
          Saying so stops it being tuned to zero by someone assuming it is slack. */}
      {editing && (
        <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-neutral-400">
          <Activity size={11} className="mt-0.5 shrink-0" />
          Grace absorbs normal lateness — a round logged a few minutes behind
          schedule should not raise a job.
        </p>
      )}
    </div>
  );
}
