import { useState, useEffect } from "react";
import { useOutletContext } from "react-router";
import { 
  Clock, 
  User, 
  MapPin, 
  CheckCircle, 
  ShieldCheck,
  MessageSquare,
  AlertOctagon,
  Loader2
} from "lucide-react";
import { ShiftTimeline } from "./ShiftTimeline";
import { RoutineTasksDashboard } from "./RoutineTasksDashboard";
import { supabase } from "@/shared/api/supabaseClient";
import { useShiftReports } from "../hooks/useShiftReports";
import { TechUser } from "./TechLayout";

export function TechDashboard() {
  const { user } = useOutletContext<{ user: TechUser | null }>();
  const [selectedTargetHour, setSelectedTargetHour] = useState<number | null>(null);
  const [completedHours, setCompletedHours] = useState<number[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Tab state: "checklist" or "handover"
  const [activeTab, setActiveTab] = useState<"checklist" | "handover">("checklist");

  const { shiftReports, isLoading: isHandoversLoading, error: handoversError, refresh: refreshHandovers } = useShiftReports();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // update every minute to keep active slot accurate
    return () => clearInterval(timer);
  }, []);

  // Fetch completed slots for today on mount and slot return to keep UI synced with database
  useEffect(() => {
    const fetchCompletedHours = async () => {
      try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const { data, error } = await supabase
          .from("telemetry_logs")
          .select("target_hour")
          .gte("target_hour", startOfDay.toISOString())
          .lte("target_hour", endOfDay.toISOString());

        if (error) throw error;

        if (data) {
          const hours = data.map((row: any) => {
            return new Date(row.target_hour).getHours();
          });
          const uniqueHours = Array.from(new Set(hours));
          setCompletedHours(uniqueHours);
        }
      } catch (err) {
        console.error("Error fetching completed hours from Supabase:", err);
      }
    };

    fetchCompletedHours();
  }, [selectedTargetHour]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  };

  if (selectedTargetHour !== null) {
    return (
      <RoutineTasksDashboard 
        targetHour={selectedTargetHour} 
        onBack={() => setSelectedTargetHour(null)} 
        onSubmitSuccess={(hour) => {
          setCompletedHours((prev) => {
            if (!prev.includes(hour)) {
              return [...prev, hour];
            }
            return prev;
          });
          setSelectedTargetHour(null);
        }} 
      />
    );
  }

  return (
    <div className="space-y-6 max-w-md mx-auto">
      {/* Shift Context Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-950 to-gray-900 rounded-3xl p-5 text-white shadow-xl border border-gray-800">
        {/* Subtle decorative glowing spot */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-red-600 rounded-full blur-3xl opacity-20 pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest font-black text-red-500 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20">
              Active Shift
            </span>
            <div className="flex items-center gap-1.5 text-green-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              On-Shift
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-red-400 shrink-0">
                <User size={18} />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Technician</p>
                <p className="font-bold text-sm text-gray-100">{user?.name || "Loading..."}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-gray-400" />
                <span className="text-xs text-gray-300 font-medium">Power Room 1</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-gray-400" />
                <span className="text-xs text-gray-300 font-medium font-mono">06:00 - 14:00</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Segmented Tab Controls */}
      <div className="bg-white border border-gray-100 rounded-2xl p-1.5 flex shadow-sm">
        <button
          onClick={() => setActiveTab("checklist")}
          className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === "checklist"
              ? "bg-red-500 text-white shadow-sm shadow-red-500/10"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <CheckCircle size={14} />
          <span>Routine Checklist</span>
        </button>
        <button
          onClick={() => { setActiveTab("handover"); refreshHandovers(); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 relative ${
            activeTab === "handover"
              ? "bg-red-500 text-white shadow-sm shadow-red-500/10"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <MessageSquare size={14} />
          <span>Pass-down Notes</span>
          {shiftReports.length > 0 && activeTab !== "handover" && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 border-2 border-white text-[9px] font-black text-white rounded-full flex items-center justify-center">
              {shiftReports.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content 1: Routine Checklist & Timeline */}
      {activeTab === "checklist" && (
        <>
          {/* Shift Timeline Section */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
            <ShiftTimeline 
              currentTime={currentTime} 
              completedHours={completedHours} 
              onSelectSlot={(hour) => setSelectedTargetHour(hour)} 
            />
          </div>

          {/* Facility Status Section */}
          <div className="space-y-2.5">
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">
              Facility Status
            </h2>
            
            <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center shrink-0 border border-green-100">
                <CheckCircle size={22} className="text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm">Site Stable</p>
                <p className="text-xs text-gray-500 truncate">No active telemetry alarms in Zone 1</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Tab Content 2: Pass-down Notes from Outgoing Shifts */}
      {activeTab === "handover" && (
        <div className="space-y-4">
          <div className="px-1 flex justify-between items-center">
            <div>
              <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                Shift Pass-down Logs
              </h2>
              <p className="text-[10px] text-gray-500 mt-0.5">Critical updates and warnings left by previous shifts.</p>
            </div>
            <button 
              onClick={refreshHandovers}
              className="text-[10px] text-red-600 font-bold hover:underline"
              disabled={isHandoversLoading}
            >
              {isHandoversLoading ? "Refreshing..." : "Sync Logs"}
            </button>
          </div>

          {isHandoversLoading && shiftReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 bg-white border border-gray-100 rounded-3xl shadow-sm gap-2">
              <Loader2 className="animate-spin text-red-500" size={24} />
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Syncing shift reports...</p>
            </div>
          ) : handoversError ? (
            <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-3xl text-xs flex gap-2">
              <AlertOctagon size={16} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Fetch Error:</span> {handoversError}
              </div>
            </div>
          ) : shiftReports.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-3xl p-8 text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-400 border border-gray-100">
                <MessageSquare size={28} />
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-gray-955 text-sm">Clear Pass-down Ledger</h3>
                <p className="text-xs text-gray-400 max-w-[240px] mx-auto">
                  No active handover notes or shift logs are archived in the database.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {shiftReports.map((report, idx) => {
                const isActiveWatch = idx === 0;
                return (
                  <div 
                    key={report.log_id}
                    className={`bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-4 relative overflow-hidden transition-all hover:border-gray-200 ${
                      isActiveWatch ? "ring-2 ring-red-500/25 border-red-100 bg-gradient-to-b from-red-50/10 to-white" : ""
                    }`}
                  >
                    {/* Left visual state stripe */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isActiveWatch ? "bg-red-500" : "bg-gray-300"}`} />

                    <div className="flex items-center justify-between pl-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-gray-400">
                          {report.signature_id ? report.signature_id.substring(0, 14) + "..." : `SR-${report.log_id.substring(0, 6)}`}
                        </span>
                        {isActiveWatch && (
                          <span className="inline-flex items-center gap-1 bg-red-500 text-white text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm shadow-red-500/10">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                            Active Watch Note
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] font-mono text-gray-400 font-bold">{formatDate(report.timestamp)}</span>
                    </div>

                    <div className="pl-1 space-y-2">
                      <div className="flex items-center gap-2 text-gray-855">
                        <User size={13} className="text-gray-400" />
                        <span className="font-bold text-xs">{report.technician_name}</span>
                        <span className="text-[10px] text-gray-400">({report.technician_id})</span>
                      </div>
                      
                      {/* Pass-down commentary box */}
                      <div className={`p-4 rounded-2xl text-xs font-semibold leading-relaxed ${
                        isActiveWatch 
                          ? "bg-red-50/40 border border-red-100/50 text-red-950" 
                          : "bg-gray-50 border border-gray-100 text-gray-700"
                      }`}>
                        <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Pass-down Instructions</div>
                        <p className="whitespace-pre-line">{report.notes || "No pass-down notes submitted."}</p>
                      </div>

                      <div className="flex items-center justify-between pt-1.5 text-[9px] text-gray-400 font-bold">
                        <div className="flex items-center gap-1">
                          <Clock size={11} />
                          <span>Shift: {report.shift_duration}</span>
                        </div>
                        <div className="flex items-center gap-1 text-green-600">
                          <ShieldCheck size={11} />
                          <span>Certified {report.routine_logs_completed}/4 Logs Saved</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
