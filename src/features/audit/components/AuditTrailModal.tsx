import React, { useState, useEffect } from "react";
import { X, Download, Printer, Share2 } from "lucide-react";
import { GlowDot } from "@/shared/ui";
import { supabase } from "@/shared/api/supabaseClient";

export interface AuditTrailModalProps {
  onClose: () => void;
}

export function AuditTrailModal({ onClose }: AuditTrailModalProps) {
  const [techName, setTechName] = useState<string>("Anderson M.");

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: empData } = await supabase
            .from("employees")
            .select("full_name")
            .eq("auth_id", session.user.id)
            .maybeSingle();
          const name = empData?.full_name || session.user.user_metadata?.full_name;
          if (name) setTechName(name);
        }
      } catch (err) {
        console.error("Error fetching profile in AuditTrailModal:", err);
      }
    };
    fetchProfile();
  }, []);

  const auditRows = [
    { section: "POWER SOURCE", rows: [["Source", "ZESCO MAINS", ""]] },
    {
      section: "ZESCO MAINS",
      rows: [
        ["Load Voltage", "233 V", "Nominal"],
        ["Load Current", "98 A", "Normal"],
        ["Total Load", "476 KW", ""],
        ["Power Factor", "0.98", "Good"],
      ],
    },
    {
      section: "VERTIV RECTIFIERS",
      rows: [
        ["Room 1 · Rect A — Voltage", "48.1 V", ""],
        ["Room 1 · Rect A — Current", "32 A", ""],
        ["Room 1 · Load", "75%", ""],
        ["Room 2 · Rect A — Voltage", "47.8 V", "Low ⚠"],
        ["Room 2 · Rect A — Current", "35 A", ""],
        ["Room 2 · Load", "82%", ""],
      ],
    },
    {
      section: "UPS UNITS",
      rows: [
        ["UPS 1 · L1", "233V / 98A", ""],
        ["UPS 1 · L2", "231V / 83A", "⚠ Imbalance"],
        ["UPS 1 · L3", "229V / 112A", "⚠ Imbalance"],
        ["UPS 1 · Battery VDC", "215 V", "Float"],
        ["UPS 1 · Charge", "100%", "Full"],
        ["UPS 1 · Capacity Used", "0%", ""],
        ["UPS 1 · Load KW", "0.0 KW", ""],
        ["UPS 2 · L1", "233V / 95A", ""],
        ["UPS 2 · L2", "232V / 94A", ""],
        ["UPS 2 · L3", "231V / 97A", ""],
        ["UPS 2 · Battery VDC", "214 V", "Float"],
        ["UPS 2 · Charge", "100%", "Full"],
      ],
    },
    {
      section: "ENVIRONMENT",
      rows: [
        ["Main Room", "20.7°C", "Nominal"],
        ["Power Room 1", "19.2°C", "Nominal"],
        ["Power Room 2", "21.1°C", "Warning"],
        ["Enterprise 1", "21.3°C", "Warning"],
        ["Enterprise 2", "20.4°C", "Nominal"],
        ["Humidity (Main)", "63%", "Caution"],
      ],
    },
  ];

  const statusColor = (note: string) => {
    if (note.includes("⚠") || note === "Warning" || note === "Caution" || note === "Low ⚠") return "#FFB020";
    if (note === "Nominal" || note === "Good" || note === "Full" || note === "Normal") return "#19C853";
    return "#aaa";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.9)" }}>
      <div
        className="bg-white rounded-[24px] w-full max-w-[620px] overflow-hidden flex flex-col"
        style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.8)", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
          <div>
            <div className="font-black text-[14px] text-gray-900 font-mono uppercase tracking-wider">
              SHIFT LOG: 2026-06-20 · 14:32 UTC+2
            </div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.12em] mt-0.5">
              Logged by: {techName} · NTC ZM-0874 · Airtel DCIMe
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400">
            <X size={17} />
          </button>
        </div>

        {/* Actions */}
        <div className="px-6 py-3 border-b border-gray-100 flex gap-2 flex-wrap flex-shrink-0">
          {[
            { label: "Export to PDF", icon: <Download size={12} /> },
            { label: "Print", icon: <Printer size={12} /> },
            { label: "Share to Email", icon: <Share2 size={12} /> },
          ].map((btn) => (
            <button
              key={btn.label}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border-2 border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 transition-all"
            >
              {btn.icon} {btn.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <GlowDot color="#19C853" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Submitted</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <tbody>
              {auditRows.map(({ section, rows }) => (
                <React.Fragment key={section}>
                  <tr style={{ backgroundColor: "#0C0D0D" }}>
                    <td colSpan={3} className="px-5 py-2 text-[10px] font-black text-white uppercase tracking-[0.15em]">
                      ▸ {section}
                    </td>
                  </tr>
                  {rows.map(([label, value, note], i) => (
                    <tr key={`${section}-${i}`} className="border-b border-gray-50">
                      <td className="px-5 py-2.5 text-[11px] font-semibold text-gray-400 w-44 whitespace-nowrap">{label}</td>
                      <td className="px-5 py-2.5 text-[12px] font-bold text-gray-900 font-mono">{value}</td>
                      <td
                        className="px-5 py-2.5 text-[10px] font-black"
                        style={{ color: statusColor(note) }}
                      >
                        {note}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
