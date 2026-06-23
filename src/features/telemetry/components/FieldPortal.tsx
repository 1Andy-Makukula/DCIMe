import React from "react";
import { CheckCircle, AlertTriangle, RefreshCw, ArrowLeft, Plus } from "lucide-react";
import { AirtelMark, GlowDot, TopologyBG } from "@/shared/ui";
import { shiftLogs } from "@/shared/utils/mockData";

export interface FieldPortalProps {
  onBack: () => void;
  onForm: () => void;
}

export function FieldPortal({ onBack, onForm }: FieldPortalProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-0 md:p-4" style={{ backgroundColor: "#0C0D0D" }}>
      <div
        className="w-full h-screen md:h-auto max-h-screen md:max-h-[calc(100vh-32px)] max-w-full md:max-w-2xl lg:max-w-3xl bg-white rounded-none md:rounded-[28px] overflow-hidden flex flex-col"
        style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.9)" }}
      >
        {/* Header */}
        <div className="px-5 pt-6 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <AirtelMark size={28} />
              <span className="font-black text-[14px] text-gray-900 tracking-tight leading-none">
                DCIMe<span className="text-red-500">_Engine</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Current Time</div>
                <div className="font-black text-[15px] text-gray-900 font-mono">23:13 hrs</div>
              </div>
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
                style={{ backgroundColor: "#FF0000" }}
              >
                AM
              </div>
            </div>
          </div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.12em]">
            Anderson M. · Field Technician · NTC ZM-0874
          </div>
        </div>

        {/* Site Status Hero */}
        <div className="px-4 pb-3 flex-shrink-0">
          <div className="rounded-2xl p-4 relative overflow-hidden" style={{ backgroundColor: "#0F1111", minHeight: 110 }}>
            <div className="absolute inset-0 opacity-40">
              <TopologyBG />
            </div>
            <div className="relative z-10">
              <div className="text-[9px] font-black text-gray-500 uppercase tracking-[0.18em] mb-2">Current Site Status</div>
              <div className="flex items-center gap-2 mb-1">
                <GlowDot color="#19C853" />
                <span className="font-black text-white text-[17px] tracking-tight">ZESCO MAINS</span>
              </div>
              <div className="text-[11px] font-bold" style={{ color: "#19C853" }}>Grid-Stable · 230V AC · PF 0.98</div>
              <div className="flex gap-5 mt-3">
                {[
                  { label: "Load", value: "476 KW" },
                  { label: "Temp", value: "20.7°C" },
                  { label: "UPS", value: "100%" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="text-[9px] font-black text-gray-500 uppercase tracking-wider">{s.label}</div>
                    <div className="font-black text-white text-[13px]">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="px-4 pb-3 flex-shrink-0">
          <button
            onClick={onForm}
            className="w-full py-4 rounded-2xl font-black text-white text-[14px] tracking-[0.06em] uppercase flex items-center justify-center gap-2.5 transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: "#FF0000" }}
          >
            <Plus size={20} strokeWidth={3} /> BEGIN HOURLY SHIFT REPORT
          </button>
        </div>

        {/* Alert strip */}
        <div className="px-4 pb-3 flex-shrink-0">
          <div className="rounded-xl px-3.5 py-2.5 flex items-center gap-2.5" style={{ backgroundColor: "#FFF8E1" }}>
            <AlertTriangle size={13} color="#FFB020" className="flex-shrink-0" />
            <span className="text-[11px] font-bold leading-snug" style={{ color: "#B8810A" }}>
              4 active alerts · Phase imbalance on UPS 1 L3
            </span>
          </div>
        </div>

        {/* Logs */}
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">Recent Shift Logs</span>
            <RefreshCw size={11} color="#ccc" />
          </div>
        </div>

        <div className="px-4 pb-4 overflow-y-auto flex-1">
          <div className="space-y-2">
            {shiftLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: log.status === "ok" ? "#E8FFF1" : "#FFF3CD" }}
                >
                  <CheckCircle size={15} color={log.status === "ok" ? "#19C853" : "#FFB020"} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-gray-900">Log #{log.id}</div>
                  <div className="text-[10px] font-semibold text-gray-400">{log.by} · {log.time}</div>
                </div>
                <span
                  className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: log.status === "ok" ? "#E8FFF1" : "#FFF3CD",
                    color: log.status === "ok" ? "#19C853" : "#FFB020",
                  }}
                >
                  {log.status === "ok" ? "OK" : "WARN"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-red-500 transition-colors"
          >
            <ArrowLeft size={13} /> Logout
          </button>
          <span className="text-[10px] font-semibold text-gray-300 font-mono">NTC ZM-0874</span>
        </div>
      </div>
    </div>
  );
}
