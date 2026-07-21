import React, { useState } from "react";
import { Printer, Shield, Info, Save, Loader2, CheckCircle } from "lucide-react";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useAuth } from "@/shared/context/AuthContext";
import { useDailyChecklists } from "../hooks/useDailyChecklists";
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

export function DailyChecklist() {
  const { currentSite } = useCurrentSite();
  const { employee } = useAuth();
  const { saveChecklist } = useDailyChecklists();
  const [isSaving, setIsSaving] = useState(false);
  
  // Fillable form state
  const [siteName, setSiteName] = useState(currentSite?.site_name || "NTC-ZM-0874");
  const [date, setDate] = useState(() => {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}/${mm}/${dd}`;
  });

  // State to hold status and comment for each checkpoint
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

  // Footer state prefilled from employee
  const [msName, setMsName] = useState(employee?.full_name || "");
  const [msSignature, setMsSignature] = useState(employee?.full_name ? `${employee.full_name.split(' ')[0]}_signed` : "");
  const [msDate, setMsDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [spocName, setSpocName] = useState("");
  const [spocSignature, setSpocSignature] = useState("");
  const [spocDate, setSpocDate] = useState("");

  const handleStatusChange = (id: string, status: "OK" | "NOT OK" | "N/A") => {
    setFormValues((prev) => ({
      ...prev,
      [id]: { ...prev[id], status }
    }));
  };

  const handleCommentChange = (id: string, comment: string) => {
    setFormValues((prev) => ({
      ...prev,
      [id]: { ...prev[id], comment }
    }));
  };

  const handleMarkAllOk = () => {
    setFormValues((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((key) => {
        updated[key] = { ...updated[key], status: "OK" };
      });
      return updated;
    });
    toast.success("All checkpoints marked OK!");
  };

  const handleArchive = async () => {
    setIsSaving(true);
    try {
      const todayIso = new Date().toISOString().split('T')[0];
      await saveChecklist({
        dateStr: todayIso,
        shift: "DAY SHIFT (08:00 - 18:00)",
        technician_name: msName || employee?.full_name || "Field Engineer",
        technician_id: employee?.id || "EMP-TECH",
        values: formValues
      });
      toast.success("Airtel Daily Checklist saved & archived to database under AIRTEL_DAILY_CHECKLIST!");
    } catch (err: any) {
      toast.error("Failed to archive checklist: " + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50/50 print:bg-white text-slate-800 print:text-black py-6 print:py-0">
      <style dangerouslySetInnerHTML={{ __html: `
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
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-500 shrink-0 border border-red-100">
              <Shield size={22} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                Airtel Daily Checklist
                <span className="bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                  AIRTEL_DAILY_CHECKLIST
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                Fill out the checkpoint statuses and comments below, then submit to archive the record to the database for compliance tracking.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleMarkAllOk}
              type="button"
              className="flex items-center justify-center gap-1.5 px-3.5 py-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition-all border border-emerald-200 cursor-pointer"
              title="Set all checkpoint statuses to OK"
            >
              <CheckCircle size={15} />
              <span>Mark All OK</span>
            </button>
            <button
              onClick={handleArchive}
              disabled={isSaving}
              type="button"
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-[0.98] cursor-pointer shrink-0 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Archiving…</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Submit & Archive</span>
                </>
              )}
            </button>
            <button
              onClick={() => window.print()}
              type="button"
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-[0.98] cursor-pointer shrink-0"
            >
              <Printer size={16} />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Informational Warning Alert Box: screen-only */}
        <div className="bg-amber-50/40 border border-amber-100 rounded-2xl p-4 flex gap-3 mb-6 print:hidden items-start">
          <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] font-semibold text-amber-900 leading-relaxed">
            <strong>Print Record:</strong> This page is designed to print clean compliance records with custom formatting, hiding control buttons.
          </p>
        </div>

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
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 font-bold text-slate-800 focus:outline-none focus:border-red-500 w-[200px] print:hidden"
                    placeholder="YY/MM/DD"
                  />
                  <span className="hidden print:inline font-bold text-black border-b border-black pb-0.5 min-w-[200px]">{date || "______________________"}</span>
                </div>

                <div className="pt-2">
                  <h3 className="font-black text-red-600 print:text-black uppercase tracking-wider text-[12px]">
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
                                onValueChange={(value) => handleStatusChange(cp.id, value as "OK" | "NOT OK" | "N/A")}
                              >
                                <SelectTrigger className={`w-[90px] h-7 bg-white border text-[10px] font-black rounded-md focus:ring-1 focus:ring-red-500/20 focus:border-red-500 transition-all ${
                                  val.status === "OK" 
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
                              onChange={(e) => handleCommentChange(cp.id, e.target.value)}
                              placeholder="Add comments..."
                              className="w-full bg-transparent border border-slate-200/50 roundedpx-2 py-0.5 text-xs text-slate-800 focus:outline-none focus:border-red-400 print:hidden font-medium"
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
    </div>
  );
}
