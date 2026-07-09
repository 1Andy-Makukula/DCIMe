import React, { useState, useEffect, useMemo, forwardRef } from "react";
import { Download, Save, ArrowLeft, Loader2, CheckSquare, ShieldCheck } from "lucide-react";
import { useDailyChecklists } from "../hooks/useDailyChecklists";
import { useSiteEquipment } from "../hooks/useSiteEquipment";
import { useOfflineSync } from "../hooks/useOfflineSync";
import { toast } from "sonner";

// Using forwardRef so a parent component can trigger the print action on this specific div
export const PrintableChecklist = forwardRef<HTMLDivElement, any>((props, ref) => {
  const { isOnline, pendingCount } = useOfflineSync();
  const { data: propData = {}, readOnly: forceReadOnly = false } = props;
  const siteName = propData.siteName || "NTC ZM-0874";
  
  const techName = propData.technicianName || "Field Tech";
  const techId = propData.technicianId || "EMP-TECH";

  const { checklists, isLoading, saveChecklist } = useDailyChecklists();
  const { groupedEquipment, isLoading: isEquipmentLoading } = useSiteEquipment();

  // State to manage if we are viewing a historical checklist log
  const [selectedHistory, setSelectedHistory] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Focus Mode: Room Pagination ─────────────────────────────────────────────
  const [currentRoomIndex, setCurrentRoomIndex] = useState(0);

  const roomEntries = useMemo(
    () => Object.entries(groupedEquipment),
    [groupedEquipment]
  );

  // Reset index when equipment reloads (e.g. site switch)
  useEffect(() => {
    setCurrentRoomIndex(0);
  }, [groupedEquipment]);

  // Core checklist inputs state
  const [checklistValues, setChecklistValues] = useState<Record<string, { status: string; comment: string }>>({});
  const [shift, setShift] = useState("DAY SHIFT (08:00 - 18:00)");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  // If a historical report is selected or we are forced read-only from props
  const isReadOnly = forceReadOnly || selectedHistory !== null;

  // Sync state if history selected or if props override it (like for admin view)
  useEffect(() => {
    if (selectedHistory) {
      setChecklistValues(selectedHistory.checklist_values || {});
      setShift(selectedHistory.shift || "DAY SHIFT (08:00 - 18:00)");
      const histDate = new Date(selectedHistory.target_hour).toISOString().split("T")[0];
      setDate(histDate);
    } else if (forceReadOnly && propData.checklist_values) {
      setChecklistValues(propData.checklist_values || {});
      setShift(propData.shift || "DAY SHIFT (08:00 - 18:00)");
      setDate(propData.date || new Date().toISOString().split("T")[0]);
    } else {
      // Clear or default for new entry
      setChecklistValues({});
      setShift(props.data?.shift || "DAY SHIFT (08:00 - 18:00)");
      setDate(new Date().toISOString().split("T")[0]);
    }
  }, [selectedHistory, forceReadOnly, propData]);

  // Hardcoded categories removed for dynamic multi-tenant useSiteEquipment registry

  const handleStatusChange = (itemId: string, value: string) => {
    if (isReadOnly) return;
    
    const prevValues = { ...checklistValues };

    setChecklistValues((prev) => {
      const next = {
        ...prev,
        [itemId]: {
          ...(prev[itemId] || {}),
          status: value,
        },
      };

      // Strip parameter values if this item itself is a newly offline equipment
      const allEquip = Object.values(groupedEquipment).flat();
      const eqObj = allEquip.find((eq) => eq.equipment_id === itemId);
      if (eqObj && value === "OFFLINE") {
        const params = eqObj.equipment_parameters || [];
        params.forEach((param) => {
          next[param.id] = {
            ...(next[param.id] || {}),
            status: "",
          };
        });
      }
      return next;
    });

    const updatedValues = {
      ...checklistValues,
      [itemId]: {
        ...(checklistValues[itemId] || {}),
        status: value,
      },
    };

    const allEquip = Object.values(groupedEquipment).flat();
    const eqObj = allEquip.find((eq) => eq.equipment_id === itemId);
    if (eqObj && value === "OFFLINE") {
      const params = eqObj.equipment_parameters || [];
      params.forEach((param) => {
        updatedValues[param.id] = {
          ...(updatedValues[param.id] || {}),
          status: "",
        };
      });
    }

    const firstName = (techName || "Field Tech").trim().split(/\s+/)[0];

    saveChecklist({
      dateStr: date,
      shift,
      technician_name: firstName,
      technician_id: techId,
      values: updatedValues,
    }).catch((err) => {
      console.error("Optimistic checklist status save failed:", err);
      setChecklistValues(prevValues);
      toast.error("Network error: Failed to update status");
    });
  };

  const handleCommentChange = (itemId: string, value: string) => {
    if (isReadOnly) return;
    setChecklistValues((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {}),
        comment: value,
      },
    }));
  };

  const handleSaveAndPrint = async () => {
    // Validate comments for DEGRADED or OFFLINE
    const allEquip = Object.values(groupedEquipment).flat();
    for (const eq of allEquip) {
      const status = checklistValues[eq.equipment_id]?.status || "ONLINE";
      const comment = checklistValues[eq.equipment_id]?.comment || "";
      if ((status === "OFFLINE" || status === "DEGRADED") && !comment.trim()) {
        toast.error(`Please provide a comment for ${eq.equipment_id} (${status})`);
        return;
      }
    }

    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const cleanedValues = { ...checklistValues };
      allEquip.forEach((eq) => {
        const status = cleanedValues[eq.equipment_id]?.status || "ONLINE";
        if (status === "OFFLINE") {
          const params = eq.equipment_parameters || [];
          params.forEach((param) => {
            if (cleanedValues[param.id]) {
              cleanedValues[param.id] = {
                ...cleanedValues[param.id],
                status: "",
              };
            }
          });
        }
      });

      const firstName = (techName || "Field Tech").trim().split(/\s+/)[0];
      await saveChecklist({
        dateStr: date,
        shift,
        technician_name: firstName,
        technician_id: techId,
        values: cleanedValues,
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
    <div className="w-full max-w-4xl mx-auto space-y-6 print:space-y-0 pb-32">    {/* pb-32 to clear sticky footer */}
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
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex flex-wrap items-center gap-1.5">
              <span>Maintenance Report Generator</span>
              {isOnline ? (
                <span className="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 bg-red-50 border border-red-200 text-red-650 text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  Offline - {pendingCount} logs pending
                </span>
              )}
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
              <option value="DAY SHIFT (08:00 - 18:00)">DAY SHIFT (08:00 - 18:00)</option>
              <option value="NIGHT SHIFT (18:00 - 08:00)">NIGHT SHIFT (18:00 - 08:00)</option>
            </select>
          </div>
        </div>
      )}

      {/* ── Focus Mode Progress Indicator (screen only) ── */}
      {!isEquipmentLoading && roomEntries.length > 0 && !isReadOnly && (
        <div className="mx-1 bg-white border border-gray-100 rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm print:hidden">
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
            Room {currentRoomIndex + 1} of {roomEntries.length}
          </span>
          <span className="text-xs font-black text-gray-800 uppercase tracking-wider bg-slate-100 px-3 py-1 rounded-xl border border-slate-200">
            {roomEntries[currentRoomIndex]?.[0] ?? ""}
          </span>
        </div>
      )}

      {/* ── Screen View: Clean interactive cards (Hidden when printing) ── */}
      <div className="print:hidden w-full max-w-4xl mx-auto space-y-4">
        {isEquipmentLoading ? (
          <div className="bg-white rounded-3xl p-8 text-center text-gray-400 font-bold uppercase tracking-wider shadow-sm border border-gray-100 animate-pulse">
            <Loader2 size={16} className="animate-spin inline mr-2 text-red-500" />
            Loading Site Equipment Checklist...
          </div>
        ) : roomEntries.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center text-gray-400 italic font-medium shadow-sm border border-gray-100">
            No active equipment found for this site.
          </div>
        ) : (
          (() => {
            const currentRoom = roomEntries[currentRoomIndex];
            if (!currentRoom) return null;
            const [roomName, equipmentList] = currentRoom;

            return (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl px-5 py-3 border border-gray-100 shadow-sm flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Room Inspection</span>
                  <span className="text-xs font-black text-gray-800 uppercase tracking-wider bg-slate-100 px-3 py-1 rounded-xl border border-slate-200">
                    {roomName}
                  </span>
                </div>

                {equipmentList.length === 0 ? (
                  <div className="bg-white rounded-3xl p-8 text-center text-gray-400 italic font-medium shadow-sm border border-gray-100">
                    No active equipment found in this room.
                  </div>
                ) : (
                  equipmentList.map((item) => {
                    const params = item.equipment_parameters || [];
                    const currentStatus = checklistValues[item.equipment_id]?.status || "ONLINE";
                    const currentComment = checklistValues[item.equipment_id]?.comment || "";
                    const isOffline = currentStatus === "OFFLINE";
                    const isDegraded = currentStatus === "DEGRADED";

                    const colorStyles: Record<string, string> = {
                      ONLINE:   "bg-green-600  text-white shadow-sm",
                      DEGRADED: "bg-amber-500  text-white shadow-sm",
                      OFFLINE:  "bg-red-600    text-white shadow-sm",
                    };
                    const dot: Record<string, string> = {
                      ONLINE:   "🟢",
                      DEGRADED: "🟡",
                      OFFLINE:  "🔴",
                    };

                    return (
                      <div key={item.equipment_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        {/* Card Header: Name + Status Group */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-slate-50/50 gap-3">
                          <div>
                            <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider leading-none">
                              {item.equipment_id}
                            </h3>
                            <span className="text-[9px] text-gray-400 font-mono mt-1 block">
                              {item.category} · Location: {item.location}
                            </span>
                          </div>

                          {/* 3-way Status Toggle */}
                          {isReadOnly ? (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                              currentStatus === "ONLINE" ? "bg-green-50 text-green-700 border-green-200" :
                              currentStatus === "DEGRADED" ? "bg-amber-50 text-amber-700 border-amber-200" :
                              "bg-red-50 text-red-700 border-red-200"
                            }`}>
                              {dot[currentStatus]} {currentStatus}
                            </span>
                          ) : (
                            <div className="flex rounded-lg bg-slate-100 border border-slate-200 p-0.5 gap-0.5 flex-shrink-0">
                              {(["ONLINE", "DEGRADED", "OFFLINE"] as const).map((st) => {
                                const isActive = currentStatus === st;
                                return (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => handleStatusChange(item.equipment_id, st)}
                                    className={`px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                                      isActive
                                        ? colorStyles[st] + " border border-transparent"
                                        : "bg-white text-slate-500 border border-slate-200 hover:text-slate-700"
                                    }`}
                                  >
                                    <span>{dot[st]}</span>
                                    <span className="hidden sm:inline">{st}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Card Body: Parameters Grid */}
                        <div className={`p-4 space-y-4 transition-opacity ${isOffline ? "opacity-40 pointer-events-none" : ""}`}>
                          {params.length === 0 ? (
                            <p className="text-[11px] text-gray-500 italic">
                              Standard visual check & verification required.
                            </p>
                          ) : (
                            <div className="grid grid-cols-2 gap-3">
                              {params.map((param) => {
                                const paramVal = checklistValues[param.id]?.status || "";
                                const isConst = param.is_constant;

                                return (
                                  <div key={param.id} className="space-y-1">
                                    <label className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                      <span>{param.parameter_name}</span>
                                      {isConst && (
                                        <span className="px-1 py-0.5 rounded text-[8px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-100">Const</span>
                                      )}
                                    </label>

                                    {isConst ? (
                                      <input
                                        type="text"
                                        disabled
                                        value={`${param.constant_value || ""} ${param.unit || ""}`}
                                        className="w-full px-3 py-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-400 text-xs font-semibold focus:outline-none"
                                      />
                                    ) : isReadOnly ? (
                                      <input
                                        type="text"
                                        disabled
                                        value={
                                          param.data_type === "boolean"
                                            ? paramVal === "true" ? "✔️ YES" : paramVal === "false" ? "❌ NO" : "—"
                                            : `${paramVal || "—"} ${paramVal && param.unit ? ` ${param.unit}` : ""}`
                                        }
                                        className="w-full px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 text-gray-700 text-xs font-semibold focus:outline-none"
                                      />
                                    ) : param.data_type === "boolean" ? (
                                      <div className="flex items-center h-9 pl-1">
                                        <input
                                          type="checkbox"
                                          disabled={isOffline}
                                          checked={paramVal === "true"}
                                          onChange={(e) => handleStatusChange(param.id, e.target.checked ? "true" : "false")}
                                          className="w-4 h-4 rounded text-red-600 focus:ring-red-500 border-gray-300 disabled:opacity-50"
                                        />
                                      </div>
                                    ) : (
                                      <div className="relative">
                                        <input
                                          type={param.data_type === "number" ? "number" : "text"}
                                          disabled={isOffline}
                                          value={paramVal}
                                          onChange={(e) => handleStatusChange(param.id, e.target.value)}
                                          placeholder={param.unit ? `[${param.unit}]` : "—"}
                                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-800 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-all"
                                        />
                                        {param.unit && (
                                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-bold uppercase pointer-events-none">
                                            {param.unit}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Card Footer: Comment Field */}
                        {(isDegraded || isOffline) && (
                          <div className="px-4 pb-4 space-y-1 animate-fade-in">
                            <label className="block text-[10px] font-bold text-red-500 uppercase tracking-wider">
                              {isOffline ? "Outage Reason (Required)" : "Fault Comment (Required)"}
                            </label>
                            <textarea
                              className="w-full px-3 py-2 rounded-lg border border-red-200 bg-red-50/30 text-xs font-semibold text-gray-800 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all resize-none"
                              rows={2}
                              disabled={isReadOnly}
                              value={currentComment}
                              onChange={(e) => handleCommentChange(item.equipment_id, e.target.value)}
                              placeholder={
                                isOffline ? "Outage reason (Mandatory)..." :
                                "Fault description (Mandatory)..."
                              }
                              required={isOffline || isDegraded}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })()
        )}
      </div>

      {/* ── Print-only View: Formal PDF A4 sheet (Hidden on screen) ── */}
      <div className="hidden print:block w-full overflow-x-auto bg-white p-0 border-none shadow-none rounded-none">
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
              {isEquipmentLoading ? (
                <tr>
                  <td colSpan={3} className="border border-black p-4 text-center text-gray-400 font-bold uppercase tracking-wider">
                    Loading Site Equipment Checklist...
                  </td>
                </tr>
              ) : roomEntries.length === 0 ? (
                <tr>
                  <td colSpan={3} className="border border-black p-4 text-center text-gray-400 italic font-medium">
                    No active equipment found for this site.
                  </td>
                </tr>
              ) : (
                roomEntries.map(([roomName, equipmentList]) => (
                  <React.Fragment key={roomName}>
                    <tr className="bg-gray-100 print:bg-gray-100 font-bold">
                      <td colSpan={3} className="border border-black p-2 text-left uppercase tracking-wider text-[11px] font-black">
                        {roomName}
                      </td>
                    </tr>
                    {equipmentList.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="border border-black p-4 text-center text-gray-400 italic font-medium">
                          No active equipment found in this room.
                        </td>
                      </tr>
                    ) : (
                      equipmentList.map((item) => {
                        const params = item.equipment_parameters || [];
                        const currentStatus = checklistValues[item.equipment_id]?.status || "ONLINE";
                        const currentComment = checklistValues[item.equipment_id]?.comment || "";
                        const isOffline = currentStatus === "OFFLINE";

                        return (
                          <tr key={item.equipment_id}>
                            <td className="border border-black p-3 align-top">
                              <div className="font-bold text-slate-800 text-[12px] mb-2 flex items-center justify-between">
                                <span>{item.equipment_id} ({item.category})</span>
                                <span className="text-[10px] text-gray-400 font-mono font-normal">Location: {item.location}</span>
                              </div>

                              {params.length === 0 ? (
                                <p className="text-[11px] text-gray-500 italic mt-1 pl-2 border-l border-slate-200">
                                  Standard check & visual inspection
                                </p>
                              ) : (
                                <div className="space-y-2 pl-2 border-l-2 border-slate-100 mt-2">
                                  {params.map((param) => {
                                    const paramVal = checklistValues[param.id]?.status || "";
                                    const isConst = param.is_constant;

                                    return (
                                      <div key={param.id} className="flex items-center justify-between py-1 border-b border-dashed border-slate-100 last:border-b-0">
                                        <span className="text-xs font-semibold text-slate-700">{param.parameter_name}</span>
                                        <span className="font-bold text-gray-800 text-[11px]">
                                          {isConst ? (
                                            `${param.constant_value} ${param.unit || ""}`
                                          ) : isOffline ? (
                                            "—"
                                          ) : param.data_type === "boolean" ? (
                                            paramVal === "true" ? "✔️ YES" : paramVal === "false" ? "❌ NO" : "—"
                                          ) : (
                                            `${paramVal || "—"}${paramVal && param.unit ? ` ${param.unit}` : ""}`
                                          )}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                            <td className="border border-black p-3 align-top text-center">
                              <span className="font-bold text-gray-800 text-[11px] uppercase">{currentStatus}</span>
                            </td>
                            <td className="border border-black p-3 align-top">
                              <p className="text-slate-700 italic text-[11px] break-words">{currentComment || "—"}</p>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>

          {/* Signature Footer */}
          <div className="mt-12 pt-8 border-t border-gray-400 flex justify-between">
            <div>
              <p className="font-semibold mb-8">Technician Name & Signature:</p>
              <p className="font-bold text-xs text-gray-600 underline decoration-dotted mb-1">
                {isReadOnly ? (selectedHistory?.technician_name || techName) : techName}
              </p>
              <div className="border-b border-black w-64"></div>
            </div>
            <div>
              <p className="font-semibold mb-8">NOC / Admin Signature:</p>
              <div className="border-b border-black w-64"></div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Focus Mode Sticky Navigation Footer (screen-only, entry mode) ── */}
      {!isReadOnly && !isEquipmentLoading && roomEntries.length > 0 && (
        <div className="fixed bottom-0 left-0 w-full p-4 bg-slate-50 border-t border-slate-200 z-[999] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] print:hidden">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            {currentRoomIndex > 0 && (
              <button
                type="button"
                onClick={() => setCurrentRoomIndex((prev) => prev - 1)}
                className="flex-1 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-black text-xs tracking-widest uppercase transition-all shadow-sm cursor-pointer text-center"
              >
                ← Prev Room
              </button>
            )}

            {currentRoomIndex < roomEntries.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentRoomIndex((prev) => prev + 1)}
                className="flex-1 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs tracking-widest uppercase transition-all shadow-md cursor-pointer text-center"
              >
                Next Room →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveAndPrint}
                disabled={isSaving}
                className={`flex-1 py-3.5 rounded-2xl text-white font-black text-xs tracking-widest uppercase transition-all shadow-lg flex items-center justify-center gap-2 ${
                  isSaving
                    ? "bg-gray-400 shadow-none cursor-not-allowed"
                    : saveSuccess
                    ? "bg-green-600 shadow-green-600/10 active:scale-[0.98]"
                    : "bg-red-600 hover:bg-red-700 shadow-red-600/10 active:scale-[0.98]"
                }`}
              >
                {isSaving ? (
                  <><Loader2 size={16} className="animate-spin" /><span>Saving…</span></>
                ) : saveSuccess ? (
                  <><Save size={16} /><span>Archived & Printing...</span></>
                ) : (
                  <><Save size={16} /><span>Save & Print PDF</span></>
                )}
              </button>
            )}
          </div>
        </div>
      )}

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
