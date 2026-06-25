import React, { useState, forwardRef } from "react";

// Using forwardRef so a parent component can trigger the print action on this specific div
export const PrintableChecklist = forwardRef<HTMLDivElement, any>((props, ref) => {
  // Mock data for the printout (will be replaced by live data in Phase 3)
  const reportData = props.data || {};
  const siteName = reportData.siteName || "NTC ZM-0874";
  const date = reportData.date || new Date().toLocaleDateString();
  const shift = reportData.shift || "DAY SHIFT";

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

  const [checklistValues, setChecklistValues] = useState<Record<string, { status: string; comment: string }>>({});

  const handleStatusChange = (itemId: string, value: string) => {
    setChecklistValues((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        status: value,
      },
    }));
  };

  const handleCommentChange = (itemId: string, value: string) => {
    setChecklistValues((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        comment: value,
      },
    }));
  };

  return (
    <div className="hidden print:block">
      <div ref={ref} className="w-[210mm] min-h-[297mm] p-8 mx-auto bg-white text-black font-sans text-sm">
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
              Date: <span className="font-normal border-b border-black inline-block w-32 text-center">{date}</span>
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
                        <select
                          className="w-full appearance-none bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                          value={currentStatus}
                          onChange={(e) => handleStatusChange(item.id, e.target.value)}
                        >
                          <option value="" disabled className="text-slate-400">
                            Select status...
                          </option>
                          <option value="OK" className="text-emerald-600 dark:text-emerald-400 font-medium">
                            OK
                          </option>
                          <option value="NOT OK" className="text-rose-600 dark:text-rose-400 font-medium">
                            NOT OK
                          </option>
                          <option value="N/A" className="text-slate-500 dark:text-slate-400 font-medium">
                            N/A
                          </option>
                        </select>
                      </td>
                      <td className="border border-black p-2">
                        <input
                          type="text"
                          className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-500 focus:ring-1 rounded px-2 py-1 text-sm text-slate-900 dark:text-slate-100 outline-none print:border-none print:p-0 print:text-black"
                          value={currentComment}
                          onChange={(e) => handleCommentChange(item.id, e.target.value)}
                          placeholder="Add comment..."
                        />
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
            <div className="border-b border-black w-64"></div>
          </div>
          <div>
            <p className="font-semibold mb-8">NOC / Admin Signature:</p>
            <div className="border-b border-black w-64"></div>
          </div>
        </div>
      </div>
    </div>
  );
});

PrintableChecklist.displayName = "PrintableChecklist";
