import React, { useState, useEffect } from "react";
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
import { supabase } from "@/shared/api/supabaseClient";
import { PrintableChecklist } from "../../field/components/PrintableChecklist";

// ── Types ─────────────────────────────────────────────────────────────────────
type VerificationStatus = "verified" | "discrepancy";
type DateRange = "7d" | "14d" | "30d" | "custom";

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
}

// ── Date range options ────────────────────────────────────────────────────────
const DATE_RANGES: { id: DateRange; label: string }[] = [
  { id: "7d", label: "Last 7 Days" },
  { id: "14d", label: "Last 14 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "custom", label: "Custom Range" },
];



// ── Verification badge ────────────────────────────────────────────────────────
function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === "verified") {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-[10px] font-black uppercase tracking-wider">
        <CheckCircle2 size={11} />
        System Verified
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-600 text-[10px] font-black uppercase tracking-wider">
      <AlertTriangle size={11} />
      Sensor Discrepancy
    </div>
  );
}

// ── Full-report modal ─────────────────────────────────────────────────────────
function ReportModal({
  log,
  onClose,
}: {
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
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gray-50/60">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Shift Report
              </span>
              <span className="text-[10px] font-mono font-black text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg">
                {log.logNumber}
              </span>
              <VerificationBadge status={log.verificationStatus} />
            </div>
            <h2 className="text-[16px] font-black text-gray-900 leading-none">
              {log.author}
            </h2>
            <p className="text-[11px] font-semibold text-gray-400 mt-0.5">
              {log.shiftLabel} · {log.date} · {log.time}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
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
              <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={10} className="text-gray-400" />
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                    {label}
                  </span>
                </div>
                <div className="text-[11px] font-bold text-gray-700">{value}</div>
              </div>
            ))}
          </div>

          {/* Telemetry */}
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
              Telemetry Snapshot
            </div>
            <div className="bg-gray-900 rounded-xl px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2">
              {log.telemetry.map((t, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-gray-500 text-[10px] font-semibold">
                    <span className={t.flag ? "text-red-400" : "text-gray-500"}>
                      {t.icon}
                    </span>
                    {t.label}
                  </div>
                  <span className={`font-mono text-[11px] font-bold ${t.flag ? "text-red-400" : "text-green-400"}`}>
                    {t.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
              Technician Notes
            </div>
            <div className="border-l-4 border-gray-200 pl-4 py-1">
              <p className="text-[12px] font-semibold text-gray-600 leading-relaxed italic">
                {log.notes}
              </p>
            </div>
          </div>

          {/* Verification footer */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${log.verificationStatus === "verified"
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
            }`}>
            {log.verificationStatus === "verified"
              ? <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
              : <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
            }
            <div>
              <div className={`text-[11px] font-black ${log.verificationStatus === "verified" ? "text-green-700" : "text-red-700"}`}>
                {log.verificationStatus === "verified"
                  ? "Log verified against SCADA telemetry. No discrepancies detected."
                  : "One or more field readings deviate from SCADA telemetry. Review flagged entries."}
              </div>
              <div className="text-[9px] font-semibold text-gray-400 mt-0.5">
                Immutable record · {log.id} · NTC ZM-0874 Audit System
              </div>
            </div>
          </div>
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
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200">
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
            <div className="flex items-center gap-1 justify-end text-[10px] font-bold text-gray-400">
              <Clock size={10} />
              {log.time}
            </div>
            <div className="text-[9px] font-semibold text-gray-300 mt-0.5 font-mono">
              {log.date}
            </div>
          </div>
        </div>

        {/* Author + zone */}
        <div className="mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-black text-gray-900 leading-tight">
              {log.author}
            </span>
            <span className="text-[9px] font-mono font-black text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">
              {log.logNumber}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin size={10} className="text-gray-400 flex-shrink-0" />
            <span className="text-[11px] font-semibold text-gray-400">
              {log.zone} · {log.shiftLabel}
            </span>
          </div>
        </div>

        {/* Verification badge */}
        <VerificationBadge status={log.verificationStatus} />
      </div>

      {/* ── Subtle divider ───────────────────────────────────────────────── */}
      <div className="mx-5 border-t border-gray-100" />

      {/* ── Telemetry grid ───────────────────────────────────────────────── */}
      <div className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-2.5 flex-1">
        {log.telemetry.map((t, i) => (
          <div key={i} className="flex items-center justify-between min-w-0">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 min-w-0">
              <span className={`flex-shrink-0 ${t.flag ? "text-red-400" : "text-gray-400"}`}>
                {t.icon}
              </span>
              <span className="truncate">{t.label}</span>
            </div>
            <span
              className={`text-[11px] font-black ml-1 flex-shrink-0 ${t.flag ? "text-red-505" : "text-gray-800"
                }`}
            >
              {t.value}
            </span>
          </div>
        ))}
      </div>

      {/* ── Notes section ────────────────────────────────────────────────── */}
      <div className="px-5 pb-4">
        <div className="border-l-[3px] border-gray-200 pl-3">
          <p className="text-[11px] font-semibold text-gray-500 italic leading-relaxed line-clamp-3">
            {log.notes}
          </p>
        </div>
      </div>

      {/* ── Alerts acked strip ───────────────────────────────────────────── */}
      {log.alertsAcked > 0 && (
        <div className="mx-5 mb-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-50 border border-yellow-100">
            <AlertTriangle size={11} className="text-yellow-500 flex-shrink-0" />
            <span className="text-[10px] font-black text-yellow-700">
              {log.alertsAcked} alert{log.alertsAcked !== 1 ? "s" : ""} acknowledged this shift
            </span>
          </div>
        </div>
      )}

      {/* ── Footer CTA ───────────────────────────────────────────────────── */}
      <div className="mt-auto border-t border-gray-100">
        <button
          onClick={() => onViewReport(log)}
          className={`w-full px-5 py-3.5 flex items-center justify-between text-[11px] font-black uppercase tracking-wider transition-colors ${isDiscrepancy
              ? "bg-red-50/60 hover:bg-red-50 text-red-600"
              : "bg-gray-50 hover:bg-gray-100 text-gray-600"
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
  const [activeTab, setActiveTab] = useState<"shifts" | "checklists">("shifts");
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [showPicker, setShowPicker] = useState(false);
  const [activeReport, setActiveReport] = useState<ShiftLog | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [dbReports, setDbReports] = useState<ShiftLog[]>([]);

  const fetchDbReports = async () => {
    try {
      const { data, error } = await supabase
        .from("shift_reports")
        .select("*")
        .order("timestamp", { ascending: false });

      if (error) throw error;

      if (data) {
        const mapped = data.map((report: any) => {
          const initials = report.technician_name
            ? report.technician_name.split(" ").map((n: string) => n[0]).join("").toUpperCase()
            : "AM";
          
          const colors = ["bg-red-500", "bg-blue-500", "bg-emerald-500", "bg-purple-500", "bg-amber-500"];
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
            shiftLabel: report.shift_duration || "Day Shift",
            site: report.site_id || "NTC ZM-0874",
            zone: "Power Room 1",
            verificationStatus: (report.certified ? "verified" : "discrepancy") as VerificationStatus,
            telemetry: [
              { label: "Power Source", value: report.active_power_source || "Mains Active", icon: <Zap size={11} />, flag: false },
              { label: "Routine Logs", value: `${report.routine_logs_completed || 0} / 4 Saved`, icon: <CheckCircle2 size={11} />, flag: false },
              { label: "Signature", value: "Verified Ledger", icon: <Shield size={11} />, flag: false }
            ],
            notes: report.notes || "No pass-down notes submitted.",
            alertsAcked: report.incidents_filed || 0,
            signedOff: report.certified || false
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
  }, []);

  const allShiftLogs = [...dbReports];

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Query live telemetry_logs for the current calendar month
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const monthName = now.toLocaleString("en-US", { month: "long" });
      const yearStr   = String(now.getFullYear());

      const { data: telemetryRows, error: telemetryError } = await supabase
        .from("telemetry_logs")
        .select("*")
        .gte("target_hour", monthStart.toISOString())
        .lte("target_hour", monthEnd.toISOString())
        .order("target_hour", { ascending: true });

      if (telemetryError) throw telemetryError;

      if (!telemetryRows || telemetryRows.length === 0) {
        alert(`No telemetry data found for ${monthName} ${yearStr}. Logs must be submitted before they can be exported.`);
        setIsExporting(false);
        return;
      }

      // Flatten each row: { target_hour (or created_at), ...metrics }
      const flatData = telemetryRows.map((row: any) => ({
        created_at: row.target_hour ?? row.created_at,
        ...(row.metrics as Record<string, any> || {}),
      }));

      await generateLegacyMonthlyReport(monthName, yearStr, flatData);
    } catch (err) {
      console.error("Error generating legacy monthly report:", err);
    } finally {
      setIsExporting(false);
    }
  };

  // Derived counts
  const verifiedCount = allShiftLogs.filter((l) => l.verificationStatus === "verified").length;
  const discrepancyCount = allShiftLogs.filter((l) => l.verificationStatus === "discrepancy").length;
  const totalAlertsAcked = allShiftLogs.reduce((sum, l) => sum + l.alertsAcked, 0);

  const activeDateLabel = DATE_RANGES.find((r) => r.id === dateRange)?.label ?? "Last 7 Days";

  // Audit CSV/PDF export handler
  function handleAuditExport(format: "csv" | "pdf") {
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
          onClose={() => setActiveReport(null)}
        />
      )}

      <div className="min-h-full flex flex-col gap-6">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4 print:hidden">
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.14em] mb-0.5">
              Audit System
            </div>
            <h1 className="text-[20px] font-black text-gray-900 tracking-tight leading-none">
              {activeTab === "shifts" ? "Shift Logs & Audit Trail" : "Daily Checklists & Audit"}
            </h1>
            <p className="text-[12px] font-semibold text-gray-400 mt-1">
              {activeTab === "shifts"
                ? "Immutable field technician reports · Site NTC ZM-0874"
                : "Browse and print official daily checklists submitted by technicians."}
            </p>
          </div>

          {/* Segmented Tab Controls for Admin Reports */}
          <div className="bg-slate-100 border border-slate-200 rounded-2xl p-1 flex shadow-sm shrink-0">
            <button
              onClick={() => setActiveTab("shifts")}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "shifts"
                  ? "bg-red-500 text-white shadow-sm shadow-red-500/10"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Clock size={12} />
              <span>Shift Handover Logs</span>
            </button>
            
            <button
              onClick={() => setActiveTab("checklists")}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "checklists"
                  ? "bg-red-500 text-white shadow-sm shadow-red-500/10"
                  : "text-gray-400 hover:text-gray-600"
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
              {/* Date range picker */}
              <div className="relative">
                <button
                  onClick={() => setShowPicker((p) => !p)}
                  className="flex items-center gap-2 h-9 px-3.5 rounded-xl border border-gray-200 bg-white text-[11px] font-black text-gray-700 uppercase tracking-wider hover:border-gray-300 transition-all"
                >
                  <Calendar size={13} className="text-gray-500" />
                  {activeDateLabel}
                  <ChevronDown size={12} className={`text-gray-400 transition-transform ${showPicker ? "rotate-180" : ""}`} />
                </button>

                {showPicker && (
                  <div className="absolute right-0 top-full mt-1.5 z-20 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden w-44">
                    {DATE_RANGES.map((range) => (
                      <button
                        key={range.id}
                        onClick={() => { setDateRange(range.id); setShowPicker(false); }}
                        className={`w-full text-left px-4 py-2.5 text-[11px] font-black uppercase tracking-wider transition-colors ${dateRange === range.id
                            ? "bg-gray-900 text-white"
                            : "text-gray-600 hover:bg-gray-50"
                          }`}
                      >
                        {range.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Export */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed text-xs uppercase font-black tracking-wider"
                >
                  <FileSpreadsheet size={14} />
                  {isExporting ? 'Generating...' : 'Generate Legacy Excel Report'}
                </button>
                <button
                  onClick={() => handleAuditExport("csv")}
                  className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-gray-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-gray-700 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Download size={13} />
                  Export CSV
                </button>
                <button
                  onClick={() => handleAuditExport("pdf")}
                  className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-gray-200 bg-white text-[11px] font-black text-gray-700 uppercase tracking-wider hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <FileText size={13} />
                  PDF
                </button>
              </div>
            </div>

            {/* ── Summary bar ──────────────────────────────────────────────────── */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-5 py-4 flex flex-wrap items-center gap-6 print:hidden">
              {/* Log count */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <FileText size={18} className="text-gray-500" />
                </div>
                <div>
                  <div className="text-[22px] font-black text-gray-900 leading-none">
                    {allShiftLogs.length}
                  </div>
                  <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">
                    Total Reports
                  </div>
                </div>
              </div>

              <div className="w-px h-10 bg-gray-100 hidden sm:block" />

              {/* Verified */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={18} className="text-green-500" />
                </div>
                <div>
                  <div className="text-[22px] font-black text-green-600 leading-none">
                    {verifiedCount}
                  </div>
                  <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">
                    Verified
                  </div>
                </div>
              </div>

              <div className="w-px h-10 bg-gray-100 hidden sm:block" />

              {/* Discrepancies */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={18} className="text-red-500" />
                </div>
                <div>
                  <div className="text-[22px] font-black text-red-600 leading-none">
                    {discrepancyCount}
                  </div>
                  <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">
                    Discrepancies
                  </div>
                </div>
              </div>

              <div className="w-px h-10 bg-gray-100 hidden sm:block" />

              {/* Alerts acked */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center flex-shrink-0">
                  <Activity size={18} className="text-yellow-500" />
                </div>
                <div>
                  <div className="text-[22px] font-black text-yellow-600 leading-none">
                    {totalAlertsAcked}
                  </div>
                  <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">
                    Alerts Acked
                  </div>
                </div>
              </div>

              {/* Right: range label */}
              <div className="ml-auto hidden lg:flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <Calendar size={11} />
                {activeDateLabel}
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
            <div className="flex items-center justify-between text-[10px] font-semibold text-gray-400 pt-1 print:hidden">
              <div className="flex items-center gap-1.5">
                <Shield size={11} className="text-gray-300" />
                <span>
                  All logs are immutable cryptographic records · NTC ZM-0874 Audit System
                </span>
              </div>
              <span className="font-mono">
                {allShiftLogs.length} records · {activeDateLabel}
              </span>
            </div>
          </>
        ) : (
          <div className="w-full">
            <PrintableChecklist 
              readOnly={true} 
              showLogList={true} 
              data={{
                siteName: "NTC ZM-0874",
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
