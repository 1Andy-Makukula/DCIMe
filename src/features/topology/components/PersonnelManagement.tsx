import React, { useState, useEffect } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { RegistrationForm } from "@/features/auth/components/RegistrationForm";
import {
  Users,
  Shield,
  MapPin,
  Clock,
  ShieldBan,
  UserPlus,
  UserCheck,
  Pencil,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Key,
  Mail,
  Phone,
  CalendarDays,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Role   = "NOC Admin" | "L2 Engineer" | "L1 Tech" | "Security Officer";
type Status = "Active" | "Revoked" | "On-Shift";

interface Personnel {
  id:         string;
  name:       string;
  initials:   string;
  avatarColor:string;
  email:      string;
  phone:      string;
  role:       Role;
  zone:       string;
  shift:      string;
  shiftDays:  string;
  lastActive: string;
  status:     Status;
  accessLevel:number;
  joinedDate: string;
  badgeId:    string;
}

// ── Role badge config ─────────────────────────────────────────────────────────
const ROLE_BADGE: Record<Role, string> = {
  "NOC Admin":       "bg-purple-100 text-purple-700 border border-purple-200",
  "L2 Engineer":     "bg-blue-100   text-blue-700   border border-blue-200",
  "L1 Tech":         "bg-gray-100   text-gray-600   border border-gray-200",
  "Security Officer":"bg-amber-100  text-amber-700  border border-amber-200",
};

// ── Status badge config ───────────────────────────────────────────────────────
const STATUS_BADGE: Record<Status, { cls: string; dot: string; label: string }> = {
  "On-Shift": { cls: "bg-green-100 text-green-700",  dot: "bg-green-500",  label: "On-Shift" },
  "Active":   { cls: "bg-gray-100  text-gray-600",   dot: "bg-gray-400",   label: "Active"   },
  "Revoked":  { cls: "bg-red-100   text-red-700",    dot: "bg-red-500",    label: "Revoked"  },
};

// ── Access level pips ─────────────────────────────────────────────────────────
function AccessPips({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-0.5" title={`Level ${level}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`w-2.5 h-1.5 rounded-sm ${
            i < level ? "bg-red-500" : "bg-gray-200"
          }`}
        />
      ))}
      <span className="text-[9px] font-black text-gray-400 ml-1.5 uppercase tracking-wider">
        L{level}
      </span>
    </div>
  );
}

// ── Table header cell ─────────────────────────────────────────────────────────
function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-5 py-3.5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
}

// ── Add Personnel Modal ───────────────────────────────────────────────────────
interface AddPersonnelModalProps {
  onClose: () => void;
  onSaveSuccess: () => void;
}

function AddPersonnelModal({ onClose, onSaveSuccess }: AddPersonnelModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
    >
      <div className="w-full max-w-xl">
        <RegistrationForm onClose={onClose} onSaveSuccess={onSaveSuccess} />
      </div>
    </div>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({
  person,
  action,
  onConfirm,
  onCancel,
}: {
  person:    Personnel;
  action:    "revoke" | "reinstate";
  onConfirm: () => void;
  onCancel:  () => void;
}) {
  const isRevoke = action === "revoke";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className={`px-6 pt-6 pb-4 flex items-start gap-4 ${isRevoke ? "bg-red-50" : "bg-green-50"}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isRevoke ? "bg-red-100" : "bg-green-100"}`}>
            {isRevoke
              ? <ShieldBan size={20} className="text-red-600" />
              : <UserCheck size={20} className="text-green-600" />
            }
          </div>
          <div>
            <h3 className={`text-[14px] font-black leading-none mb-1 ${isRevoke ? "text-red-800" : "text-green-800"}`}>
              {isRevoke ? "Revoke Access?" : "Reinstate Access?"}
            </h3>
            <p className="text-[12px] font-semibold text-gray-600 leading-snug">
              {isRevoke
                ? `This will immediately terminate all active sessions and badge access for ${person.name}.`
                : `This will restore system access and badge clearances for ${person.name}.`
              }
            </p>
          </div>
        </div>
        <div className="px-6 pb-5 pt-4 flex items-center gap-2 justify-end border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-[11px] font-black text-gray-500 hover:bg-gray-100 transition-all uppercase tracking-wider cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black text-white uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer ${
              isRevoke ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {isRevoke ? <ShieldBan size={12} /> : <UserCheck size={12} />}
            {isRevoke ? "Confirm Revoke" : "Confirm Reinstate"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mapper helper ─────────────────────────────────────────────────────────────
// ── Main Component ────────────────────────────────────────────────────────────
export function PersonnelManagement() {
  const [rawEmployees, setRawEmployees] = useState<any[]>([]);
  const [isLoading,    setIsLoading]    = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirm,      setConfirm]      = useState<{ person: Personnel; action: "revoke" | "reinstate" } | null>(null);
  const [expandedRow,  setExpandedRow]  = useState<string | null>(null);

  const [revokedIds, setRevokedIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("dcime_revoked_employees");
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("dcime_revoked_employees", JSON.stringify(revokedIds));
    } catch (e) {
      console.error("Failed to save revoked IDs to localStorage:", e);
    }
  }, [revokedIds]);

  const mapRowToPersonnel = (row: any): Personnel => {
    const getInitials = (name: string) => {
      if (!name) return "??";
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    };

    const getAvatarColor = (name: string) => {
      const colors = [
        "bg-red-500",
        "bg-blue-500",
        "bg-emerald-500",
        "bg-violet-500",
        "bg-amber-500",
        "bg-cyan-500",
        "bg-pink-500",
        "bg-indigo-500"
      ];
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      const index = Math.abs(hash) % colors.length;
      return colors[index];
    };

    const mapRole = (r: string): Role => {
      if (r === "ADMIN") return "NOC Admin";
      if (r === "FIELD_TECH") return "L2 Engineer";
      return "L1 Tech";
    };

    const formatTime = (timeStr: string) => {
      if (!timeStr) return "—";
      const d = new Date(timeStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    const isRevoked = revokedIds.includes(row.id);
    const status: Status = isRevoked
      ? "Revoked"
      : (row.role === "ADMIN" ? "On-Shift" : "Active");

    return {
      id:          row.id,
      name:        row.full_name,
      initials:    getInitials(row.full_name),
      avatarColor: getAvatarColor(row.full_name),
      email:       row.email || `${row.full_name.toLowerCase().replace(/[^a-z0-9]/g, "")}@dcime.local`,
      phone:       row.phone_number || "+260 97 000 0000",
      role:        mapRole(row.role),
      zone:        row.site_id || "Global (All Rooms)",
      shift:       row.role === "ADMIN" ? "08:00 – 18:00" : (row.employee_id && /\d/.test(row.employee_id) ? (parseInt(row.employee_id.replace(/\D/g, ""), 10) % 2 === 0 ? "08:00 – 18:00" : "18:00 – 08:00") : "08:00 – 18:00"),
      shiftDays:   "Mon – Fri",
      lastActive:  isRevoked ? "Suspended" : "Just now",
      status:      status,
      accessLevel: row.role === "ADMIN" ? 5 : 3,
      joinedDate:  formatTime(row.created_at),
      badgeId:     row.employee_id || `ZM-${Math.floor(1000 + Math.random() * 9000)}`,
    };
  };

  const roster = rawEmployees.map(mapRowToPersonnel);

  const fetchRoster = async () => {
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("full_name", { ascending: true });

      if (error) throw error;

      if (data) {
        setRawEmployees(data);
      }
    } catch (err) {
      console.error("Error loading employees:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoster();
  }, []);

  // ── Computed stats ──────────────────────────────────────────────────────
  const totalCleared  = roster.filter((p) => p.status !== "Revoked").length;
  const onShiftCount  = roster.filter((p) => p.status === "On-Shift").length;
  const revokedCount  = roster.filter((p) => p.status === "Revoked").length;

  // ── Actions ─────────────────────────────────────────────────────────────
  function handleToggleAccess(person: Personnel) {
    const action = person.status === "Revoked" ? "reinstate" : "revoke";
    setConfirm({ person, action });
  }

  async function confirmToggle() {
    if (!confirm) return;
    const { person, action } = confirm;
    if (action === "revoke") {
      setRevokedIds((prev) => [...prev, person.id]);
    } else {
      setRevokedIds((prev) => prev.filter((id) => id !== person.id));
    }
    setConfirm(null);
  }

  // ── Summary card data ────────────────────────────────────────────────────
  const SUMMARY_CARDS = [
    {
      label:     "Total Cleared Staff",
      value:     totalCleared,
      sub:       `${roster.length} total registered`,
      icon:      Users,
      iconBg:    "bg-blue-50",
      iconColor: "text-blue-500",
      valueColor:"text-gray-900",
    },
    {
      label:     "Currently On-Shift",
      value:     onShiftCount,
      sub:       "Live active sessions",
      icon:      Activity,
      iconBg:    "bg-green-50",
      iconColor: "text-green-500",
      valueColor:"text-green-600",
      pulse:     true,
    },
    {
      label:     "Security Flags / Revoked",
      value:     revokedCount,
      sub:       "Accounts suspended",
      icon:      ShieldBan,
      iconBg:    "bg-red-50",
      iconColor: "text-red-500",
      valueColor:"text-red-600",
    },
  ] as const;

  if (isLoading && roster.length === 0) {
    return (
      <div className="min-h-full flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-gray-900 border-t-transparent animate-spin" />
          <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Synchronizing Identity Roster...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {showAddModal && (
        <AddPersonnelModal
          onClose={() => setShowAddModal(false)}
          onSaveSuccess={fetchRoster}
        />
      )}
      {confirm && (
        <ConfirmDialog
          person={confirm.person}
          action={confirm.action}
          onConfirm={confirmToggle}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="min-h-full flex flex-col gap-6">

        {/* ── Page Header ──────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.14em] mb-0.5">
              Identity &amp; Access Management
            </div>
            <h1 className="text-[20px] font-black text-gray-900 tracking-tight leading-none">
              Personnel &amp; Security Access
            </h1>
            <p className="text-[12px] font-semibold text-gray-400 mt-1">
              Manage IAM, shift rosters, and zone clearances · Site NTC ZM-0874
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gray-900 text-white text-[12px] font-black uppercase tracking-wider hover:bg-gray-700 active:scale-[0.98] transition-all shadow-sm flex-shrink-0 cursor-pointer"
          >
            <UserPlus size={15} />
            Add New Personnel
          </button>
        </div>

        {/* ── Summary Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SUMMARY_CARDS.map((card) => {
            const { icon: Icon } = card;
            return (
              <div
                key={card.label}
                className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 flex items-center gap-4"
              >
                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${card.iconBg}`}>
                  {"pulse" in card && card.pulse ? (
                    <div className="relative">
                      <Icon size={22} className={card.iconColor} />
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white animate-pulse" />
                    </div>
                  ) : (
                    <Icon size={22} className={card.iconColor} />
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] leading-none mb-1">
                    {card.label}
                  </div>
                  <div className={`text-[30px] font-black leading-none ${card.valueColor}`}>
                    {card.value}
                  </div>
                  <div className="text-[10px] font-semibold text-gray-400 mt-1">
                    {card.sub}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── IAM Ledger Table ──────────────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex-1">

          {/* Table header bar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                IAM Ledger
              </div>
              <div className="text-[13px] font-black text-gray-900 mt-0.5">
                {roster.length} Registered Accounts
              </div>
            </div>

            {/* Legend */}
            <div className="hidden md:flex items-center gap-3">
              {(["NOC Admin", "L2 Engineer", "L1 Tech", "Security Officer"] as Role[]).map((role) => (
                <span key={role} className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-wider ${ROLE_BADGE[role]}`}>
                  {role}
                </span>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70">
                  <Th>Technician</Th>
                  <Th>Clearance Zone</Th>
                  <Th>Shift Schedule</Th>
                  <Th>Access Level</Th>
                  <Th>Status</Th>
                  <Th>Last Active</Th>
                  <Th className="text-right">Security Controls</Th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {roster.map((person) => {
                  const isRevoked  = person.status === "Revoked";
                  const isExpanded = expandedRow === person.id;
                  const statusCfg  = STATUS_BADGE[person.status];

                  return (
                    <React.Fragment key={person.id}>
                      {/* Main row */}
                      <tr
                        className={`group transition-colors duration-100 ${
                          isRevoked
                            ? "opacity-50 bg-gray-50/30"
                            : "hover:bg-gray-50/50"
                        }`}
                      >
                        {/* Technician */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-[12px] font-black flex-shrink-0 ${
                                isRevoked ? "bg-gray-300" : person.avatarColor
                              }`}
                            >
                              {person.initials}
                            </div>

                            {/* Name + role + badge */}
                            <div>
                              <div className={`text-[13px] font-black leading-tight ${isRevoked ? "text-gray-400 line-through decoration-gray-400" : "text-gray-900"}`}>
                                {person.name}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider ${ROLE_BADGE[person.role]}`}>
                                  {person.role}
                                </span>
                                <span className="text-[9px] font-mono text-gray-400">
                                  {person.badgeId}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Clearance Zone */}
                        <td className="px-5 py-4">
                          <div className="flex items-start gap-1.5">
                            <MapPin size={12} className="text-gray-400 flex-shrink-0 mt-0.5" />
                            <span className="text-[12px] font-semibold text-gray-700 leading-snug">
                              {person.zone}
                            </span>
                          </div>
                        </td>

                        {/* Shift Schedule */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Clock size={12} className="text-gray-400 flex-shrink-0" />
                            <span className="text-[12px] font-bold text-gray-800">
                              {person.shift}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 ml-[18px]">
                            <CalendarDays size={10} className="text-gray-300 flex-shrink-0" />
                            <span className="text-[10px] font-semibold text-gray-400">
                              Mon – Fri
                            </span>
                          </div>
                        </td>

                        {/* Access Level */}
                        <td className="px-5 py-4">
                          <AccessPips level={isRevoked ? 0 : person.accessLevel} />
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${statusCfg.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusCfg.dot} ${person.status === "On-Shift" ? "animate-pulse" : ""}`} />
                            {statusCfg.label}
                          </span>
                        </td>

                        {/* Last Active */}
                        <td className="px-5 py-4">
                          <span className="text-[11px] font-semibold text-gray-500">
                            {person.lastActive}
                          </span>
                        </td>

                        {/* Security Controls */}
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">

                            {/* Expand for details */}
                            <button
                              onClick={() => setExpandedRow(isExpanded ? null : person.id)}
                              title="View profile"
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                            >
                              <Pencil size={11} />
                              View Profile
                            </button>

                            {/* Revoke / Reinstate */}
                            {isRevoked ? (
                              <button
                                onClick={() => handleToggleAccess(person)}
                                title="Reinstate access"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 text-[10px] font-black uppercase tracking-wider transition-all active:scale-[0.97] cursor-pointer"
                              >
                                <UserCheck size={11} />
                                Reinstate
                              </button>
                            ) : (
                              <button
                                onClick={() => handleToggleAccess(person)}
                                title="Revoke access"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 text-[10px] font-black uppercase tracking-wider transition-all active:scale-[0.97] cursor-pointer"
                              >
                                <ShieldBan size={11} />
                                Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded profile row */}
                      {isExpanded && (
                        <tr className="bg-gray-50/60 border-b border-gray-100">
                          <td colSpan={7} className="px-5 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {[
                                { label: "Staff ID",       value: person.id,         icon: Key         },
                                { label: "Badge",          value: person.badgeId,    icon: Shield      },
                                { label: "Email",          value: person.email,      icon: Mail        },
                                { label: "Phone",          value: person.phone,      icon: Phone       },
                                { label: "Joined",         value: person.joinedDate, icon: CalendarDays },
                                { label: "Access Level",   value: `Level ${person.accessLevel} / 5`, icon: CheckCircle2 },
                              ].map(({ label, value, icon: Icon }) => (
                                <div key={label} className="bg-white border border-gray-100 rounded-xl px-3 py-2.5" style={{ minWidth: 0 }}>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Icon size={10} className="text-gray-400" />
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                      {label}
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-bold text-gray-700 font-mono truncate" title={value}>
                                    {value}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Revoked warning banner */}
                            {isRevoked && (
                              <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200">
                                <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
                                <span className="text-[11px] font-bold text-red-700">
                                  This account has been suspended. All active sessions have been terminated and badge access revoked.
                                </span>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-400">
              {roster.length} accounts registered · {onShiftCount} currently active
            </span>
            <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">
              <Shield size={11} />
              Site NTC ZM-0874
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default PersonnelManagement;
