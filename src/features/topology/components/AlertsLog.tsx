import React, { useState } from "react";
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
  id:          string;
  severity:    Severity;
  timestamp:   string;
  asset:       string;
  assetId:     string;
  location:    string;
  description: string;
  telemetry:   string;
  category:    string;
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

// ── Mock datasets ─────────────────────────────────────────────────────────────
const ACTIVE_INCIDENTS: Incident[] = [
  {
    id:          "INC-2026-0891",
    severity:    "critical",
    timestamp:   "2026-06-22 14:22",
    asset:       "UPS Unit 1",
    assetId:     "PWR-UPS-001",
    location:    "Main Room · Rack R-01",
    description: "Phase L3 Current Overload — Severe Imbalance Detected",
    telemetry:   "L1: 98A · L2: 83A · L3: 112A  |  Threshold: ±15%  |  Deviation: +35%",
    category:    "Power / Phase",
    acknowledged: false,
  },
  {
    id:          "INC-2026-0890",
    severity:    "critical",
    timestamp:   "2026-06-22 13:55",
    asset:       "Rectifier B – Rm 2",
    assetId:     "PWR-RECT-002",
    location:    "Power Room 2 · Rack R-06",
    description: "DC Bus Voltage Drop Below Nominal — Rectifier Output Degraded",
    telemetry:   "Output: 47.8V DC  |  Nominal: 48.0V  |  Δ: −0.42%  |  Load: 35A",
    category:    "Power / DC",
    acknowledged: true,
    acknowledgedBy: "Anderson M.",
    acknowledgedAt: "14:01",
  },
  {
    id:          "INC-2026-0889",
    severity:    "warning",
    timestamp:   "2026-06-22 13:44",
    asset:       "CRAC Unit 3",
    assetId:     "COOL-CRAC-003",
    location:    "Power Room 2",
    description: "Inlet Temperature Elevated — Approaching Alarm Threshold",
    telemetry:   "Inlet: 22.4°C  |  Threshold: 22.0°C  |  Δ: +0.4°C  |  Setpoint: 20.0°C",
    category:    "Cooling / Thermal",
    acknowledged: false,
  },
  {
    id:          "INC-2026-0888",
    severity:    "warning",
    timestamp:   "2026-06-22 12:30",
    asset:       "Main Room Environment",
    assetId:     "ENV-HUM-001",
    location:    "Main Room",
    description: "Relative Humidity Approaching Upper Limit — Monitor Required",
    telemetry:   "RH: 63%  |  Upper Threshold: 65%  |  Lower Threshold: 40%  |  Trend: ↑",
    category:    "Environmental / Humidity",
    acknowledged: false,
  },
  {
    id:          "INC-2026-0887",
    severity:    "warning",
    timestamp:   "2026-06-22 11:15",
    asset:       "UPS Unit 2",
    assetId:     "PWR-UPS-002",
    location:    "Main Room · Rack R-02",
    description: "Phase L1 Imbalance Approaching Operational Limit",
    telemetry:   "L1: 91A · L2: 83A · L3: 88A  |  Deviation: +9.6%  |  Limit: ±10%",
    category:    "Power / Phase",
    acknowledged: true,
    acknowledgedBy: "Chileshe K.",
    acknowledgedAt: "11:28",
  },
  {
    id:          "INC-2026-0886",
    severity:    "info",
    timestamp:   "2026-06-22 09:14",
    asset:       "Perimeter Firewall",
    assetId:     "NET-FW-001",
    location:    "Main Room · Rack R-01",
    description: "Device Heartbeat Lost — NMS Poll Timeout (3 consecutive fails)",
    telemetry:   "Last ICMP Response: 09:11:42  |  SNMP Status: Timeout  |  Port: 161/UDP",
    category:    "Network / Connectivity",
    acknowledged: false,
  },
];

const RESOLVED_INCIDENTS: Incident[] = [
  {
    id:          "INC-2026-0885",
    severity:    "critical",
    timestamp:   "2026-06-22 06:02",
    asset:       "Diesel Generator A",
    assetId:     "PWR-GEN-001",
    location:    "Generator Room",
    description: "Scheduled Test Start Failure — Automatic Retry Initiated",
    telemetry:   "Crank Attempts: 3/3  |  Fault Code: E112  |  Battery Voltage: 24.1V",
    category:    "Power / Generator",
    resolvedBy:  "Anderson M.",
    resolvedAt:  "07:45",
    resolution:  "Manual crank initiated. Injector purged. Unit started successfully on 4th attempt. Battery replaced.",
    duration:    "1h 43m",
  },
  {
    id:          "INC-2026-0884",
    severity:    "warning",
    timestamp:   "2026-06-21 23:48",
    asset:       "CRAC Unit 1",
    assetId:     "COOL-CRAC-001",
    location:    "Main Room",
    description: "Cooling Compressor Fan Speed Fluctuation Detected",
    telemetry:   "Fan RPM: 1,840  |  Nominal: 2,100 RPM  |  Δ: −12.4%  |  Duration: 6 min",
    category:    "Cooling / Mechanical",
    resolvedBy:  "Chileshe K.",
    resolvedAt:  "00:17",
    resolution:  "Fan belt tension adjusted. RPM returned to nominal within 8 minutes of intervention.",
    duration:    "29m",
  },
  {
    id:          "INC-2026-0883",
    severity:    "warning",
    timestamp:   "2026-06-21 18:30",
    asset:       "PDU Rack A",
    assetId:     "PWR-PDU-001",
    location:    "Main Room · Rack R-01",
    description: "PDU Branch Circuit B3 Approaching Ampacity Limit",
    telemetry:   "Branch B3: 15.6A  |  Rating: 16A  |  Load: 97.5%  |  Recommendation: Offload",
    category:    "Power / Distribution",
    resolvedBy:  "Mwansa B.",
    resolvedAt:  "19:05",
    resolution:  "Load redistributed from Branch B3 to Branch B5. Branch B3 now at 62% utilization.",
    duration:    "35m",
  },
  {
    id:          "INC-2026-0882",
    severity:    "info",
    timestamp:   "2026-06-21 14:00",
    asset:       "Core Switch 2",
    assetId:     "NET-SW-002",
    location:    "Main Room · Rack R-02",
    description: "Scheduled Firmware Update Completed — Reboot Required Notification",
    telemetry:   "Previous FW: NX-OS 10.2(4)  |  New FW: NX-OS 10.2(5)  |  Reboot: Scheduled 02:00",
    category:    "Network / Maintenance",
    resolvedBy:  "System",
    resolvedAt:  "02:05",
    resolution:  "Automatic reboot completed successfully at 02:05. Uptime: 14d 6h reset.",
    duration:    "Maintenance window",
  },
];

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
  onAck:     (id: string) => void;
  onResolve: (id: string) => void;
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
                onClick={(e) => { e.stopPropagation(); onAck(incident.id); }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-[11px] font-black text-gray-600 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all"
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
              onClick={(e) => { e.stopPropagation(); onResolve(incident.id); }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-green-600 text-white text-[11px] font-black hover:bg-green-700 active:scale-[0.98] transition-all shadow-sm shadow-green-500/20"
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
              {" "}· Admin ZM-0874 · at {incident.resolvedAt}
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
  const [activeAlerts, setActiveAlerts] = useState<Incident[]>(ACTIVE_INCIDENTS);
  const [resolved,     setResolved]     = useState<Incident[]>(RESOLVED_INCIDENTS);
  const [expandedId,   setExpandedId]   = useState<string | null>(null);

  // ── Counters ──────────────────────────────────────────────────────────────
  const criticalCount = activeAlerts.filter((a) => a.severity === "critical").length;
  const warningCount  = activeAlerts.filter((a) => a.severity === "warning").length;
  const unackedCount  = activeAlerts.filter((a) => !a.acknowledged).length;

  // ── Actions ───────────────────────────────────────────────────────────────
  function handleAck(id: string) {
    setActiveAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, acknowledged: true, acknowledgedBy: "Anderson M.", acknowledgedAt: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) }
          : a
      )
    );
  }

  function handleResolve(id: string) {
    const incident = activeAlerts.find((a) => a.id === id);
    if (!incident) return;
    const now = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const resolvedIncident: Incident = {
      ...incident,
      resolvedBy:  "Anderson M.",
      resolvedAt:  now,
      resolution:  "Manually resolved via NOC dashboard by operator.",
      duration:    "—",
    };
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
    setResolved((prev) => [resolvedIncident, ...prev]);
    if (expandedId === id) setExpandedId(null);
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // ── Tab config ────────────────────────────────────────────────────────────
  const TABS: { id: View; label: string; count: number }[] = [
    { id: "active",   label: "Active Alarms",    count: activeAlerts.length },
    { id: "resolved", label: "Resolved History",  count: resolved.length     },
  ];

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
                "flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all",
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
                  key={incident.id}
                  incident={incident}
                  expanded={expandedId === incident.id}
                  onToggle={() => toggleExpand(incident.id)}
                  onAck={handleAck}
                  onResolve={handleResolve}
                />
              ))
          )}
        </div>
      ) : (
        /* Resolved history */
        <div className="flex flex-col gap-4">
          {resolved.map((incident) => (
            <ResolvedCard key={incident.id} incident={incident} />
          ))}
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-[10px] font-semibold text-gray-400 pt-1">
        <span>
          {view === "active"
            ? `${activeAlerts.length} active incident${activeAlerts.length !== 1 ? "s" : ""} · Last sync: 14:31 UTC+2`
            : `${resolved.length} resolved incidents in history`}
        </span>
        <span className="font-mono">Site NTC ZM-0874</span>
      </div>
    </div>
  );
}

export default AlertsLog;
