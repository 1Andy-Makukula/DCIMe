import { useState, useEffect } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Clock,
  CheckCheck,
  Bell,
  BellOff,
  RotateCcw,
  ShieldCheck,
  User,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Severity = "critical" | "warning" | "info";
type View     = "active" | "resolved";

interface Incident {
  id:          string; // ticket_number
  dbId:        string; // database uuid
  severity:    Severity;
  timestamp:   string;
  asset:       string;
  assetId:     string;
  location:    string;
  description: string;
  telemetry:   string;
  category:    string;
  photoUrl?:   string | null;
  raisedByName?: string;
  // only on active
  acknowledged?: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  // only on resolved
  resolvedBy?: string;
  resolvedAt?: string;
  resolution?: string;
  duration?:   string;
}

// ── Severity config ───────────────────────────────────────────────────────────
const SEV_CONFIG = {
  critical: {
    border:   "border-l-red-500",
    bg:       "bg-red-50",
    badgeBg:  "bg-red-100",
    badgeText:"text-red-700",
    iconColor:"#DC2626",
    label:    "CRITICAL",
    Icon:     AlertCircle,
    headerBg: "bg-red-50/60",
  },
  warning: {
    border:   "border-l-yellow-500",
    bg:       "bg-yellow-50",
    badgeBg:  "bg-yellow-100",
    badgeText:"text-yellow-700",
    iconColor:"#D97706",
    label:    "WARNING",
    Icon:     AlertTriangle,
    headerBg: "bg-yellow-50/60",
  },
  info: {
    border:   "border-l-blue-500",
    bg:       "bg-blue-50",
    badgeBg:  "bg-blue-100",
    badgeText:"text-blue-700",
    iconColor:"#2563EB",
    label:    "INFO",
    Icon:     Info,
    headerBg: "bg-blue-50/60",
  },
} as const;

// ── Sub-components ────────────────────────────────────────────────────────────

/** Severity badge pill */
function SeverityBadge({ severity }: { severity: Severity }) {
  const cfg = SEV_CONFIG[severity];
  const { Icon } = cfg;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${cfg.badgeBg} ${cfg.badgeText}`}
    >
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

/** Acknowledged pill */
function AckBadge({ by, at }: { by: string; at: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-gray-100 text-[9px] font-black text-gray-500 uppercase tracking-wider">
      <User size={9} />
      ACK · {by} · {at}
    </span>
  );
}

function EvidenceImage({ photoUrl, technicianName }: { photoUrl?: string | null; technicianName?: string }) {
  const name = technicianName || "Unknown Technician";
  const getInitials = (n: string) => {
    const parts = n.trim().split(/\s+/);
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : n.substring(0, 2).toUpperCase();
  };

  const getStableColors = (n: string) => {
    const themes = [
      { bg: "from-rose-500 to-red-600", border: "border-rose-200" },
      { bg: "from-blue-500 to-indigo-600", border: "border-blue-200" },
      { bg: "from-emerald-500 to-teal-600", border: "border-emerald-200" },
      { bg: "from-violet-500 to-purple-600", border: "border-violet-200" },
      { bg: "from-amber-500 to-orange-600", border: "border-amber-200" },
      { bg: "from-cyan-500 to-sky-600", border: "border-cyan-200" },
      { bg: "from-pink-500 to-fuchsia-600", border: "border-pink-200" },
      { bg: "from-teal-500 to-emerald-600", border: "border-teal-200" }
    ];
    if (!n) return themes[0];
    let hash = 0;
    for (let i = 0; i < n.length; i++) {
      hash = n.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % themes.length;
    return themes[index];
  };

  if (photoUrl) {
    return (
      <div className="mt-3">
        <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
          Photo Evidence
        </div>
        <div className="relative rounded-2xl overflow-hidden border border-gray-150 max-h-80 shadow-sm max-w-md bg-gray-50 flex items-center justify-center">
          <img 
            src={photoUrl} 
            alt="Incident Evidence" 
            className="w-full h-full object-contain max-h-80"
          />
        </div>
      </div>
    );
  }

  const theme = getStableColors(name);
  return (
    <div className="mt-3">
      <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
        Photo Evidence
      </div>
      <div className={`relative rounded-2xl overflow-hidden border-2 border-dashed ${theme.border} p-5 max-w-md bg-gradient-to-br ${theme.bg} text-white shadow-sm flex flex-col items-center justify-center text-center space-y-2`}>
        <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-xs font-black tracking-wider border border-white/20">
          {getInitials(name)}
        </div>
        <div>
          <span className="text-xs font-black uppercase tracking-wider block">No Photo Attached</span>
          <span className="text-[10px] opacity-80 block mt-0.5 font-medium">Reported by {name}</span>
        </div>
      </div>
    </div>
  );
}

/** Incident card for Active view */
function ActiveCard({
  incident,
  expanded,
  onToggle,
  onAck,
  onResolve,
}: {
  incident:  Incident;
  expanded:  boolean;
  onToggle:  () => void;
  onAck:     (dbId: string) => void;
  onResolve: (dbId: string) => void;
}) {
  const cfg = SEV_CONFIG[incident.severity];
  const { Icon } = cfg;

  return (
    <div
      className={`bg-white border border-gray-100 border-l-4 ${cfg.border} rounded-2xl shadow-sm overflow-hidden transition-shadow hover:shadow-md`}
    >
      {/* ── Card header ─────────────────────────────────────────────────── */}
      <div
        className={`px-5 py-4 flex items-start gap-4 cursor-pointer select-none ${cfg.headerBg}`}
        onClick={onToggle}
      >
        {/* Severity icon */}
        <div className="flex-shrink-0 mt-0.5">
          <Icon size={20} color={cfg.iconColor} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Top meta row */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <SeverityBadge severity={incident.severity} />

            {incident.acknowledged && incident.acknowledgedBy && incident.acknowledgedAt && (
              <AckBadge by={incident.acknowledgedBy} at={incident.acknowledgedAt} />
            )}

            <span className="flex items-center gap-1 text-[10px] font-semibold text-gray-400">
              <Clock size={10} />
              {incident.timestamp}
            </span>

            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-auto">
              {incident.category}
            </span>
          </div>

          {/* Affected asset */}
          <div className="flex items-baseline gap-2 flex-wrap mb-1">
            <span className="text-[13px] font-black text-gray-900">
              {incident.asset}
            </span>
            <span className="text-[10px] font-mono font-semibold text-gray-400">
              {incident.assetId}
            </span>
            <span className="text-[10px] font-semibold text-gray-400">
              · {incident.location}
            </span>
          </div>

          {/* Description */}
          <p className="text-[12px] font-semibold text-gray-700 leading-snug">
            {incident.description}
          </p>
        </div>

        {/* Expand toggle */}
        <div className="flex-shrink-0 text-gray-400 mt-0.5">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* ── Expanded detail ──────────────────────────────────────────────── */}
      {expanded && (
        <div className="px-5 pb-4 pt-0 border-t border-gray-100 space-y-3">
          {/* Telemetry snapshot */}
          <div className="mt-3">
            <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
              Telemetry Snapshot
            </div>
            <div className="font-mono text-[11px] text-gray-700 bg-gray-900 text-green-400 rounded-xl px-4 py-3 leading-relaxed tracking-wide">
              {incident.telemetry.split("  |  ").map((seg, i) => (
                <span key={i}>
                  {i > 0 && (
                    <span className="text-gray-600 mx-2">|</span>
                  )}
                  {seg}
                </span>
              ))}
            </div>
          </div>

          {/* Photo Evidence */}
          <EvidenceImage photoUrl={incident.photoUrl} technicianName={incident.raisedByName} />

          {/* Incident ID row */}
          <div className="flex items-center gap-2 text-[10px] font-semibold text-gray-400">
            <span className="font-mono font-black text-gray-500">{incident.id}</span>
            <span>·</span>
            <span>Opened {incident.timestamp}</span>
          </div>

          {/* Action engine */}
          <div className="flex items-center gap-2 pt-1">
            {!incident.acknowledged ? (
              <button
                onClick={(e) => { e.stopPropagation(); onAck(incident.dbId); }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-[11px] font-black text-gray-600 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all cursor-pointer"
              >
                <BellOff size={13} />
                Acknowledge
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-100 text-[11px] font-black text-gray-400">
                <CheckCheck size={13} />
                Acknowledged
              </div>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); onResolve(incident.dbId); }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-green-600 text-white text-[11px] font-black hover:bg-green-700 active:scale-[0.98] transition-all shadow-sm shadow-green-500/20 cursor-pointer"
            >
              <CheckCircle2 size={13} />
              Resolve / Clear
            </button>

            <span className="ml-auto text-[10px] font-semibold text-gray-400 flex items-center gap-1">
              <Clock size={10} />
              Open since {incident.timestamp}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Incident card for Resolved view */
function ResolvedCard({ incident }: { incident: Incident }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEV_CONFIG[incident.severity];
  const { Icon } = cfg;

  return (
    <div className="bg-white border border-gray-100 border-l-4 border-l-gray-300 rounded-2xl shadow-sm overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
      {/* Header */}
      <div
        className="px-5 py-4 flex items-start gap-4 cursor-pointer select-none bg-gray-50/50"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex-shrink-0 mt-0.5 opacity-50">
          <Icon size={18} color={cfg.iconColor} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <SeverityBadge severity={incident.severity} />
            <span className="flex items-center gap-1 text-[10px] font-semibold text-gray-400">
              <Clock size={10} />
              {incident.timestamp}
            </span>
            {incident.duration && (
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                Duration: {incident.duration}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-[10px] font-black uppercase tracking-wider">
              <ShieldCheck size={10} />
              Resolved
            </div>
          </div>

          <div className="flex items-baseline gap-2 flex-wrap mb-1">
            <span className="text-[13px] font-black text-gray-700 line-through decoration-gray-400">
              {incident.asset}
            </span>
            <span className="text-[10px] font-mono font-semibold text-gray-400">
              {incident.assetId}
            </span>
          </div>

          <p className="text-[12px] font-semibold text-gray-500 leading-snug">
            {incident.description}
          </p>
        </div>

        <div className="flex-shrink-0 text-gray-400 mt-0.5">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-5 pb-4 pt-0 border-t border-gray-100 space-y-3">
          {/* Telemetry */}
          <div className="mt-3">
            <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
              Telemetry at Time of Incident
            </div>
            <div className="font-mono text-[11px] text-gray-500 bg-gray-100 rounded-xl px-4 py-3 leading-relaxed tracking-wide">
              {incident.telemetry.split("  |  ").map((seg, i) => (
                <span key={i}>
                  {i > 0 && <span className="text-gray-400 mx-2">|</span>}
                  {seg}
                </span>
              ))}
            </div>
          </div>

          {/* Photo Evidence */}
          <EvidenceImage photoUrl={incident.photoUrl} technicianName={incident.raisedByName} />

          {/* Resolution note */}
          <div>
            <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
              Resolution Notes
            </div>
            <p className="text-[12px] font-semibold text-gray-600 leading-snug bg-green-50 border border-green-100 rounded-xl px-4 py-3">
              {incident.resolution}
            </p>
          </div>

          {/* Resolver info */}
          <div className="flex items-center gap-2 text-[10px] font-semibold text-gray-400">
            <ShieldCheck size={11} className="text-green-500" />
            <span>
              Cleared by{" "}
              <span className="font-black text-gray-600">{incident.resolvedBy}</span>
              {" "}· Operator · at {incident.resolvedAt}
            </span>
            <span className="ml-auto font-mono font-black text-gray-400">
              {incident.id}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function AlertsLog() {
  const [view,         setView]         = useState<View>("active");
  const [rawIncidents, setRawIncidents] = useState<any[]>([]);
  const [isLoading,    setIsLoading]    = useState(true);
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [lastSync,     setLastSync]     = useState<string>("");

  const [acknowledgedList, setAcknowledgedList] = useState<{ id: string; by: string; at: string }[]>(() => {
    try {
      const stored = localStorage.getItem("dcime_acknowledged_incidents");
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("dcime_acknowledged_incidents", JSON.stringify(acknowledgedList));
    } catch (e) {
      console.error("Failed to save acknowledged list to localStorage:", e);
    }
  }, [acknowledgedList]);

  const mapRowToIncident = (row: any): Incident => {
    const mapSeverity = (sev: string): Severity => {
      const s = (sev || "").toLowerCase();
      if (s === "critical" || s === "high") return "critical";
      if (s === "medium" || s === "warning" || s === "warn") return "warning";
      return "info";
    };

    const formatTime = (timeStr: string) => {
      if (!timeStr) return "—";
      const d = new Date(timeStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };

    const formatShortTime = (timeStr: string) => {
      if (!timeStr) return "—";
      const d = new Date(timeStr);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };

    const formatDuration = (start: string, end: string) => {
      if (!start || !end) return "—";
      const diffMs = new Date(end).getTime() - new Date(start).getTime();
      if (isNaN(diffMs) || diffMs <= 0) return "—";
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) return `${diffMins}m`;
      const diffHours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `${diffHours}h ${mins}m`;
    };

    let telemetryStr = `Raised by: ${row.raised_by_name || 'System'} (${row.raised_by_id || '—'})`;
    if (row.impact) {
      telemetryStr += `  |  Impact: ${row.impact}`;
    }
    if (row.contractor_engaged) {
      telemetryStr += `  |  Contractor: ${row.contractor_engaged}`;
    }

    // Determine a nice category
    let categoryStr = "System Alert";
    if (row.asset_id) {
      if (row.asset_id.startsWith("PWR-")) categoryStr = "Power / Fault";
      else if (row.asset_id.startsWith("COOL-")) categoryStr = "Cooling / Thermal";
      else if (row.asset_id.startsWith("NET-")) categoryStr = "Network / Connectivity";
      else if (row.asset_id.startsWith("COMP-")) categoryStr = "Compute / Server";
    }

    const localAck = acknowledgedList.find((item) => item.id === row.id);

    return {
      id:             row.ticket_number || row.id,
      dbId:           row.id,
      severity:       mapSeverity(row.severity),
      timestamp:      formatTime(row.occurred_at || row.created_at),
      asset:          row.asset_id,
      assetId:        row.asset_id,
      location:       row.site_name || "NTC ZM 0874",
      description:    row.notes || "No description provided",
      telemetry:      telemetryStr,
      category:       categoryStr,
      photoUrl:       row.photo_url,
      raisedByName:   row.raised_by_name || "Unknown Technician",
      acknowledged:   !!localAck,
      acknowledgedBy: localAck?.by,
      acknowledgedAt: localAck ? formatShortTime(localAck.at) : undefined,
      resolvedBy:     row.resolved_by_name,
      resolvedAt:     row.resolved_at ? formatShortTime(row.resolved_at) : undefined,
      resolution:     row.resolution_details,
      duration:       row.resolved_at ? formatDuration(row.occurred_at || row.created_at, row.resolved_at) : undefined,
    };
  };

  const incidents = rawIncidents.map(mapRowToIncident);
  const activeAlerts = incidents.filter((i) => !i.resolvedAt);
  const resolved = incidents.filter((i) => !!i.resolvedAt);

  const fetchIncidents = async () => {
    try {
      const { data, error } = await supabase
        .from("incidents")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data) {
        setRawIncidents(data);
      }
      setLastSync(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      console.error("Error fetching incidents:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("incidents-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incidents" },
        () => {
          fetchIncidents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ── Counters ──────────────────────────────────────────────────────────────
  const criticalCount = activeAlerts.filter((a) => a.severity === "critical").length;
  const warningCount  = activeAlerts.filter((a) => a.severity === "warning").length;
  const unackedCount  = activeAlerts.filter((a) => !a.acknowledged).length;

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleAck = async (dbId: string) => {
    const nowStr = new Date().toISOString();
    setAcknowledgedList((prev) => [
      ...prev,
      { id: dbId, by: "Ndabane Anderson M.", at: nowStr }
    ]);
  };

  const handleResolve = async (dbId: string) => {
    try {
      const now = new Date().toISOString();
      const currentYear = new Date().getFullYear();
      const randomCode = Math.floor(1000 + Math.random() * 9000);
      const receiptNumber = `REC-${currentYear}-${randomCode}`;

      const { error } = await supabase
        .from("incidents")
        .update({
          status: "RESOLVED",
          resolved_at: now,
          resolved_by_name: "Ndabane Anderson M.",
          resolved_by_id: "EMP-0874-AM",
          receipt_number: receiptNumber,
          impact: "Minimal operational impact, resolved by operator.",
          contractor_engaged: "None",
          resolution_details: "Manually resolved via NOC dashboard by operator.",
        })
        .eq("id", dbId);

      if (error) throw error;
      if (expandedId === dbId) setExpandedId(null);
      fetchIncidents();
    } catch (err) {
      console.error("Error resolving incident:", err);
      alert("Failed to resolve incident.");
    }
  };

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // ── Tab config ────────────────────────────────────────────────────────────
  const TABS: { id: View; label: string; count: number }[] = [
    { id: "active",   label: "Active Alarms",    count: activeAlerts.length },
    { id: "resolved", label: "Resolved History",  count: resolved.length     },
  ];

  if (isLoading && activeAlerts.length === 0 && resolved.length === 0) {
    return (
      <div className="min-h-full flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-gray-900 border-t-transparent animate-spin" />
          <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Synchronizing Fault Queue...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col gap-5">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.14em] mb-0.5">
            Incident Management
          </div>
          <h1 className="text-[20px] font-black text-gray-900 tracking-tight leading-none">
            System Alerts &amp; Triage
          </h1>
          <p className="text-[11px] font-semibold text-gray-400 mt-1">
            Site NTC ZM-0874 · Real-time fault queue
          </p>
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {criticalCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-100 border border-red-200">
              <AlertCircle size={13} className="text-red-600" />
              <span className="text-[11px] font-black text-red-700 uppercase tracking-wider">
                {criticalCount} Critical — Action Required
              </span>
            </div>
          )}
          {warningCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-yellow-100 border border-yellow-200">
              <AlertTriangle size={13} className="text-yellow-600" />
              <span className="text-[11px] font-black text-yellow-700 uppercase tracking-wider">
                {warningCount} Warning
              </span>
            </div>
          )}
          {unackedCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 border border-gray-200">
              <Bell size={13} className="text-gray-500" />
              <span className="text-[11px] font-black text-gray-600 uppercase tracking-wider">
                {unackedCount} Unacknowledged
              </span>
            </div>
          )}
          {activeAlerts.length === 0 && view === "active" && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-100 border border-green-200">
              <ShieldCheck size={13} className="text-green-600" />
              <span className="text-[11px] font-black text-green-700 uppercase tracking-wider">
                All Clear
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── View toggle tabs ─────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-4 py-3 flex items-center justify-between gap-4">
        {/* Tab group */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={[
                "flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer",
                view === tab.id
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                  : "text-gray-400 hover:text-gray-600",
              ].join(" ")}
            >
              {tab.id === "active" ? (
                <Bell size={12} className={view === "active" ? "text-red-500" : ""} />
              ) : (
                <RotateCcw size={12} />
              )}
              {tab.label}
              <span
                className={[
                  "min-w-[20px] h-5 rounded-full flex items-center justify-center text-[9px] font-black px-1.5",
                  view === tab.id
                    ? tab.id === "active"
                      ? "bg-red-500 text-white"
                      : "bg-gray-200 text-gray-600"
                    : "bg-gray-200 text-gray-500",
                ].join(" ")}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Stats strip */}
        <div className="hidden sm:flex items-center gap-5 text-right">
          {view === "active" ? (
            <>
              <div>
                <div className="text-[18px] font-black text-red-600 leading-none">{criticalCount}</div>
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Critical</div>
              </div>
              <div>
                <div className="text-[18px] font-black text-yellow-600 leading-none">{warningCount}</div>
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Warning</div>
              </div>
              <div>
                <div className="text-[18px] font-black text-blue-600 leading-none">
                  {activeAlerts.filter((a) => a.severity === "info").length}
                </div>
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Info</div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="text-[18px] font-black text-green-600 leading-none">{resolved.length}</div>
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Resolved</div>
              </div>
              <div>
                <div className="text-[18px] font-black text-gray-700 leading-none">
                  {resolved.filter((r) => r.severity === "critical").length}
                </div>
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Were Critical</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Incident Queue ───────────────────────────────────────────────── */}
      {view === "active" ? (
        <div className="flex flex-col gap-4">
          {activeAlerts.length === 0 ? (
            /* Empty state */
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-8 py-16 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center">
                <ShieldCheck size={32} className="text-green-500" />
              </div>
              <div className="text-center">
                <div className="text-[15px] font-black text-gray-900">All Systems Clear</div>
                <p className="text-[12px] font-semibold text-gray-400 mt-1">
                  No active incidents. All resolved incidents have been moved to history.
                </p>
              </div>
            </div>
          ) : (
            /* Sort: critical first, then warning, then info */
            [...activeAlerts]
              .sort((a, b) => {
                const order = { critical: 0, warning: 1, info: 2 };
                return order[a.severity] - order[b.severity];
              })
              .map((incident) => (
                <ActiveCard
                  key={incident.dbId}
                  incident={incident}
                  expanded={expandedId === incident.dbId}
                  onToggle={() => toggleExpand(incident.dbId)}
                  onAck={handleAck}
                  onResolve={handleResolve}
                />
              ))
          )}
        </div>
      ) : (
        /* Resolved history */
        <div className="flex flex-col gap-4">
          {resolved.length === 0 ? (
            /* Empty state */
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-8 py-16 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
                <RotateCcw size={32} className="text-gray-400" />
              </div>
              <div className="text-center">
                <div className="text-[15px] font-black text-gray-900">No Resolved Incidents</div>
                <p className="text-[12px] font-semibold text-gray-400 mt-1">
                  No resolved incidents in history yet.
                </p>
              </div>
            </div>
          ) : (
            resolved.map((incident) => (
              <ResolvedCard key={incident.dbId} incident={incident} />
            ))
          )}
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-[10px] font-semibold text-gray-400 pt-1">
        <span>
          {view === "active"
            ? `${activeAlerts.length} active incident${activeAlerts.length !== 1 ? "s" : ""} · Last sync: ${lastSync} UTC+2`
            : `${resolved.length} resolved incidents in history`}
        </span>
        <span className="font-mono">Site NTC ZM-0874</span>
      </div>
    </div>
  );
}

export default AlertsLog;
