import React, { useState, useEffect, forwardRef } from "react";
import { Download, Save, ArrowLeft, Loader2, Calendar as CalendarIcon, CheckSquare, ShieldCheck } from "lucide-react";
import { useDailyChecklists } from "../hooks/useDailyChecklists";

// Using forwardRef so a parent component can trigger the print action on this specific div
export const PrintableChecklist = forwardRef<HTMLDivElement, any>((props, ref) => {
  const { data: propData = {}, readOnly: forceReadOnly = false } = props;
  const siteName = propData.siteName || "NTC ZM-0874";
  
  const techName = propData.technicianName || "Field Tech";
  const techId = propData.technicianId || "EMP-TECH";

  const { checklists, isLoading, saveChecklist } = useDailyChecklists();

  // State to manage if we are viewing a historical checklist log
  const [selectedHistory, setSelectedHistory] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Core checklist inputs state
  const [checklistValues, setChecklistValues] = useState<Record<string, { status: string; comment: string }>>({});
  const [shift, setShift] = useState("DAY SHIFT");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  // If a historical report is selected or we are forced read-only from props
  const isReadOnly = forceReadOnly || selectedHistory !== null;

  // Sync state if history selected or if props override it (like for admin view)
  useEffect(() => {
    if (selectedHistory) {
      setChecklistValues(selectedHistory.checklist_values || {});
      setShift(selectedHistory.shift || "DAY SHIFT");
      const histDate = new Date(selectedHistory.target_hour).toISOString().split("T")[0];
      setDate(histDate);
    } else if (forceReadOnly && propData.checklist_values) {
      setChecklistValues(propData.checklist_values || {});
      setShift(propData.shift || "DAY SHIFT");
      setDate(propData.date || new Date().toISOString().split("T")[0]);
    } else {
      // Clear or default for new entry
      setChecklistValues({});
      setShift("DAY SHIFT");
      setDate(new Date().toISOString().split("T")[0]);
    }
  }, [selectedHistory, forceReadOnly, propData]);

  const categories = [
    {
      title: "Transformer/AVR",
      items: [
        { id: "trans-temp", text: "Transformer temperature (Acceptable Range: 85°C-90°C)" },
        { id: "trans-breakers", text: "Transformer HT/LT breakers \"ON\" and have no signs of damages" },
        { id: "trans-grid", text: "Verify grid voltage, and confirm the tolerance (380-410 Volts)" },
        { id: "trans-avr", text: "Confirm AVR input/output voltage, current, and frequency are normal" },
        { id: "trans-dust", text: "AVR voltage columns for dust accumulation" },
        { id: "trans-spd", text: "SPD type 1 & 2 is status (not damaged)" }
      ]
    },
    {
      title: "Switchboard/ATS",
      items: [
        { id: "ats-relays", text: "Relays & Contactors electro-mechanical components are not damaged" },
        { id: "ats-fuses", text: "Voltage Monitoring (OV/UV) / Control Boards/Control power fuses not blown" },
        { id: "ats-ups", text: "Verify ATS Control small UPS is working with healthy (~24V)" }
      ]
    },
    {
      title: "Generators & Fuel",
      items: [
        { id: "gen-alarms", text: "Check for active alarms on the control panel." },
        { id: "gen-auto", text: "Generator on auto mode and emergency button not pushed in" },
        { id: "gen-batt", text: "Starting Batteries: (~24V) connections are not loosened, corrosion or with sulfate buildup" },
        { id: "gen-fuel", text: "Verify fuel tank levels are at target capacity" },
        { id: "gen-oil", text: "Verify Oil & Coolant level / Start generators on manual mode with \"No load\"" }
      ]
    },
    {
      title: "Cooling Systems",
      items: [
        { id: "cool-alarms", text: "Check for active alarms / Check cooling units status and temp/humidity setpoints (~21C/~45%)" },
        { id: "cool-leaks", text: "Inspect for visible water leaks or condensation puddles." },
        { id: "cool-compressors", text: "Compressors: \"ON\" and working without overheating" },
        { id: "cool-belts", text: "Blower Belts: Not broken, no stretch or cracks" },
        { id: "cool-fans", text: "External Fan/Blower Motors: Running and rotating properly" }
      ]
    },
    {
      title: "UPS & Batteries",
      items: [
        { id: "ups-status", text: "Verify status is \"Normal\" (no active alarms/bypass modes/Input Breaker 'ON')." },
        { id: "ups-load", text: "Verify each module is properly working and carrying load" },
        { id: "ups-telemetry", text: "Verify input/output voltage, current, and frequency from telemetry." },
        { id: "ups-visual", text: "Visual batteries inspection for obvious bloating, leakage, or corrosion." },
        { id: "ups-breaker", text: "Verify batteries breaker \"ON\"" }
      ]
    },
    {
      title: "Rectifier & Batteries",
      items: [
        { id: "rect-status", text: "Verify status is \"Normal\" (no active alarms/bypass modes/Input Breaker 'ON')." },
        { id: "rect-load", text: "Verify each module is properly working and carrying load" },
        { id: "rect-visual", text: "Visual batteries inspection for obvious bloating, leakage, or corrosion." },
        { id: "rect-cables", text: "Check DC busbar and batteries cables connectors don't overheat or burnt" }
      ]
    },
    {
      title: "Fire Suppression, Detection, CCTV & Access Control",
      items: [
        { id: "sec-alarms", text: "Verify no Active Alarms on the Control Panel" },
        { id: "sec-cylinders", text: "Verify pressure level for the cylinders" }
      ]
    }
  ];

  const handleStatusChange = (itemId: string, value: string) => {
    if (isReadOnly) return;
    setChecklistValues((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        status: value,
      },
    }));
  };

  const handleCommentChange = (itemId: string, value: string) => {
    if (isReadOnly) return;
    setChecklistValues((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        comment: value,
      },
    }));
  };

  const handleSaveAndPrint = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await saveChecklist({
        dateStr: date,
        shift,
        technician_name: techName,
        technician_id: techId,
        values: checklistValues
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      window.print();
    } catch (err) {
      alert("Failed to save checklist to database. Please check your connection.");
    } finally {
      setIsSaving(false);
    }
  };

  const formatDisplayDate = (dStr: string) => {
    const d = new Date(dStr);
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 print:space-y-0 pb-16">
      {/* Action Header (Hidden when printing) */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden animate-fade-in">
        <div className="flex items-center gap-3">
          {selectedHistory && (
            <button
              onClick={() => setSelectedHistory(null)}
              className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-red-500 hover:bg-slate-50 transition-all cursor-pointer"
              title="Return to New entry"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div>
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
              <span>Maintenance Report Generator</span>
              {isReadOnly && (
                <span className="bg-red-50 text-red-700 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-red-100">
                  Read Only / Saved Log
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isReadOnly 
                ? `Viewing official logged report submitted by ${selectedHistory?.technician_name || techName}.`
                : "Fill in the daily maintenance checks and click print to archive and generate the signed PDF."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isReadOnly && (
            <button
              type="button"
              onClick={handleSaveAndPrint}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider active:scale-[0.98] transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              <span>{saveSuccess ? "Archived & Printing..." : "Save & Print PDF"}</span>
            </button>
          )}

          {isReadOnly && (
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider active:scale-[0.98] transition-all shadow-md cursor-pointer"
            >
              <Download size={14} />
              <span>Print / Save PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Date & Shift Selector for Entry Mode (Hidden when printing) */}
      {!isReadOnly && (
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm grid grid-cols-2 gap-4 print:hidden">
          <div className="space-y-1">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Checklist Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:outline-none focus:border-red-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Shift Name</label>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:outline-none focus:border-red-500"
            >
              <option value="DAY SHIFT">DAY SHIFT</option>
              <option value="NIGHT SHIFT">NIGHT SHIFT</option>
              <option value="SWING SHIFT">SWING SHIFT</option>
            </select>
          </div>
        </div>
      )}

      {/* Printable Sheet Wrapper (Scrollable on mobile) */}
      <div className="w-full overflow-x-auto bg-white sm:rounded-3xl sm:border sm:border-gray-100 sm:shadow-sm p-4 sm:p-8 print:p-0 print:border-none print:shadow-none print:rounded-none">
        <div ref={ref} className="w-[210mm] min-h-[297mm] mx-auto bg-white text-black font-sans text-sm print:w-full print:p-0 print:mx-0">
          {/* Header Section */}
          <div className="flex justify-between items-end border-b-2 border-black pb-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold font-serif uppercase">{shift}</h1>
              <h2 className="text-lg font-semibold mt-2">
                Name of Site: <span className="font-normal border-b border-black inline-block w-48">{siteName}</span>
              </h2>
            </div>
            <div className="text-right">
              <h2 className="text-lg font-semibold">
                Date: <span className="font-normal border-b border-black inline-block w-48 text-center">{formatDisplayDate(date)}</span>
              </h2>
            </div>
          </div>

          <h3 className="text-xl font-bold mb-4">Daily Maintenance Checkpoints:</h3>

          {/* Master Table */}
          <table className="w-full border-collapse border border-black text-xs">
            <thead>
              <tr className="bg-gray-200 print:bg-gray-200">
                <th className="w-[60%] border border-black p-2 text-left font-bold">Task / Equipment</th>
                <th className="w-[15%] border border-black p-2 text-left font-bold">Status</th>
                <th className="w-[25%] border border-black p-2 text-left font-bold">Comment</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat, catIdx) => (
                <React.Fragment key={catIdx}>
                  {/* Sub-header row */}
                  <tr className="bg-gray-100 print:bg-gray-100 font-bold">
                    <td colSpan={3} className="border border-black p-2 text-left uppercase tracking-wider text-[11px] font-black">
                      {cat.title}
                    </td>
                  </tr>
                  {/* Items rows */}
                  {cat.items.map((item) => {
                    const currentStatus = checklistValues[item.id]?.status || "";
                    const currentComment = checklistValues[item.id]?.comment || "";

                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="border border-black p-2 leading-relaxed">{item.text}</td>
                        <td className="border border-black p-2 text-center text-gray-500 font-mono">
                          {isReadOnly ? (
                            <span className={`font-bold ${currentStatus === 'OK' ? 'text-green-600' : 'text-red-500'}`}>
                              {currentStatus || "—"}
                            </span>
                          ) : (
                            <select
                              className="w-full appearance-none bg-white border border-slate-300 rounded-md px-2 py-1 text-xs text-slate-900 focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
                              value={currentStatus}
                              onChange={(e) => handleStatusChange(item.id, e.target.value)}
                            >
                              <option value="" disabled>
                                Select...
                              </option>
                              <option value="OK">OK</option>
                              <option value="NOT OK">NOT OK</option>
                              <option value="N/A">N/A</option>
                            </select>
                          )}
                        </td>
                        <td className="border border-black p-2">
                          {isReadOnly ? (
                            <span className="text-gray-700 italic">{currentComment || "—"}</span>
                          ) : (
                            <input
                              type="text"
                              className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-red-500 focus:ring-0 rounded px-2 py-1 text-xs text-slate-900 outline-none"
                              value={currentComment}
                              onChange={(e) => handleCommentChange(item.id, e.target.value)}
                              placeholder="Add comment..."
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {/* Signature Footer */}
          <div className="mt-12 pt-8 border-t border-gray-400 flex justify-between">
            <div>
              <p className="font-semibold mb-8">Technician Name & Signature:</p>
              <p className="font-bold text-xs text-gray-600 underline decoration-dotted mb-1">{isReadOnly ? (selectedHistory?.technician_name || techName) : techName}</p>
              <div className="border-b border-black w-64"></div>
            </div>
            <div>
              <p className="font-semibold mb-8">NOC / Admin Signature:</p>
              <div className="border-b border-black w-64"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Log list of saved copies (Desktop view style, hidden when printing or forceReadOnly) */}
      {(!forceReadOnly || props.showLogList) && !selectedHistory && (
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4 print:hidden">
          <div>
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
              <CheckSquare size={13} className="text-red-500" />
              <span>Saved Daily Checklists Log</span>
            </h3>
            <p className="text-[10px] text-gray-500 mt-0.5">Technicians and Admin audit trail of all generated checklists.</p>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-6 justify-center text-slate-400">
              <Loader2 className="animate-spin text-red-500" size={18} />
              <span className="text-xs font-bold uppercase tracking-wider">Syncing Checklist Records...</span>
            </div>
          ) : checklists.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 border border-slate-100 rounded-2xl">
              <ShieldCheck size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">No logged checklists found</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Log checklists for recent shifts to build the audit timeline.</p>
            </div>
          ) : (
            <div className="overflow-hidden border border-slate-100 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-black text-gray-400 tracking-wider">
                    <th className="p-3">Calendar Date</th>
                    <th className="p-3">Shift</th>
                    <th className="p-3">Logged By</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {checklists.map((log) => {
                    const rowDate = new Date(log.target_hour).toISOString().split("T")[0];
                    return (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 font-bold text-gray-800">{formatDisplayDate(rowDate)}</td>
                        <td className="p-3 font-semibold text-slate-500">{log.shift}</td>
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
