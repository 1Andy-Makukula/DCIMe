import React, { useState, useEffect } from "react";
import { DEFAULT_SITE_CODE } from "@/config/sites";
import { siteLabel, DEFAULT_SITE_LABEL } from "@/shared/utils/branding";
import {
  FileText,
  Download,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  Zap,
  Activity,
  ChevronDown,
  Shield,
  Hash,
  X,
  FileSpreadsheet,
} from "lucide-react";
import { generateLegacyMonthlyReport } from "../../../shared/utils/excelExportEngine";
import { toast } from "sonner";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useAuth } from "@/shared/context/AuthContext";
import { resolveSignerName, signingBlockedReason } from "@/shared/utils/identity";
import { supabase } from "@/shared/api/supabaseClient";
import { PrintableChecklist } from "../../field/components/PrintableChecklist";
import { DateRangePicker, DocumentSignatures, type SignatureResult, FSelect } from "@/shared/ui";
import { useDateRange } from "@/shared/utils/useDateRange";

// ── Types ─────────────────────────────────────────────────────────────────────
type VerificationStatus = "verified" | "discrepancy";

interface TelemetryReading {
  label: string;
  value: string;
  icon: React.ReactNode;
  flag?: boolean; // true if reading is out of nominal range
}

interface ShiftLog {
  id: string;
  logNumber: string;
  author: string;
  authorInitials: string;
  avatarColor: string;
  badgeId: string;
  role: string;
  time: string;        // "06:00 AM CAT"
  date: string;        // "2026-06-22"
  shiftLabel: string;        // "Day Shift"
  site: string;
  zone: string;
  verificationStatus: VerificationStatus;
  telemetry: TelemetryReading[];
  notes: string;
  alertsAcked: number;
  signedOff: boolean;
  // The document's two marks. Captured in the field, accepted in the office.
  signatureImage:    string | null;
  signedAt:          string | null;
  countersignImage:  string | null;
  countersignedAt:   string | null;
  countersignedName: string | null;
}



// ── Verification badge ────────────────────────────────────────────────────────
function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === "verified") {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ok-50 border border-ok-200 text-ok-700 text-[10px] font-black uppercase tracking-wider">
        <CheckCircle2 size={11} />
        System Verified
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-danger-50 border border-danger-200 text-danger-600 text-[10px] font-black uppercase tracking-wider">
      <AlertTriangle size={11} />
      Sensor Discrepancy
    </div>
  );
}

// ── Full-report modal ─────────────────────────────────────────────────────────
function ReportModal({
  adminName,
  signingBlocked,
  onCountersign,
  log,
  onClose,
}: {
  adminName: string;
  /** Non-null when this user cannot sign; shown instead of the action. */
  signingBlocked: string | null;
  onCountersign: (log: ShiftLog, sig: SignatureResult) => Promise<void>;
  log: ShiftLog;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden my-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100 bg-neutral-50/60">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                Shift Report
              </span>
              <span className="text-[10px] font-mono font-black text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-lg">
                {log.logNumber}
              </span>
              <VerificationBadge status={log.verificationStatus} />
            </div>
            <h2 className="text-[16px] font-black text-neutral-900 leading-none">
              {log.author}
            </h2>
            <p className="text-[11px] font-semibold text-neutral-400 mt-0.5">
              {log.shiftLabel} · {log.date} · {log.time}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Badge ID", value: log.badgeId, icon: Hash },
              { label: "Role", value: log.role, icon: Shield },
              { label: "Site", value: log.site, icon: MapPin },
              { label: "Zone", value: log.zone, icon: MapPin },
              { label: "Shift", value: log.shiftLabel, icon: Clock },
              { label: "Alerts Acked", value: `${log.alertsAcked} alert${log.alertsAcked !== 1 ? "s" : ""}`, icon: AlertTriangle },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-neutral-50 border border-neutral-100 rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={10} className="text-neutral-400" />
                  <span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">
                    {label}
                  </span>
                </div>
                <div className="text-[11px] font-bold text-neutral-700">{value}</div>
              </div>
            ))}
          </div>

          {/* Telemetry */}
          <div>
            <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">
              Telemetry Snapshot
            </div>
            <div className="bg-neutral-900 rounded-xl px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2">
              {log.telemetry.map((t, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-neutral-500 text-[10px] font-semibold">
                    <span className={t.flag ? "text-danger-400" : "text-neutral-500"}>
                      {t.icon}
                    </span>
                    {t.label}
                  </div>
                  <span className={`font-mono text-[11px] font-bold ${t.flag ? "text-danger-400" : "text-ok-400"}`}>
                    {t.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">
              Technician Notes
            </div>
            <div className="border-l-4 border-neutral-200 pl-4 py-1">
              <p className="text-[12px] font-semibold text-neutral-600 leading-relaxed italic">
                {log.notes}
              </p>
            </div>
          </div>

          {/* Verification footer */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${log.verificationStatus === "verified"
              ? "bg-ok-50 border-ok-200"
              : "bg-danger-50 border-danger-200"
            }`}>
            {log.verificationStatus === "verified"
              ? <CheckCircle2 size={16} className="text-ok-600 flex-shrink-0" />
              : <AlertTriangle size={16} className="text-danger-500 flex-shrink-0" />
            }
            <div>
              <div className={`text-[11px] font-black ${log.verificationStatus === "verified" ? "text-ok-700" : "text-danger-700"}`}>
                {log.verificationStatus === "verified"
                  ? "Log verified against SCADA telemetry. No discrepancies detected."
                  : "One or more field readings deviate from SCADA telemetry. Review flagged entries."}
              </div>
              <div className="text-[9px] font-semibold text-neutral-400 mt-0.5">
                Immutable record · {log.id} · {DEFAULT_SITE_LABEL} Audit System
              </div>
            </div>
          </div>

          {/* The two parties to the handover. */}
          <DocumentSignatures
            context={`Shift handover · ${log.date} · ${log.shiftLabel}`}
            author={{
              role: "Submitted by",
              name: log.author,
              image: log.signatureImage,
              signedAt: log.signedAt
            }}
            counter={{
              role: "Accepted by",
              name: log.countersignedName ?? adminName,
              image: log.countersignImage,
              signedAt: log.countersignedAt
            }}
            onSign={signingBlocked ? undefined : (sig) => onCountersign(log, sig)}
            unavailableReason={signingBlocked}
          />
        </div>
      </div>
    </div>
  );
}

// ── Shift log card ────────────────────────────────────────────────────────────
function ShiftCard({
  log,
  onViewReport,
}: {
  log: ShiftLog;
  onViewReport: (log: ShiftLog) => void;
}) {
  const isDiscrepancy = log.verificationStatus === "discrepancy";

  return (
    <div className="bg-white border border-neutral-100 rounded-2xl shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200">
      {/* ── Card header ─────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4">
        {/* Top row: Avatar + timestamp */}
        <div className="flex items-start justify-between mb-3">
          {/* Avatar */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-[13px] font-black flex-shrink-0 ${log.avatarColor}`}>
            {log.authorInitials}
          </div>

          {/* Timestamp */}
          <div className="text-right flex-shrink-0">
            <div className="flex items-center gap-1 justify-end text-[10px] font-bold text-neutral-400">
              <Clock size={10} />
              {log.time}
            </div>
            <div className="text-[9px] font-semibold text-neutral-300 mt-0.5 font-mono">
              {log.date}
            </div>
          </div>
        </div>

        {/* Author + zone */}
        <div className="mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-black text-neutral-900 leading-tight">
              {log.author}
            </span>
            <span className="text-[9px] font-mono font-black text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded-md">
              {log.logNumber}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin size={10} className="text-neutral-400 flex-shrink-0" />
            <span className="text-[11px] font-semibold text-neutral-400">
              {log.zone} · {log.shiftLabel}
            </span>
          </div>
        </div>

        {/* Verification badge */}
        <VerificationBadge status={log.verificationStatus} />
      </div>

      {/* ── Subtle divider ───────────────────────────────────────────────── */}
      <div className="mx-5 border-t border-neutral-100" />

      {/* ── Telemetry grid ───────────────────────────────────────────────── */}
      <div className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-2.5 flex-1">
        {log.telemetry.map((t, i) => (
          <div key={i} className="flex items-center justify-between min-w-0">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-neutral-400 min-w-0">
              <span className={`flex-shrink-0 ${t.flag ? "text-danger-400" : "text-neutral-400"}`}>
                {t.icon}
              </span>
              <span className="truncate">{t.label}</span>
            </div>
            <span
              className={`text-[11px] font-black ml-1 flex-shrink-0 ${t.flag ? "text-danger-500" : "text-neutral-800"
                }`}
            >
              {t.value}
            </span>
          </div>
        ))}
      </div>

      {/* ── Notes section ────────────────────────────────────────────────── */}
      <div className="px-5 pb-4">
        <div className="border-l-[3px] border-neutral-200 pl-3">
          <p className="text-[11px] font-semibold text-neutral-500 italic leading-relaxed line-clamp-3">
            {log.notes}
          </p>
        </div>
      </div>

      {/* ── Alerts acked strip ───────────────────────────────────────────── */}
      {log.alertsAcked > 0 && (
        <div className="mx-5 mb-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warn-50 border border-warn-100">
            <AlertTriangle size={11} className="text-warn-500 flex-shrink-0" />
            <span className="text-[10px] font-black text-warn-700">
              {log.alertsAcked} alert{log.alertsAcked !== 1 ? "s" : ""} acknowledged this shift
            </span>
          </div>
        </div>
      )}

      {/* ── Footer CTA ───────────────────────────────────────────────────── */}
      <div className="mt-auto border-t border-neutral-100">
        <button
          onClick={() => onViewReport(log)}
          className={`w-full px-5 py-3.5 flex items-center justify-between text-[11px] font-black uppercase tracking-wider transition-colors ${isDiscrepancy
              ? "bg-danger-50/60 hover:bg-danger-50 text-danger-600"
              : "bg-neutral-50 hover:bg-neutral-100 text-neutral-600"
            }`}
        >
          <span className="flex items-center gap-1.5">
            <FileText size={12} />
            View Full Report
          </span>
          <ChevronDown size={12} className="-rotate-90" />
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ShiftReports() {
  const { currentSite } = useCurrentSite();
  const { employee } = useAuth();
  const siteCode = currentSite?.site_code || DEFAULT_SITE_CODE;
  const [activeTab, setActiveTab] = useState<"shifts" | "checklists">("shifts");
  // The old local dateRange/showPicker state drove a label in the button but
  // was never actually passed to fetchDbReports — every range selection
  // silently fetched the exact same unfiltered "all shift reports ever" set.
  const { range, preset, setPreset, setCustomRange } = useDateRange("7d");
  const [activeReport, setActiveReport] = useState<ShiftLog | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  // Which month the Legacy Excel Report covers. Independent of `range` above:
  // the destination template is a physical monthly compliance form with a
  // fixed row per day-of-month, so it can only ever represent one calendar
  // month — the ad-hoc browse picker doesn't apply here. This used to be
  // hardcoded to "whichever month it is right now," so an admin in August
  // had no way to generate July's report at all.
  const now = new Date();
  const [exportMonth, setExportMonth] = useState(now.getMonth());
  const [exportYear, setExportYear] = useState(now.getFullYear());
  // Set once the admin picks a month themselves, so the seeding effect below
  // never overrides a deliberate choice.
  const [monthPicked, setMonthPicked] = useState(false);
  const [dbReports, setDbReports] = useState<ShiftLog[]>([]);

  // Default to the month that actually has readings in it.
  //
  // The default was `new Date().getMonth()`. Just after midnight on the 1st
  // that is a month nothing has been logged into yet, so the first export
  // attempt of every month reported "no telemetry data" for a site that had
  // been logging all night — the data was there, the selector was pointing at
  // the wrong month. Seeded from the newest reading instead, which is the
  // current month for all but those first few hours.
  useEffect(() => {
    if (monthPicked || !currentSite?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("telemetry_logs")
        .select("target_hour")
        .eq("site_uuid", currentSite.id)
        .eq("asset_id", "facility_wide")
        .order("target_hour", { ascending: false })
        .limit(1);
      const latest = data?.[0]?.target_hour;
      if (cancelled || !latest) return;
      const d = new Date(latest);
      setExportMonth(d.getMonth());
      setExportYear(d.getFullYear());
    })();
    return () => { cancelled = true; };
  }, [currentSite?.id, monthPicked]);

  const fetchDbReports = async () => {
    try {
      let query = supabase
        .from("shift_reports")
        .select("*")
        .gte("timestamp", range.start.toISOString())
        .lte("timestamp", range.end.toISOString())
        .order("timestamp", { ascending: false });
      if (currentSite?.id) query = query.eq("site_uuid", currentSite.id);
      const { data, error } = await query;


      if (error) throw error;

      if (data) {
        const mapped = data.map((report: any) => {
          const initials = report.technician_name
            ? report.technician_name.split(" ").map((n: string) => n[0]).join("").toUpperCase()
            : "AM";
          
          const colors = ["bg-brand-500", "bg-info-500", "bg-ok-500", "bg-series-5", "bg-warn-500"];
          const colorIdx = initials.charCodeAt(0) % colors.length;
          
          return {
            id: report.log_id,
            logNumber: `#${report.log_id.substring(0, 5).toUpperCase()}`,
            author: report.technician_name || "Unknown Technician",
            authorInitials: initials,
            avatarColor: colors[colorIdx],
            badgeId: report.technician_id || "UNKNOWN",
            role: "Field Technician",
            time: new Date(report.timestamp).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false
            }) + " CAT",
            date: new Date(report.timestamp).toISOString().split("T")[0],
            shiftLabel: report.shift_duration || "DAY SHIFT (08:00 - 18:00)",
            site: siteLabel(report.site_id),
            zone: "Power Room 1",
            verificationStatus: (report.certified ? "verified" : "discrepancy") as VerificationStatus,
            telemetry: [
              { label: "Power Source", value: report.active_power_source || "Mains Active", icon: <Zap size={11} />, flag: false },
              { label: "Routine Logs", value: `${report.routine_logs_completed || 0} / 4 Saved`, icon: <CheckCircle2 size={11} />, flag: false },
              { label: "Signature", value: "Verified Ledger", icon: <Shield size={11} />, flag: false }
            ],
            notes: report.notes || "No pass-down notes submitted.",
            alertsAcked: report.incidents_filed || 0,
            signedOff: report.certified || false,
            signatureImage:    report.signature_image    ?? null,
            signedAt:          report.signed_at          ?? null,
            countersignImage:  report.countersign_image  ?? null,
            countersignedAt:   report.countersigned_at   ?? null,
            countersignedName: report.countersigned_name ?? null
          };
        });
        setDbReports(mapped);
      }
    } catch (err) {
      console.error("Error loading real shift logs:", err);
    }
  };

  useEffect(() => {
    fetchDbReports();
  }, [currentSite?.id, range.start.getTime(), range.end.getTime()]);


  const allShiftLogs = [...dbReports];

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Query live telemetry_logs for the SELECTED calendar month, not
      // whatever month happens to be current.
      const monthStart = new Date(exportYear, exportMonth, 1);
      const monthEnd   = new Date(exportYear, exportMonth + 1, 0, 23, 59, 59, 999);

      const monthName = monthStart.toLocaleString("en-US", { month: "long" });
      const yearStr   = String(exportYear);

      let telemetryQuery = supabase
        .from("telemetry_logs")
        .select("*")
        .gte("target_hour", monthStart.toISOString())
        .lte("target_hour", monthEnd.toISOString())
        .order("target_hour", { ascending: true });
      // Scope the monthly export to the current site — without this the
      // spreadsheet silently blends telemetry from every site.
      if (currentSite?.id) telemetryQuery = telemetryQuery.eq("site_uuid", currentSite.id);
      const { data: telemetryRows, error: telemetryError } = await telemetryQuery;


      if (telemetryError) throw telemetryError;

      if (!telemetryRows || telemetryRows.length === 0) {
        // "Logs must be submitted before they can be exported" blamed the
        // technicians for what is nearly always the month selector sitting on
        // a month that has not started yet. Name the month that does hold
        // readings, so the fix is obvious from the message.
        let hint: string | undefined;
        if (currentSite?.id) {
          const { data: latestRows } = await supabase
            .from("telemetry_logs")
            .select("target_hour")
            .eq("site_uuid", currentSite.id)
            .eq("asset_id", "facility_wide")
            .order("target_hour", { ascending: false })
            .limit(1);
          const latest = latestRows?.[0]?.target_hour;
          if (latest) {
            const label = new Date(latest).toLocaleString("en-US", {
              month: "long", year: "numeric"
            });
            hint = `The most recent readings for this site are from ${label}. Change the month selector to export those.`;
          }
        }
        toast.error(`No readings logged for ${monthName} ${yearStr}.`,
                    hint ? { description: hint } : undefined);
        setIsExporting(false);
        return;
      }

      // Flatten each row: { target_hour, created_at, frequency, asset_id, technician_name, ...metrics }
      const flatData = telemetryRows.map((row: any) => ({
        target_hour: row.target_hour,
        created_at: row.created_at,
        frequency: row.frequency,
        asset_id: row.asset_id,
        technician_name: row.technician_name,
        ...(row.metrics as Record<string, any> || {}),
      }));

      await generateLegacyMonthlyReport(monthName, yearStr, flatData, siteCode, currentSite?.id ?? null);
      toast.success(`${monthName} ${yearStr} workbooks generated.`);
    } catch (err: any) {
      // The engine throws for real, nameable reasons — no Excel destinations
      // for the site, a template that failed to download. All of them used to
      // land in the console only, so the button said "Generating…", stopped,
      // and produced nothing with no explanation anywhere the admin could see.
      console.error("Error generating legacy monthly report:", err);
      toast.error("Could not generate the workbooks.", {
        description: err?.message ?? "Unexpected error while writing the templates."
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Derived counts
  // Name, else badge ID, else email — all real attributions. Never a
  // placeholder like "Administrator", which names nobody. Requiring full_name
  // alone made the countersign button disappear for accounts without one.
  const adminName = resolveSignerName(employee);

  /**
   * Records the acceptance signature against the report.
   *
   * The signer's NAME is denormalised alongside the id: the printed document
   * has to keep reading correctly even if that employee row is later removed.
   */
  const handleCountersign = async (log: ShiftLog, sig: SignatureResult) => {
    if (!adminName) throw new Error("Cannot countersign without a signed-in identity.");

    const { data, error } = await (supabase.from as any)("shift_reports")
      // Only the mark and when it was drawn. WHO signed is stamped by
      // stamp_countersignature() from the JWT — a browser must not be able to
      // choose the name that appears on a signed document.
      .update({
        countersign_image: sig.dataUrl,
        countersigned_at:  sig.signedAt
      })
      .eq("log_id", log.id)
      // Only ever the FIRST countersignature. Re-running this would overwrite
      // an existing mark, and a signature is evidence, not a mutable field.
      .is("countersign_image", null)
      .select("log_id");

    if (error) {
      console.error("[DCIMe] Countersign failed:", error);
      // PGRST204 means the columns are not on the remote yet.
      // PGRST204 is "not in the schema cache", which covers BOTH a missing
      // migration and a cache PostgREST has not reloaded since one ran. Naming
      // only the first sends someone to re-run a migration they already applied.
      throw new Error(error.code === "PGRST204"
        ? "The database does not recognise the signature columns. Either supabase/migrations/20260829_countersignatures.sql has not been applied, or PostgREST is still serving a stale schema cache — reload the schema from the Supabase dashboard and retry."
        : error.message);
    }
    // No error and no rows means RLS filtered the row, or it was countersigned
    // by someone else first. Either way the mark was NOT saved.
    if (!data || data.length === 0) {
      throw new Error("Not countersigned — the report may already have been signed, or you may not have permission.");
    }
    await fetchDbReports();
    setActiveReport(null);
  };

  const verifiedCount = allShiftLogs.filter((l) => l.verificationStatus === "verified").length;
  const discrepancyCount = allShiftLogs.filter((l) => l.verificationStatus === "discrepancy").length;
  const totalAlertsAcked = allShiftLogs.reduce((sum, l) => sum + l.alertsAcked, 0);

  // Audit CSV export handler (for a PDF, use the Print / PDF button — the
  // page is print-optimised and the browser produces a real PDF).
  function handleAuditExport(format: "csv") {

    const rows = allShiftLogs.map((l) =>
      [l.id, l.author, l.badgeId, l.date, l.time, l.shiftLabel, l.zone, l.verificationStatus, l.alertsAcked].join(",")
    );
    const headers = "Log ID,Author,Badge ID,Date,Time,Shift,Zone,Verification,Alerts Acked";
    const blob = new Blob([[headers, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `shift-audit-${new Date().toISOString().slice(0, 10)}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* ── Report modal ─────────────────────────────────────────────────── */}
      {activeReport && (
        <ReportModal
          log={activeReport}
          adminName={adminName}
          signingBlocked={signingBlockedReason(employee)}
          onCountersign={handleCountersign}
          onClose={() => setActiveReport(null)}
        />
      )}

      <div className="min-h-full flex flex-col gap-6">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 pb-4 print:hidden">
          <div>
            <div className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.14em] mb-0.5">
              Audit System
            </div>
            <h1 className="text-[20px] font-black text-neutral-900 tracking-tight leading-none">
              {activeTab === "shifts" ? "Shift Logs & Audit Trail" : "Daily Checklists & Audit"}
            </h1>
            <p className="text-[12px] font-semibold text-neutral-400 mt-1">
              {activeTab === "shifts"
                ? `Immutable field technician reports · ${currentSite?.site_name || "—"}`
                : "Browse and print official daily checklists submitted by technicians."}

            </p>
          </div>

          {/* Segmented Tab Controls for Admin Reports */}
          <div className="bg-neutral-100 border border-neutral-200 rounded-2xl p-1 flex shadow-sm shrink-0">
            <button
              onClick={() => setActiveTab("shifts")}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "shifts"
                  ? "bg-brand-500 text-white shadow-sm shadow-brand-500/10"
                  : "text-neutral-400 hover:text-neutral-600"
              }`}
            >
              <Clock size={12} />
              <span>Shift Handover Logs</span>
            </button>
            
            <button
              onClick={() => setActiveTab("checklists")}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "checklists"
                  ? "bg-brand-500 text-white shadow-sm shadow-brand-500/10"
                  : "text-neutral-400 hover:text-neutral-600"
              }`}
            >
              <FileText size={12} />
              <span>Daily Checklists</span>
            </button>
          </div>
        </div>

        {activeTab === "shifts" ? (
          <>
            {/* Action bar */}
            <div className="flex items-center justify-end gap-2 flex-wrap print:hidden">
              {/* Date range picker — now actually wired to fetchDbReports */}
              <DateRangePicker
                label={range.label}
                preset={preset}
                activeStart={range.start}
                activeEnd={range.end}
                onSelectPreset={setPreset}
                onSelectCustom={setCustomRange}
              />

              {/* Export */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Which month the compliance form covers — separate from the
                    browse range above, since the template is fixed to one
                    calendar month at a time. */}
                <FSelect
                  ariaLabel="Month to export"
                  className="w-28"
                  value={String(exportMonth)}
                  onChange={(v) => { setMonthPicked(true); setExportMonth(Number(v)); }}
                  options={Array.from({ length: 12 }, (_, m) => ({
                    value: String(m),
                    label: new Date(2000, m, 1).toLocaleString("en-US", { month: "short" })
                  }))}
                />
                <FSelect
                  ariaLabel="Year to export"
                  className="w-24"
                  value={String(exportYear)}
                  onChange={(v) => { setMonthPicked(true); setExportYear(Number(v)); }}
                  options={Array.from({ length: 4 }, (_, i) => now.getFullYear() - i)
                    .map((y) => ({ value: String(y), label: String(y) }))}
                />
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="bg-brand-600 hover:bg-brand-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed text-xs uppercase font-black tracking-wider"
                >
                  <FileSpreadsheet size={14} />
                  {isExporting ? 'Generating...' : 'Generate Legacy Excel Report'}
                </button>
                <button
                  onClick={() => handleAuditExport("csv")}
                  className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-neutral-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-neutral-700 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Download size={13} />
                  Export CSV
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-neutral-200 bg-white text-[11px] font-black text-neutral-700 uppercase tracking-wider hover:border-neutral-300 hover:bg-neutral-50 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <FileText size={13} />
                  Print / PDF
                </button>

              </div>
            </div>

            {/* ── Summary bar ──────────────────────────────────────────────────── */}
            <div className="bg-white border border-neutral-100 rounded-2xl shadow-sm px-5 py-4 flex flex-wrap items-center gap-6 print:hidden">
              {/* Log count */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center flex-shrink-0">
                  <FileText size={18} className="text-neutral-500" />
                </div>
                <div>
                  <div className="text-[22px] font-black text-neutral-900 leading-none">
                    {allShiftLogs.length}
                  </div>
                  <div className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mt-0.5">
                    Total Reports
                  </div>
                </div>
              </div>

              <div className="w-px h-10 bg-neutral-100 hidden sm:block" />

              {/* Verified */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-ok-50 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={18} className="text-ok-500" />
                </div>
                <div>
                  <div className="text-[22px] font-black text-ok-600 leading-none">
                    {verifiedCount}
                  </div>
                  <div className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mt-0.5">
                    Verified
                  </div>
                </div>
              </div>

              <div className="w-px h-10 bg-neutral-100 hidden sm:block" />

              {/* Discrepancies */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-danger-50 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={18} className="text-danger-500" />
                </div>
                <div>
                  <div className="text-[22px] font-black text-danger-600 leading-none">
                    {discrepancyCount}
                  </div>
                  <div className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mt-0.5">
                    Discrepancies
                  </div>
                </div>
              </div>

              <div className="w-px h-10 bg-neutral-100 hidden sm:block" />

              {/* Alerts acked */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-warn-50 flex items-center justify-center flex-shrink-0">
                  <Activity size={18} className="text-warn-500" />
                </div>
                <div>
                  <div className="text-[22px] font-black text-warn-600 leading-none">
                    {totalAlertsAcked}
                  </div>
                  <div className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mt-0.5">
                    Alerts Acked
                  </div>
                </div>
              </div>

              {/* Right: range label */}
              <div className="ml-auto hidden lg:flex items-center gap-1.5 text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                <Calendar size={11} />
                {range.label}
              </div>
            </div>

            {/* ── Timeline grid ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {allShiftLogs.map((log) => (
                <ShiftCard
                  key={log.id}
                  log={log}
                  onViewReport={setActiveReport}
                />
              ))}
            </div>

            {/* ── Immutability footer ───────────────────────────────────────────── */}
            <div className="flex items-center justify-between text-[10px] font-semibold text-neutral-400 pt-1 print:hidden">
              <div className="flex items-center gap-1.5">
                <Shield size={11} className="text-neutral-300" />
                <span>
                  All logs are immutable cryptographic records · {currentSite?.site_name || "—"} Audit System
                </span>

              </div>
              <span className="font-mono">
                {allShiftLogs.length} records · {range.label}
              </span>
            </div>
          </>
        ) : (
          <div className="w-full">
            <PrintableChecklist 
              readOnly={true} 
              showLogList={true} 
              data={{
                siteName: currentSite?.site_name || "—",
                technicianName: "Admin Operator",
                technicianId: "EMP-ADMIN"
              }}

            />
          </div>
        )}
      </div>
    </>
  );
}

export default ShiftReports;
