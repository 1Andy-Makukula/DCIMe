import React, { useState, useEffect, forwardRef } from "react";
import { Printer, Shield, Info, ArrowLeft, Loader2, CheckSquare, ShieldCheck } from "lucide-react";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useTelemetryMutation } from "../hooks/useTelemetryMutation";
import { supabase } from "@/shared/api/supabaseClient";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";

interface Checkpoint {
  id: string;
  name: string;
  expected?: string;
}

interface Section {
  title: string;
  checkpoints: Checkpoint[];
}

const CHECKLIST_SECTIONS: Section[] = [
  {
    title: "Transformer/AVR",
    checkpoints: [
      { id: "t1", name: "Transformer temperature (Acceptable Range: 85°C - 90°C)" },
      { id: "t2", name: 'Transformer HT / LT breakers "ON" and have no signs of damages' },
      { id: "t3", name: "Verify grid voltage, and confirm the tolerance (380-410 Volts)" },
      { id: "t4", name: "Confirm AVR input/output voltage, current, and frequency are normal" },
      { id: "t5", name: "If existing - AVR voltage columns for dust accumulation" },
      { id: "t6", name: "SPD type 1 is status (not damaged)" }
    ]
  },
  {
    title: "Switchboard/ATS",
    checkpoints: [
      { id: "s1", name: "Relays & Contactors electro-mechanical components are not damaged" },
      { id: "s2", name: "Voltage Monitoring (OV/UV & phase inversion relay) / Control Boards / Control power fuses not blown" },
      { id: "s3", name: "Verify ATS Control small UPS is working with healthy (~24V)" }
    ]
  },
  {
    title: "Generators & Fuel",
    checkpoints: [
      { id: "g1", name: "Check for active alarms on the control panel." },
      { id: "g2", name: "Generator on auto mode and emergency button not pushed in" },
      { id: "g3", name: "Starting Batteries: (~24V) connections are not loosened, corrosion or with sulfate buildup" },
      { id: "g4", name: "Verify fuel tank levels are at target capacity" },
      { id: "g5", name: "Verify Oil & Coolant level" },
      { id: "g6", name: 'Start generators on manual mode with "No load"' }
    ]
  },
  {
    title: "Main Distribution Boards (MDBs)",
    checkpoints: [
      { id: "m1", name: 'Breakers (ACBs and MCCBs): Main, cooling, UPS and Rectifier breakers "ON"' },
      { id: "m2", name: "Surge Protection Devices (SPDs): Verify if SPD 2 is still functional" },
      { id: "m3", name: "Terminals and Busbar Visual Inspection: Verify if no loose connections or generate excessive heat (+50C)" }
    ]
  },
  {
    title: "Cooling Systems",
    checkpoints: [
      { id: "c1", name: "Check for active alarms on the control panel." },
      { id: "c2", name: "Check cooling units status and temperature/humidity setpoints (~21C/~45%)" },
      { id: "c3", name: "Inspect for visible water leaks or condensation puddles." },
      { id: "c4", name: 'Compressors: "ON" and working without overheating' },
      { id: "c5", name: "Blower Belts: Not broken, no stretch or cracks" },
      { id: "c6", name: "External Fan/Blower Motors: Running and rotating properly" }
    ]
  },
  {
    title: "UPS & Batteries",
    checkpoints: [
      { id: "u1", name: 'Verify status is "Normal" (no active alarms/bypass modes/Input Breaker "ON")' },
      { id: "u2", name: "Verify each module is properly working and carrying load" },
      { id: "u3", name: "Verify input/output voltage, current, and frequency from telemetry." },
      { id: "u4", name: "Visual batteries inspection for obvious bloating, leakage, or corrosion." },
      { id: "u5", name: 'Verify batteries breaker "ON"' }
    ]
  },
  {
    title: "Rectifier & Batteries",
    checkpoints: [
      { id: "r1", name: 'Verify status is "Normal" (no active alarms/bypass modes/Input Breaker "ON")' },
      { id: "r2", name: "Verify each module is properly working and carrying load" },
      { id: "r3", name: "Visual batteries inspection for obvious bloating, leakage, or corrosion." },
      { id: "r4", name: "Check DC busbar and batteries cables connectors don't overheat or burnt" }
    ]
  },
  {
    title: "Fire Suppression, Detection, CCTV & Access Control",
    checkpoints: [
      { id: "f1", name: "Verify no Active Alarms on the Control Panel" },
      { id: "f2", name: "Verify pressure level for the cylinders" },
      { id: "f3", name: "Verify Camera" }
    ]
  }
];

export const PrintableChecklist = forwardRef<HTMLDivElement, any>((props, ref) => {
  const { currentSite } = useCurrentSite();
  const { submitTelemetryLog } = useTelemetryMutation();

  const { data: propData = {}, readOnly: forceReadOnly = false } = props;
  const techName = propData.technicianName || "Field Tech";

  // Local editable/fillable form states
  const [siteName, setSiteName] = useState(propData.siteName || currentSite?.site_name || "");
  const [date, setDate] = useState(() => {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}/${mm}/${dd}`; // matches format in image: 23/06/26
  });

  const [formValues, setFormValues] = useState<
    Record<string, { status: "OK" | "NOT OK" | "N/A"; comment: string }>
  >(() => {
    const initial: Record<string, { status: "OK" | "NOT OK" | "N/A"; comment: string }> = {};
    CHECKLIST_SECTIONS.forEach((section) => {
      section.checkpoints.forEach((cp) => {
        initial[cp.id] = { status: "OK", comment: "" };
      });
    });
    return initial;
  });

  // Footer state
  const [msName, setMsName] = useState("");
  const [msSignature, setMsSignature] = useState("");
  const [msDate, setMsDate] = useState("");

  const [spocName, setSpocName] = useState("");
  const [spocSignature, setSpocSignature] = useState("");
  const [spocDate, setSpocDate] = useState("");

  // History State
  const [selectedHistory, setSelectedHistory] = useState<any | null>(null);
  const [historyChecklists, setHistoryChecklists] = useState<any[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isReadOnly = forceReadOnly || selectedHistory !== null;

  const handleStatusChange = (id: string, status: "OK" | "NOT OK" | "N/A") => {
    if (isReadOnly) return;
    setFormValues((prev) => ({
      ...prev,
      [id]: { ...prev[id], status }
    }));
  };

  const handleCommentChange = (id: string, comment: string) => {
    if (isReadOnly) return;
    setFormValues((prev) => ({
      ...prev,
      [id]: { ...prev[id], comment }
    }));
  };

  const fetchHistory = async () => {
    setIsHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("telemetry_logs")
        .select("*")
        .eq("asset_id", "AIRTEL_DAILY_CHECKLIST")
        .order("target_hour", { ascending: false });

      if (error) throw error;

      if (data) {
        const mapped = data.map((row: any) => {
          const metrics = row.metrics || {};
          return {
            id: row.id,
            target_hour: row.target_hour,
            technician_name: row.technician_name,
            technician_id: row.technician_id,
            site_uuid: row.site_uuid,
            siteName: metrics.siteName || "",
            date: metrics.date || "",
            shift: metrics.shift || "DAY SHIFT",
            formValues: metrics.formValues || {},
            msPartner: metrics.msPartner || {},
            airtelSpoc: metrics.airtelSpoc || {},
          };
        });
        setHistoryChecklists(mapped);
      }
    } catch (err) {
      console.error("Error loading checklist history:", err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [saveSuccess]);

  // Sync state if history selected or if props override it
  useEffect(() => {
    if (selectedHistory) {
      setFormValues(selectedHistory.formValues || {});
      setSiteName(selectedHistory.siteName || "");
      setDate(selectedHistory.date || "");
      setMsName(selectedHistory.msPartner?.name || "");
      setMsSignature(selectedHistory.msPartner?.signature || "");
      setMsDate(selectedHistory.msPartner?.date || "");
      setSpocName(selectedHistory.airtelSpoc?.name || "");
      setSpocSignature(selectedHistory.airtelSpoc?.signature || "");
      setSpocDate(selectedHistory.airtelSpoc?.date || "");
    } else if (forceReadOnly && propData.formValues) {
      setFormValues(propData.formValues || {});
      setSiteName(propData.siteName || "NTC ZM-0874");
      setDate(propData.date || new Date().toISOString().split("T")[0]);
      setMsName(propData.msPartner?.name || "");
      setMsSignature(propData.msPartner?.signature || "");
      setMsDate(propData.msPartner?.date || "");
      setSpocName(propData.airtelSpoc?.name || "");
      setSpocSignature(propData.airtelSpoc?.signature || "");
      setSpocDate(propData.airtelSpoc?.date || "");
    } else {
      const initial: Record<string, { status: "OK" | "NOT OK" | "N/A"; comment: string }> = {};
      CHECKLIST_SECTIONS.forEach((section) => {
        section.checkpoints.forEach((cp) => {
          initial[cp.id] = { status: "OK", comment: "" };
        });
      });
      setFormValues(initial);
      setSiteName(propData.siteName || currentSite?.site_name || "");
      setDate(() => {
        const d = new Date();
        const yy = String(d.getFullYear()).slice(-2);
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yy}/${mm}/${dd}`;
      });
      setMsName("");
      setMsSignature("");
      setMsDate("");
      setSpocName("");
      setSpocSignature("");
      setSpocDate("");
    }
  }, [selectedHistory, forceReadOnly, propData, currentSite]);

  const handleSaveAndPrint = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const metricsJson = {
        siteName,
        date,
        shift: "DAY SHIFT (08:00 - 18:00)",
        formValues,
        msPartner: {
          name: msName,
          signature: msSignature,
          date: msDate,
        },
        airtelSpoc: {
          name: spocName,
          signature: spocSignature,
          date: spocDate,
        }
      };

      let normalizedDate = date;
      if (date && date.split("/").length === 3) {
        const parts = date.split("/");
        normalizedDate = `20${parts[0]}-${parts[1]}-${parts[2]}`;
      }

      const success = await submitTelemetryLog(
        "AIRTEL_DAILY_CHECKLIST",
        metricsJson,
        normalizedDate
      );

      if (success) {
        setSaveSuccess(true);
        toast.success("Checklist saved successfully.");
        setTimeout(() => setSaveSuccess(false), 3000);
        window.print();
      } else {
        toast.error("Failed to save checklist log.");
      }
    } catch (err) {
      console.error("Submission Error:", err);
      toast.error("An unexpected error occurred during submission.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div ref={ref} className="min-h-screen w-full bg-slate-50/50 print:bg-white text-slate-800 print:text-black py-6 print:py-0">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          body {
            background-color: white !important;
            color: black !important;
            font-family: Arial, sans-serif !important;
          }
          @page {
            size: A4 portrait;
            margin: 15mm 10mm 15mm 10mm;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:border-none {
            border: none !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          .print\\:p-0 {
            padding: 0 !important;
          }
          .print\\:m-0 {
            margin: 0 !important;
          }
        }
      `}} />

      <div className="max-w-4xl mx-auto px-4 print:px-0">

        {/* Banner/Header bar: screen-only */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm mb-6 flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
          <div className="flex items-start gap-3.5">
            {selectedHistory && (
              <button
                onClick={() => setSelectedHistory(null)}
                className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-red-500 hover:bg-slate-50 transition-all cursor-pointer mr-2"
                title="Return to New entry"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-500 shrink-0 border border-red-100">
              <Printer size={22} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                Airtel Daily Checklist
                <span className="bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                  <Shield size={10} />
                  Database Connected
                </span>
                {isReadOnly && (
                  <span className="bg-red-50 text-red-700 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-red-100">
                    Saved Log
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                {isReadOnly
                  ? `Viewing saved checklist report submitted by ${selectedHistory?.technician_name || techName}.`
                  : "Fill out the daily maintenance checks and click Submit & Print to save to the database and generate the PDF."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isReadOnly && (
              <button
                onClick={handleSaveAndPrint}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Printer size={16} />
                )}
                <span>{saveSuccess ? "Saving & Printing..." : "Submit & Print"}</span>
              </button>
            )}

            {isReadOnly && (
              <button
                onClick={() => window.print()}
                className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-[0.98] cursor-pointer"
              >
                <Printer size={16} />
                <span>Print Document</span>
              </button>
            )}
          </div>
        </div>

        {/* Informational Warning Alert Box: screen-only */}
        {!isReadOnly && (
          <div className="bg-amber-50/40 border border-amber-100 rounded-2xl p-4 flex gap-3 mb-6 print:hidden items-start">
            <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] font-semibold text-amber-900 leading-relaxed">
              <strong>Database Archiving:</strong> Submitting this checklist logs the JSON record to telemetry table under asset id <code>AIRTEL_DAILY_CHECKLIST</code> for compliance tracking.
            </p>
          </div>
        )}

        {/* Printable Area Page Container */}
        <div className="bg-white border border-slate-200 print:border-none shadow-xl print:shadow-none rounded-3xl print:rounded-none p-8 md:p-12 mx-auto w-full transition-all">

          {/* Printable Document Header */}
          <div className="pb-4 mb-4">
            <div className="flex justify-between items-start">
              {/* Left Side: Header Metadata */}
              <div className="space-y-2 text-xs md:text-sm font-sans flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-gray-700 uppercase tracking-wider text-[11px] w-28 shrink-0">Name of Site:</span>
                  <input
                    type="text"
                    value={siteName}
                    disabled={isReadOnly}
                    onChange={(e) => setSiteName(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 font-bold text-slate-800 focus:outline-none focus:border-red-500 w-[200px] print:hidden"
                    placeholder="Enter site name"
                  />
                  <span className="hidden print:inline font-bold text-black border-b border-black pb-0.5 min-w-[200px]">{siteName || "______________________"}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-gray-700 uppercase tracking-wider text-[11px] w-28 shrink-0">Date:</span>
                  <input
                    type="text"
                    value={date}
                    disabled={isReadOnly}
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 font-bold text-slate-800 focus:outline-none focus:border-red-500 w-[200px] print:hidden"
                    placeholder="YY/MM/DD"
                  />
                  <span className="hidden print:inline font-bold text-black border-b border-black pb-0.5 min-w-[200px]">{date || "______________________"}</span>
                </div>

                <div className="pt-2">
                  <h3 className="font-black text-red-650 print:text-black uppercase tracking-wider text-[12px]">
                    Daily Maintenance Checkpoints:
                  </h3>
                </div>
              </div>

              {/* Right Side: Branded Airtel Logo */}
              <div className="shrink-0 flex items-center justify-end">
                <img src="/Logo.png" alt="Airtel Logo" className="h-16 print:h-20 w-auto object-contain" />
              </div>
            </div>
          </div>

          {/* Form Table Grid */}
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse border border-slate-900 text-xs font-sans">
              <thead>
                <tr className="bg-slate-50 print:bg-slate-100 text-slate-900">
                  <th className="border border-slate-900 p-2.5 text-left font-black uppercase tracking-wider w-[55%]">
                    Daily Maintenance Checkpoints
                  </th>
                  <th className="border border-slate-900 p-2.5 text-center font-black uppercase tracking-wider w-[15%]">
                    Status
                  </th>
                  <th className="border border-slate-900 p-2.5 text-left font-black uppercase tracking-wider w-[30%]">
                    Comment
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {CHECKLIST_SECTIONS.map((section) => (
                  <React.Fragment key={section.title}>
                    {/* Section Header Row */}
                    <tr className="bg-slate-100 print:bg-slate-200 text-red-700 print:text-black font-black">
                      <td colSpan={3} className="p-2 uppercase tracking-wider text-[10px] border border-slate-900 font-bold">
                        {section.title}
                      </td>
                    </tr>

                    {/* Checkpoints */}
                    {section.checkpoints.map((cp) => {
                      const val = formValues[cp.id] || { status: "OK", comment: "" };

                      return (
                        <tr key={cp.id} className="hover:bg-slate-50/30 transition-colors">
                          {/* Checkpoint text */}
                          <td className="border border-slate-900 p-2 text-slate-800 print:text-black font-medium leading-tight">
                            {cp.name}
                          </td>

                          {/* Status Picker Column */}
                          <td className="border border-slate-900 p-2 text-center">
                            <div className="flex justify-center items-center print:hidden">
                              <Select
                                value={val.status}
                                disabled={isReadOnly}
                                onValueChange={(value) => handleStatusChange(cp.id, value as "OK" | "NOT OK" | "N/A")}
                              >
                                <SelectTrigger className={`w-[90px] h-7 bg-white border text-[10px] font-black rounded-md focus:ring-1 focus:ring-red-500/20 focus:border-red-500 transition-all ${val.status === "OK"
                                    ? "border-emerald-300 text-emerald-700"
                                    : val.status === "NOT OK"
                                      ? "border-red-300 text-red-700"
                                      : "border-slate-300 text-slate-500"
                                  }`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white border border-slate-200 rounded-lg shadow-lg z-[10000]">
                                  <SelectItem value="OK" className="text-xs font-bold text-emerald-600 hover:bg-slate-50 cursor-pointer">OK</SelectItem>
                                  <SelectItem value="NOT OK" className="text-xs font-bold text-red-600 hover:bg-slate-50 cursor-pointer">NOT OK</SelectItem>
                                  <SelectItem value="N/A" className="text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer">N/A</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <span className="hidden print:inline font-bold text-xs uppercase tracking-wider">
                              {val.status}
                            </span>
                          </td>

                          {/* Comment Column */}
                          <td className="border border-slate-900 p-2">
                            <input
                              type="text"
                              value={val.comment}
                              disabled={isReadOnly}
                              onChange={(e) => handleCommentChange(cp.id, e.target.value)}
                              placeholder="Add comments..."
                              className="w-full bg-transparent border border-slate-200/50 rounded px-2 py-0.5 text-xs text-slate-800 focus:outline-none focus:border-red-400 print:hidden font-medium"
                            />
                            <p className="hidden print:block text-black font-semibold text-xs leading-normal break-words">
                              {val.comment || ""}
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer Signatures Area */}
          <div className="mt-8 pt-6">
            <div className="grid grid-cols-2 gap-12 font-sans">

              {/* MS Partner Column */}
              <div className="space-y-4">
                <p className="font-bold text-xs text-gray-900 print:text-black uppercase tracking-wider text-center">
                  MS Partner
                </p>
                <div className="space-y-3 pt-2 text-xs">
                  <div className="flex items-end gap-2">
                    <span className="font-bold text-gray-500 print:text-black w-16">Name:</span>
                    <input
                      type="text"
                      value={msName}
                      disabled={isReadOnly}
                      onChange={(e) => setMsName(e.target.value)}
                      className="border-b border-gray-300 focus:border-red-500 focus:outline-none flex-1 pb-0.5 print:hidden font-semibold text-gray-800"
                    />
                    <span className="hidden print:inline font-semibold text-black border-b border-black flex-1 min-h-[1.2rem] pb-0.5">{msName || "________________________"}</span>
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="font-bold text-gray-500 print:text-black w-16">Signature:</span>
                    <input
                      type="text"
                      value={msSignature}
                      disabled={isReadOnly}
                      onChange={(e) => setMsSignature(e.target.value)}
                      className="border-b border-gray-300 focus:border-red-500 focus:outline-none flex-1 pb-0.5 print:hidden font-semibold text-gray-800"
                    />
                    <span className="hidden print:inline font-semibold text-black border-b border-black flex-1 min-h-[1.2rem] pb-0.5">{msSignature || "________________________"}</span>
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="font-bold text-gray-500 print:text-black w-16">Date:</span>
                    <input
                      type="text"
                      value={msDate}
                      disabled={isReadOnly}
                      onChange={(e) => setMsDate(e.target.value)}
                      className="border-b border-gray-300 focus:border-red-500 focus:outline-none flex-1 pb-0.5 print:hidden font-semibold text-gray-800"
                    />
                    <span className="hidden print:inline font-semibold text-black border-b border-black flex-1 min-h-[1.2rem] pb-0.5">{msDate || "________________________"}</span>
                  </div>
                </div>
              </div>

              {/* Airtel SPOC Column */}
              <div className="space-y-4">
                <p className="font-bold text-xs text-gray-900 print:text-black uppercase tracking-wider text-center">
                  Airtel SPOC
                </p>
                <div className="space-y-3 pt-2 text-xs">
                  <div className="flex items-end gap-2">
                    <span className="font-bold text-gray-500 print:text-black w-16">Name:</span>
                    <input
                      type="text"
                      value={spocName}
                      disabled={isReadOnly}
                      onChange={(e) => setSpocName(e.target.value)}
                      className="border-b border-gray-300 focus:border-red-500 focus:outline-none flex-1 pb-0.5 print:hidden font-semibold text-gray-800"
                    />
                    <span className="hidden print:inline font-semibold text-black border-b border-black flex-1 min-h-[1.2rem] pb-0.5">{spocName || "________________________"}</span>
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="font-bold text-gray-500 print:text-black w-16">Signature:</span>
                    <input
                      type="text"
                      value={spocSignature}
                      disabled={isReadOnly}
                      onChange={(e) => setSpocSignature(e.target.value)}
                      className="border-b border-gray-300 focus:border-red-500 focus:outline-none flex-1 pb-0.5 print:hidden font-semibold text-gray-800"
                    />
                    <span className="hidden print:inline font-semibold text-black border-b border-black flex-1 min-h-[1.2rem] pb-0.5">{spocSignature || "________________________"}</span>
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="font-bold text-gray-500 print:text-black w-16">Date:</span>
                    <input
                      type="text"
                      value={spocDate}
                      disabled={isReadOnly}
                      onChange={(e) => setSpocDate(e.target.value)}
                      className="border-b border-gray-300 focus:border-red-500 focus:outline-none flex-1 pb-0.5 print:hidden font-semibold text-gray-800"
                    />
                    <span className="hidden print:inline font-semibold text-black border-b border-black flex-1 min-h-[1.2rem] pb-0.5">{spocDate || "________________________"}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>

      {/* Log list of saved copies (Desktop view style, hidden when printing or forceReadOnly unless showLogList is true) */}
      {(!forceReadOnly || props.showLogList) && !selectedHistory && (
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm mt-6 print:hidden max-w-4xl mx-auto px-4">
          <div>
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
              <CheckSquare size={13} className="text-red-500" />
              <span>Saved Daily Checklists Log</span>
            </h3>
            <p className="text-[10px] text-gray-500 mt-0.5">Technicians and Admin audit trail of all generated checklists.</p>
          </div>

          {isHistoryLoading ? (
            <div className="flex items-center gap-2 py-6 justify-center text-slate-400">
              <Loader2 className="animate-spin text-red-500" size={18} />
              <span className="text-xs font-bold uppercase tracking-wider">Syncing Checklist Records...</span>
            </div>
          ) : historyChecklists.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 border border-slate-100 rounded-2xl mt-4">
              <ShieldCheck size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">No logged checklists found</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Log checklists for recent shifts to build the audit timeline.</p>
            </div>
          ) : (
            <div className="overflow-hidden border border-slate-100 rounded-2xl mt-4">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-black text-gray-400 tracking-wider">
                    <th className="p-3">Calendar Date</th>
                    <th className="p-3">Logged By</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {historyChecklists.map((log) => {
                    return (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 font-bold text-gray-800">{log.date}</td>
                        <td className="p-3 text-slate-500">
                          <span className="font-bold text-slate-700">{log.technician_name}</span>{" "}
                          <span className="text-[10px] text-slate-400 font-mono">({log.technician_id})</span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setSelectedHistory(log)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:text-red-500 hover:border-red-100 hover:bg-red-50/30 transition-all cursor-pointer"
                          >
                            View &amp; Print
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

PrintableChecklist.displayName = "PrintableChecklist";
