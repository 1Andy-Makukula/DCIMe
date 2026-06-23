import React, { useState, useEffect } from "react";
import { 
  Clock, 
  User, 
  MapPin, 
  CheckCircle, 
  Play, 
  AlertTriangle, 
  Zap, 
  ShieldCheck,
  ChevronRight
} from "lucide-react";
import { ShiftTimeline } from "./ShiftTimeline";
import { RoutineTasksDashboard } from "./RoutineTasksDashboard";
import { supabase } from "@/shared/api/supabaseClient";

export function TechDashboard() {
  const [selectedTargetHour, setSelectedTargetHour] = useState<number | null>(null);
  const [completedHours, setCompletedHours] = useState<number[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

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
                <p className="font-bold text-sm text-gray-100">Anderson M.</p>
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
    </div>
  );
}
