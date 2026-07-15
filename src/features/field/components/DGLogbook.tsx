import { useState, useEffect, forwardRef } from "react";
import { Printer, Shield, Info, ArrowLeft, Loader2, CheckSquare, ShieldCheck } from "lucide-react";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useAuth } from "@/shared/context/AuthContext";
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
}

const PHYSICAL_CHECKS: Checkpoint[] = [
  { id: "auto_status", name: "Auto Functioning" },
  { id: "fuel_level", name: "Fuel Level (confirm capacity)" },
  { id: "leaks", name: "Check for oil/coolant/fuel leaks" },
  { id: "battery_terminals", name: "Battery terminals clean and tight" },
  { id: "noises_smoke", name: "Strange noises or heavy smoke during run" }
];

const GENERATORS_LIST = [
  { id: "dg_1", name: "Generator 1 (Built Room)" },
  { id: "dg_2", name: "Generator 2 (Built Room)" },
  { id: "dg_3", name: "Generator 3 (Container)" },
  { id: "dg_4", name: "Generator 4 (Container)" },
  { id: "dg_hq", name: "Generator HQ (Container)" }
];

export const DGLogbook = forwardRef<HTMLDivElement, any>((props, ref) => {
  const { currentSite } = useCurrentSite();
  const { employee } = useAuth();

  const { data: propData = {}, readOnly: forceReadOnly = false } = props;
  const techName = propData.technicianName || "Field Tech";

  // Form State
  const [siteName, setSiteName] = useState(propData.siteName || currentSite?.site_name || "");
  const [date, setDate] = useState(() => {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}/${mm}/${dd}`;
  });
  const [generatorId, setGeneratorId] = useState("dg_1");

  // Section 1 Parameters
  const [time_start, setTimeStart] = useState("");
  const [time_stop, setTimeStop] = useState("");
  const [hr_meter_start, setHrMeterStart] = useState<number | "">("");
  const [hr_meter_stop, setHrMeterStop] = useState<number | "">("");
  const [cumulative_hrs, setCumulativeHrs] = useState<number | "">("");
  const [run_hrs, setRunHrs] = useState("");
  const [engine_rpm, setEngineRpm] = useState<number | "">("");
  const [oil_pressure, setOilPressure] = useState<number | "">("");
  const [water_temp, setWaterTemp] = useState<number | "">("");
  // History State
  const [selectedHistory, setSelectedHistory] = useState<any | null>(null);
  const isReadOnly = forceReadOnly || selectedHistory !== null;
  const [historyChecklists, setHistoryChecklists] = useState<any[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Auto-calculate run_hrs and cumulative_hrs when inputs change
  useEffect(() => {
    if (time_start && time_stop) {
      const startParts = time_start.split(":");
      const stopParts = time_stop.split(":");
      if (startParts.length >= 2 && stopParts.length >= 2) {
        const startMin = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
        const stopMin = parseInt(stopParts[0], 10) * 60 + parseInt(stopParts[1], 10);
        if (!isNaN(startMin) && !isNaN(stopMin)) {
          const diff = stopMin - startMin;
          if (diff >= 0) {
            const hrs = Math.floor(diff / 60);
            const mins = diff % 60;
            setRunHrs(`${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`);
          } else {
            setRunHrs("");
          }
        }
      }
    } else {
      setRunHrs("");
    }
  }, [time_start, time_stop]);

  useEffect(() => {
    if (hr_meter_start !== "" && hr_meter_stop !== "") {
      const diff = Number(hr_meter_stop) - Number(hr_meter_start);
      setCumulativeHrs(diff >= 0 ? parseFloat(diff.toFixed(2)) : "");
    } else {
      setCumulativeHrs("");
    }
  }, [hr_meter_start, hr_meter_stop]);

  // Section 2 Parameters
  const [physicalChecks, setPhysicalChecks] = useState<
    Record<string, { status: "OK" | "NOT OK" | "N/A"; comment: string }>
  >(() => {
    const initial: Record<string, { status: "OK" | "NOT OK" | "N/A"; comment: string }> = {};
    PHYSICAL_CHECKS.forEach((chk) => {
      initial[chk.id] = { status: "OK", comment: "" };
    });
    return initial;
  });

  const [kwh_meter, setKwhMeter] = useState<number | "">("");
  const [daily_remarks, setDailyRemarks] = useState("");

  const handleStatusChange = (id: string, status: "OK" | "NOT OK" | "N/A") => {
    if (isReadOnly) return;
    setPhysicalChecks((prev) => ({
      ...prev,
      [id]: { ...prev[id], status }
    }));
  };

  const handleCommentChange = (id: string, comment: string) => {
    if (isReadOnly) return;
    setPhysicalChecks((prev) => ({
      ...prev,
      [id]: { ...prev[id], comment }
    }));
  };

  const fetchHistory = async () => {
    setIsHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("compliance_reports")
        .select(`
          *,
          employee:technician_id (
            full_name,
            employee_id
          )
        `)
        .eq("form_type", "DG_LOGBOOK")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data) {
        const mapped = data.map((row: any) => {
          const fData = row.form_data || {};
          return {
            id: row.id,
            created_at: row.created_at,
            technician_name: row.employee?.full_name || fData.technicianName || "Field Tech",
            technician_id: row.employee?.employee_id || fData.technicianId || "EMP-TECH",
            site_uuid: row.site_uuid,
            siteName: fData.siteName || "",
            date: fData.date || "",
            generatorId: fData.generatorId || "dg_1",
            time_start: fData.time_start || "",
            time_stop: fData.time_stop || "",
            hr_meter_start: fData.hr_meter_start ?? "",
            hr_meter_stop: fData.hr_meter_stop ?? "",
            cumulative_hrs: fData.cumulative_hrs ?? "",
            run_hrs: fData.run_hrs || "",
            engine_rpm: fData.engine_rpm ?? "",
            oil_pressure: fData.oil_pressure ?? "",
            water_temp: fData.water_temp ?? "",
            kwh_meter: fData.kwh_meter ?? "",
            physicalChecks: fData.physicalChecks || {},
            daily_remarks: fData.daily_remarks || "",
          };
        });
        setHistoryChecklists(mapped);
      }
    } catch (err) {
      console.error("Error loading compliance history:", err);
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
      setGeneratorId(selectedHistory.generatorId || "dg_1");
      setSiteName(selectedHistory.siteName || "");
      setDate(selectedHistory.date || "");
      setTimeStart(selectedHistory.time_start || "");
      setTimeStop(selectedHistory.time_stop || "");
      setHrMeterStart(selectedHistory.hr_meter_start ?? "");
      setHrMeterStop(selectedHistory.hr_meter_stop ?? "");
      setCumulativeHrs(selectedHistory.cumulative_hrs ?? "");
      setRunHrs(selectedHistory.run_hrs || "");
      setEngineRpm(selectedHistory.engine_rpm ?? "");
      setOilPressure(selectedHistory.oil_pressure ?? "");
      setWaterTemp(selectedHistory.water_temp ?? "");
      setKwhMeter(selectedHistory.kwh_meter ?? "");
      setPhysicalChecks(selectedHistory.physicalChecks || {});
      setDailyRemarks(selectedHistory.daily_remarks || "");
    } else if (forceReadOnly && propData.formValues) {
      const fVal = propData.formValues || {};
      setGeneratorId(propData.generatorId || "dg_1");
      setSiteName(propData.siteName || "NTC ZM-0874");
      setDate(propData.date || new Date().toISOString().split("T")[0]);
      setTimeStart(propData.time_start || "");
      setTimeStop(propData.time_stop || "");
      setHrMeterStart(propData.hr_meter_start ?? "");
      setHrMeterStop(propData.hr_meter_stop ?? "");
      setCumulativeHrs(propData.cumulative_hrs ?? "");
      setRunHrs(propData.run_hrs || "");
      setEngineRpm(propData.engine_rpm ?? "");
      setOilPressure(propData.oil_pressure ?? "");
      setWaterTemp(propData.water_temp ?? "");
      setKwhMeter(propData.kwh_meter ?? "");
      setPhysicalChecks(fVal.physicalChecks || {});
      setDailyRemarks(fVal.daily_remarks || "");
    } else {
      const initial: Record<string, { status: "OK" | "NOT OK" | "N/A"; comment: string }> = {};
      PHYSICAL_CHECKS.forEach((chk) => {
        initial[chk.id] = { status: "OK", comment: "" };
      });
      setPhysicalChecks(initial);
      setGeneratorId("dg_1");
      setSiteName(propData.siteName || currentSite?.site_name || "");
      setDate(() => {
        const d = new Date();
        const yy = String(d.getFullYear()).slice(-2);
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yy}/${mm}/${dd}`;
      });
      setTimeStart("");
      setTimeStop("");
      setRunHrs("");
      setHrMeterStart("");
      setHrMeterStop("");
      setCumulativeHrs("");
      setEngineRpm("");
      setOilPressure("");
      setWaterTemp("");
      setKwhMeter("");
      setDailyRemarks("");
    }
  }, [selectedHistory, forceReadOnly, propData, currentSite]);

  const handleSaveAndPrint = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const formData = {
        siteName,
        date,
        generatorId,
        time_start,
        time_stop,
        hr_meter_start: hr_meter_start === "" ? null : Number(hr_meter_start),
        hr_meter_stop: hr_meter_stop === "" ? null : Number(hr_meter_stop),
        cumulative_hrs: cumulative_hrs === "" ? null : Number(cumulative_hrs),
        run_hrs: run_hrs === "" ? null : run_hrs,
        engine_rpm: engine_rpm === "" ? null : Number(engine_rpm),
        oil_pressure: oil_pressure === "" ? null : Number(oil_pressure),
        water_temp: water_temp === "" ? null : Number(water_temp),
        kwh_meter: kwh_meter === "" ? null : Number(kwh_meter),
        physicalChecks,
        daily_remarks,
        technicianName: employee?.full_name || techName,
        technicianId: employee?.employee_id || "EMP-TECH"
      };

      const { error } = await supabase
        .from("compliance_reports")
        .insert([{
          form_type: 'DG_LOGBOOK',
          form_data: formData,
          technician_id: employee?.id || null,
          site_uuid: employee?.site_uuid || currentSite?.id || null
        }]);

      if (error) throw error;

      setSaveSuccess(true);
      toast.success("Generator log saved to compliance logs successfully.");
      setTimeout(() => setSaveSuccess(false), 3000);
      window.print();
    } catch (err) {
      console.error("Submission Error:", err);
      toast.error("An unexpected error occurred during submission.");
    } finally {
      setIsSaving(false);
    }
  };

  const getGeneratorLabel = (id: string) => {
    return GENERATORS_LIST.find((dg) => dg.id === id)?.name || id;
  };

  return (
    <div ref={ref} className="min-h-screen w-full bg-slate-50/50 print:bg-white text-slate-800 print:text-black py-6 print:py-0">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body {
            background-color: white !important;
            color: black !important;
            font-family: Arial, sans-serif !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm 10mm 10mm 10mm;
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
                Diesel Generator Logbook
                <span className="bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                  <Shield size={10} />
                  Compliance Report
                </span>
                {isReadOnly && (
                  <span className="bg-red-50 text-red-700 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-red-100">
                    Saved Log
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                {isReadOnly 
                  ? `Viewing saved compliance logbook submitted by ${selectedHistory?.technician_name || techName}.`
                  : "Fill out the engine runsheet parameters and click Submit & Print to save to the compliance reports database."}
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
              <strong>Compliance Archiving:</strong> Submitting this logbook saves the JSON record to the <code>compliance_reports</code> table under <code>DG_LOGBOOK</code> for audit reconciliation.
            </p>
          </div>
        )}

        {/* Printable Area Page Container */}
        <div className="bg-white border border-slate-200 print:border-none shadow-xl print:shadow-none rounded-3xl print:rounded-none p-8 md:p-12 mx-auto w-full transition-all">
          
          {/* Printable Document Header */}
          <div className="pb-4 mb-4 border-b border-slate-900">
            <div className="flex justify-between items-start">
              {/* Left Side: Header Metadata */}
              <div className="space-y-2 text-xs md:text-sm font-sans flex-1">
                <div className="text-[14px] font-black text-red-650 print:text-black uppercase tracking-widest mb-2">
                  DIESEL GENERATOR LOGBOOK
                </div>
                
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-gray-700 uppercase tracking-wider text-[11px] w-28 shrink-0">Site Name:</span>
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

                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-gray-700 uppercase tracking-wider text-[11px] w-28 shrink-0">Generator ID:</span>
                  <div className="print:hidden">
                    <Select
                      value={generatorId}
                      disabled={isReadOnly}
                      onValueChange={setGeneratorId}
                    >
                      <SelectTrigger className="w-[200px] h-8 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-lg focus:ring-1 focus:ring-red-500/20 focus:border-red-500">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-slate-200 rounded-lg shadow-lg z-[10000]">
                        {GENERATORS_LIST.map((dg) => (
                          <SelectItem key={dg.id} value={dg.id} className="text-xs font-semibold text-gray-900 cursor-pointer">
                            {dg.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="hidden print:inline font-bold text-black border-b border-black pb-0.5 min-w-[200px]">{getGeneratorLabel(generatorId)}</span>
                </div>
              </div>

              {/* Right Side: Branded Airtel Logo */}
              <div className="shrink-0 flex items-center justify-end">
                <img src="/Logo.png" alt="Airtel Logo" className="h-16 print:h-20 w-auto object-contain" />
              </div>
            </div>
          </div>

          {/* Section 1: Engine Parameters */}
          <div className="mb-6">
            <h3 className="font-black text-red-650 print:text-black uppercase tracking-wider text-[12px] mb-3">
              Section 1 - Time &amp; Engine Parameters
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-slate-900 p-4 rounded-xl print:rounded-none text-xs font-sans">
              
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Time Start (time_start)</label>
                <input
                  type="text"
                  value={time_start}
                  disabled={isReadOnly}
                  onChange={(e) => setTimeStart(e.target.value)}
                  placeholder="e.g. 08:30"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-800 focus:outline-none focus:border-red-500 print:bg-transparent print:border-none print:px-0 print:py-0 print:border-b print:border-black"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Time Stop (time_stop)</label>
                <input
                  type="text"
                  value={time_stop}
                  disabled={isReadOnly}
                  onChange={(e) => setTimeStop(e.target.value)}
                  placeholder="e.g. 11:30"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-800 focus:outline-none focus:border-red-500 print:bg-transparent print:border-none print:px-0 print:py-0 print:border-b print:border-black"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Hour Meter Start (hr_meter_start)</label>
                <input
                  type="number"
                  step="any"
                  value={hr_meter_start}
                  disabled={isReadOnly}
                  onChange={(e) => setHrMeterStart(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Hour meter start reading"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-800 focus:outline-none focus:border-red-500 print:bg-transparent print:border-none print:px-0 print:py-0 print:border-b print:border-black"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Hour Meter Stop (hr_meter_stop)</label>
                <input
                  type="number"
                  step="any"
                  value={hr_meter_stop}
                  disabled={isReadOnly}
                  onChange={(e) => setHrMeterStop(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Hour meter stop reading"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-800 focus:outline-none focus:border-red-500 print:bg-transparent print:border-none print:px-0 print:py-0 print:border-b print:border-black"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Hrs. Run (time_stop - time_start)</label>
                <input
                  type="text"
                  value={run_hrs}
                  disabled={true}
                  placeholder="Calculated automatically"
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-700 focus:outline-none print:bg-transparent print:border-none print:px-0 print:py-0 print:border-b print:border-black"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Cumulative Run Hrs (stop - start)</label>
                <input
                  type="number"
                  step="any"
                  value={cumulative_hrs}
                  disabled={true}
                  placeholder="Calculated automatically"
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-700 focus:outline-none print:bg-transparent print:border-none print:px-0 print:py-0 print:border-b print:border-black"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Engine Speed RPM (engine_rpm)</label>
                <input
                  type="number"
                  value={engine_rpm}
                  disabled={isReadOnly}
                  onChange={(e) => setEngineRpm(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="RPM (e.g. 1500)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-800 focus:outline-none focus:border-red-500 print:bg-transparent print:border-none print:px-0 print:py-0 print:border-b print:border-black"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Oil Pressure Bar (oil_pressure)</label>
                <input
                  type="number"
                  step="any"
                  value={oil_pressure}
                  disabled={isReadOnly}
                  onChange={(e) => setOilPressure(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Oil pressure in Bar"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-800 focus:outline-none focus:border-red-500 print:bg-transparent print:border-none print:px-0 print:py-0 print:border-b print:border-black"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Water Temp °C (water_temp)</label>
                <input
                  type="number"
                  step="any"
                  value={water_temp}
                  disabled={isReadOnly}
                  onChange={(e) => setWaterTemp(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Engine temp in °C"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-800 focus:outline-none focus:border-red-500 print:bg-transparent print:border-none print:px-0 print:py-0 print:border-b print:border-black"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">KWH Meter (kwh_meter)</label>
                <input
                  type="number"
                  step="any"
                  value={kwh_meter}
                  disabled={isReadOnly}
                  onChange={(e) => setKwhMeter(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="KWH reading"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-800 focus:outline-none focus:border-red-500 print:bg-transparent print:border-none print:px-0 print:py-0 print:border-b print:border-black"
                />
              </div>

            </div>
          </div>

          {/* Section 2: Physical Checks */}
          <div className="mb-6">
            <h3 className="font-black text-red-650 print:text-black uppercase tracking-wider text-[12px] mb-3">
              Section 2 - Physical Checks
            </h3>

            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full border-collapse border border-slate-900 text-xs font-sans">
                <thead>
                  <tr className="bg-slate-50 print:bg-slate-100 text-slate-900">
                    <th className="border border-slate-900 p-2.5 text-left font-black uppercase tracking-wider w-[55%]">
                      Generator Parameters
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
                  {PHYSICAL_CHECKS.map((chk) => {
                    const val = physicalChecks[chk.id] || { status: "OK", comment: "" };

                    return (
                      <tr key={chk.id} className="hover:bg-slate-50/30 transition-colors">
                        {/* Check name */}
                        <td className="border border-slate-900 p-2 text-slate-800 print:text-black font-medium leading-tight">
                          {chk.name}
                        </td>

                        {/* Status Column */}
                        <td className="border border-slate-900 p-2 text-center">
                          <div className="flex justify-center items-center print:hidden">
                            <Select
                              value={val.status}
                              disabled={isReadOnly}
                              onValueChange={(value) => handleStatusChange(chk.id, value as "OK" | "NOT OK" | "N/A")}
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
                            disabled={isReadOnly}
                            onChange={(e) => handleCommentChange(chk.id, e.target.value)}
                            placeholder="Add remarks/comments..."
                            className="w-full bg-transparent border border-slate-200/50 rounded px-2 py-0.5 text-xs text-slate-800 focus:outline-none focus:border-red-400 print:hidden font-medium"
                          />
                          <p className="hidden print:block text-black font-semibold text-xs leading-normal break-words">
                            {val.comment || ""}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Remarks */}
          <div className="mb-6">
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">Remarks (daily_remarks)</label>
            <textarea
              value={daily_remarks}
              disabled={isReadOnly}
              onChange={(e) => setDailyRemarks(e.target.value)}
              placeholder="Enter daily remarks/abnormalities here..."
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-red-500 print:hidden"
            />
            <p className="hidden print:block text-xs font-semibold text-black whitespace-pre-wrap border border-slate-900 p-3 min-h-[4rem]">
              {daily_remarks || "No daily remarks logged."}
            </p>
          </div>

          {/* Footer Signatures Area */}
          <div className="mt-8 pt-6 border-t border-dashed border-slate-350">
            <div className="grid grid-cols-2 gap-12 font-sans">
              
              {/* Technician Signature */}
              <div className="text-center space-y-8">
                <div className="border-b border-black pb-1 mx-auto max-w-[200px] min-h-[2rem]" />
                <p className="font-bold text-xs text-gray-900 print:text-black uppercase tracking-wider">
                  Technician Signature
                </p>
              </div>

              {/* Supervisor Signature */}
              <div className="text-center space-y-8">
                <div className="border-b border-black pb-1 mx-auto max-w-[200px] min-h-[2rem]" />
                <p className="font-bold text-xs text-gray-900 print:text-black uppercase tracking-wider">
                  Supervisor Signature
                </p>
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
              <span>Saved Generator Logbooks Log</span>
            </h3>
            <p className="text-[10px] text-gray-500 mt-0.5">Technicians and Admin audit trail of all generated generator logbooks.</p>
          </div>

          {isHistoryLoading ? (
            <div className="flex items-center gap-2 py-6 justify-center text-slate-400">
              <Loader2 className="animate-spin text-red-500" size={18} />
              <span className="text-xs font-bold uppercase tracking-wider">Syncing Compliance Records...</span>
            </div>
          ) : historyChecklists.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 border border-slate-100 rounded-2xl mt-4">
              <ShieldCheck size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">No logged generator logbooks found</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Log logbooks to build the audit timeline.</p>
            </div>
          ) : (
            <div className="overflow-hidden border border-slate-100 rounded-2xl mt-4">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-black text-gray-400 tracking-wider">
                    <th className="p-3">Calendar Date</th>
                    <th className="p-3">Generator ID</th>
                    <th className="p-3">Logged By</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {historyChecklists.map((log) => {
                    return (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 font-bold text-gray-800">{log.date}</td>
                        <td className="p-3 font-bold text-slate-700">{getGeneratorLabel(log.generatorId)}</td>
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

DGLogbook.displayName = "DGLogbook";
export default DGLogbook;
