// src/features/field/components/PathRenderer.tsx
import { Zap, Plug } from "lucide-react";

interface Metric {
  id: string;
  label: string;
  type: string;
  frequency: string;
  is_constant?: boolean;
  default_value?: any;
}

interface EquipmentParameter {
  id: string;
  equipment_id: string;
  parameter_name: string;
  data_type: "number" | "string" | "boolean" | string;
  is_constant: boolean;
  constant_value: string | null;
  is_graphable: boolean;
  unit: string | null;
  created_at: string;
}

interface EquipmentBlueprint {
  id: string;
  name: string;
  category: string;
  room_id: string;
  sort_order: number;
  metrics: Metric[];
}

interface PathRendererProps {
  targetHour?: string | number;
  currentStep: {
    step_number: number;
    name: string;
    equipment_ids: string[];
    room_id?: string;
  };
  blueprint: {
    equipment: EquipmentBlueprint[];
  };
  formData: Record<string, any>;
  allEquipment: any[];
  fsmMode: string;
  autoFilledFields: Set<string>;
  prevGeneratorValues: Record<string, any>;
  getVisibleMetrics: (assetId: string, metrics: Metric[]) => Metric[];
  isEquipmentActive: (equipmentId: string) => boolean;
  handleUserInputChange: (id: string, value: any) => void;
  handleToggleChange: (key: string, value: any, extraUpdates?: Record<string, any>) => void;
  setFsmMode: (mode: any) => void;
}

export function PathRenderer({
  targetHour,
  currentStep,
  blueprint,
  formData,
  allEquipment,
  fsmMode,
  autoFilledFields,
  prevGeneratorValues,
  getVisibleMetrics,
  isEquipmentActive,
  handleUserInputChange,
  handleToggleChange,
  setFsmMode,
}: PathRendererProps) {
  const currentStepEquipmentIds = currentStep.equipment_ids;

  const numericHour = typeof targetHour === 'number'
    ? targetHour
    : parseInt(String(targetHour || '0').split(':')[0], 10);
  const isOddHour = !isNaN(numericHour) && numericHour % 2 !== 0;

  const categoryIcon = (category: string) => {
    switch (category?.toUpperCase()) {
      case "UPS":
        return (
          <div className="w-5 h-5 rounded bg-blue-50 text-blue-500 flex items-center justify-center font-bold text-[10px]">
            UPS
          </div>
        );
      case "GENERATOR":
        return (
          <div className="w-5 h-5 rounded bg-orange-50 text-orange-500 flex items-center justify-center font-bold text-[10px]">
            GEN
          </div>
        );
      case "AIRCON":
      case "COOLING":
        return (
          <div className="w-5 h-5 rounded bg-cyan-50 text-cyan-500 flex items-center justify-center font-bold text-[10px]">
            AC
          </div>
        );
      default:
        return (
          <div className="w-5 h-5 rounded bg-gray-50 text-gray-400 flex items-center justify-center font-bold text-[10px]">
            EQ
          </div>
        );
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {currentStep.room_id === "room_fuel" && (
        <div className="backdrop-blur-md bg-white/75 border border-gray-200/50 rounded-3xl p-5 shadow-sm space-y-4 mb-4">
          <div>
            <span className="text-xs font-black text-gray-700 uppercase tracking-wider block flex items-center gap-1.5">
              <Zap size={14} className="text-amber-500 animate-pulse" />
              Generator Patrol Test Selector
            </span>
            <span className="text-[10px] text-gray-400 font-semibold mt-0.5 block">
              Set generator status and load test mode for today's walk
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 bg-slate-100 rounded-2xl p-1 border border-slate-200/50">
            <button
              type="button"
              onClick={() => setFsmMode("NORMAL")}
              className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center ${
                fsmMode === "NORMAL"
                  ? "bg-white text-green-600 shadow-sm border border-slate-200/30"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Plug size={14} />
              <span>No Test Today</span>
            </button>

            <button
              type="button"
              onClick={() => setFsmMode("DAILY_TEST")}
              className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center ${
                fsmMode === "DAILY_TEST"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Zap size={14} />
              <span>No-Load Test</span>
            </button>

            <button
              type="button"
              onClick={() => setFsmMode("ON_LOAD_TEST")}
              className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center ${
                fsmMode === "ON_LOAD_TEST"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Zap size={14} />
              <span>On-Load Test</span>
            </button>
          </div>

          {fsmMode !== "NORMAL" && (
            <div className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-2xl p-3 animate-fade-in">
              <div className="text-[10px] font-bold text-amber-800">
                Active State: <span className="uppercase">{fsmMode === 'DAILY_TEST' ? 'No-Load Test' : 'On-Load Test (Simulated Blackout)'}</span>
              </div>
              <button
                type="button"
                onClick={() => setFsmMode("NORMAL")}
                className="px-3 py-1.5 bg-white border border-amber-200 hover:bg-amber-100 rounded-xl text-[10px] font-black text-amber-800 uppercase transition-all"
              >
                End Test
              </button>
            </div>
          )}
        </div>
      )}

      {currentStepEquipmentIds.map((eqId: string) => {
        if (!isEquipmentActive(eqId)) return null;

        const equipBp = blueprint.equipment.find((e) => e.id === eqId);
        if (!equipBp) return null;

        const visibleMetrics = getVisibleMetrics(eqId, equipBp.metrics);
        if (visibleMetrics.length === 0) return null;

        const dbEquipment = allEquipment.find(
          (eq) => eq.equipment_id.toLowerCase() === eqId.toLowerCase()
        );
        const dbParams = ((dbEquipment?.equipment_parameters || []) as EquipmentParameter[]).filter(
          (p) => !equipBp.metrics.some(
            (m) => m.label.toLowerCase() === p.parameter_name.toLowerCase() || m.id.toLowerCase() === p.parameter_name.toLowerCase()
          )
        );

        const isGridLocked = eqId === "grid_main" && (fsmMode === "OUTAGE" || fsmMode === "ON_LOAD_TEST");

        const statusKey = `status_${eqId}`;
        const commentKey = `comment_${eqId}`;
        const currentStatus = formData[statusKey] || "ONLINE";
        const currentComment = formData[commentKey] || "";
        const isOffline = currentStatus === "OFFLINE";
        const isDegraded = currentStatus === "DEGRADED";
        const isDg = eqId.startsWith("dg_");
        const hideBody = isDg && isOffline;

        const colorStyles: Record<string, string> = {
          ONLINE: "bg-green-600 text-white shadow-sm",
          DEGRADED: "bg-amber-500 text-white shadow-sm",
          OFFLINE: "bg-red-600 text-white shadow-sm",
        };
        const dotColor: Record<string, string> = {
          ONLINE: "bg-green-500",
          DEGRADED: "bg-amber-500",
          OFFLINE: "bg-red-500",
        };

        return (
          <div
            key={eqId}
            className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md ${
              isGridLocked ? "opacity-45 bg-gray-50/50 pointer-events-none" : ""
            }`}
          >
            {/* Card Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-slate-50/50 gap-3">
              <div className="flex items-center gap-2">
                {categoryIcon(equipBp.category)}
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider leading-none">
                  {equipBp.name}
                </h3>
              </div>

              {/* 3-way status toggle */}
              <div className="flex rounded-lg bg-slate-100 border border-slate-200 p-0.5 gap-0.5 flex-shrink-0">
                {(["ONLINE", "DEGRADED", "OFFLINE"] as const).map((st) => {
                  const isActive = currentStatus === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      disabled={isGridLocked}
                      onClick={() => {
                        const extra: Record<string, any> = {};
                        if (st === "OFFLINE") {
                          visibleMetrics.forEach((m) => {
                            extra[m.id] = "";
                          });
                          dbParams.forEach((p) => {
                            extra[`param_${p.id}`] = "";
                          });
                        }
                        handleToggleChange(statusKey, st, extra);
                      }}
                      className={`px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                        isActive
                          ? colorStyles[st] + " border border-transparent"
                          : "bg-white text-slate-500 border border-slate-200 hover:text-slate-700"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full inline-block flex-shrink-0 ${
                          isActive ? "bg-white" : dotColor[st]
                        }`}
                      />
                      <span className="hidden sm:inline">{st}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Card Body: Inputs */}
            {!hideBody && (
              <div
                className={`p-4 space-y-3 transition-opacity duration-300 ${
                  isOffline || isGridLocked ? "opacity-40 pointer-events-none" : ""
                }`}
              >
                <div className="grid grid-cols-2 gap-3">
                  {visibleMetrics.map((metric) => {
                    const isConst = metric.is_constant === true && !metric.id.endsWith('_humidity_actual');
                    if (isConst) return null;
                    const isAutoFilled = autoFilledFields.has(metric.id);

                    return (
                      <div key={metric.id} className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <label
                            htmlFor={metric.id}
                            className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider"
                          >
                            <span>{metric.label}</span>
                          </label>
                          {isDg && prevGeneratorValues[metric.id] !== undefined && (
                            <span className="text-[9px] font-semibold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-200/50 flex items-center gap-1">
                              Prev:{" "}
                              <span className="font-mono font-bold text-slate-600">
                                {prevGeneratorValues[metric.id]}
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          {(() => {
                            const isAmbientField = metric.id.endsWith("_ambient_temp") || metric.id.endsWith("_ambient_humidity");
                            const isReadOnlyField =
                              metric.id.endsWith("_cumulative_hrs") ||
                              metric.id === "fuel_balance" ||
                              (isAmbientField && !isOddHour);

                            // Dynamic Boolean Toggle for Compliance Checks
                            if (metric.type === "boolean") {
                              return (
                                <div className="flex items-center h-9 pl-1">
                                  <input
                                    id={metric.id}
                                    type="checkbox"
                                    disabled={isOffline || isGridLocked}
                                    checked={
                                      !(isOffline || isGridLocked) &&
                                      (formData[metric.id] === "true" ||
                                        formData[metric.id] === true)
                                    }
                                    onChange={(e) =>
                                      handleUserInputChange(metric.id, e.target.checked)
                                    }
                                    className="w-4 h-4 rounded text-red-600 focus:ring-red-500 border-gray-300 cursor-pointer"
                                  />
                                  <span className="ml-2 text-xs font-semibold text-gray-600 uppercase">
                                    {(formData[metric.id] === true || formData[metric.id] === "true")
                                      ? "Pass"
                                      : "Fail / No"}
                                  </span>
                                </div>
                              );
                            }

                            return (
                              <input
                                id={metric.id}
                                type={metric.type === "number" ? "number" : "text"}
                                inputMode={metric.type === "number" ? "decimal" : "text"}
                                disabled={isOffline || isGridLocked || isReadOnlyField}
                                value={
                                  isOffline || isGridLocked ? "" : formData[metric.id] ?? ""
                                }
                                onChange={(e) =>
                                  handleUserInputChange(metric.id, e.target.value)
                                }
                                placeholder={
                                  isAmbientField
                                    ? isOddHour
                                      ? "Enter reading..."
                                      : "Derived avg"
                                    : "—"
                                }
                                className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-1 transition-all ${
                                  isReadOnlyField
                                    ? "bg-slate-100 border-gray-200 text-slate-500 cursor-not-allowed"
                                    : isAutoFilled && isDg
                                    ? "bg-emerald-50/10 border-emerald-200 text-emerald-700 focus:border-emerald-500 focus:ring-emerald-500/20"
                                    : "bg-white border-gray-200 text-gray-800 focus:border-red-400 focus:ring-red-400"
                                }`}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}

                  {/* Dynamic DB parameters */}
                  {dbParams.map((param) => {
                    const isConst = param.is_constant;
                    if (isConst) return null;
                    const inputKey = `param_${param.id}`;
                    return (
                      <div key={param.id} className="space-y-1">
                        <label
                          htmlFor={inputKey}
                          className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider"
                        >
                          <span>{param.parameter_name}</span>
                        </label>

                        {param.data_type === "boolean" ? (
                          <div className="flex items-center h-9 pl-1">
                            <input
                              id={inputKey}
                              type="checkbox"
                              disabled={isOffline || isGridLocked}
                              checked={
                                !(isOffline || isGridLocked) &&
                                (formData[inputKey] === "true" || formData[inputKey] === true)
                              }
                              onChange={(e) =>
                                handleToggleChange(inputKey, e.target.checked ? "true" : "false")
                              }
                              className="w-4 h-4 rounded text-red-600 focus:ring-red-500 border-gray-300"
                            />
                            <span className="ml-2 text-xs font-semibold text-gray-600 uppercase">
                              {(formData[inputKey] === "true" || formData[inputKey] === true)
                                ? "Yes"
                                : "No"}
                            </span>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              id={inputKey}
                              type={param.data_type === "number" ? "number" : "text"}
                              inputMode={param.data_type === "number" ? "decimal" : "text"}
                              disabled={isOffline || isGridLocked}
                              value={isOffline || isGridLocked ? "" : formData[inputKey] ?? ""}
                              onChange={(e) => handleUserInputChange(inputKey, e.target.value)}
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
              </div>
            )}

            {/* Comment for OFFLINE/DEGRADED */}
            {(isDegraded || isOffline) && (
              <div className="px-4 pb-4 space-y-1 animate-fade-in">
                <label
                  htmlFor={commentKey}
                  className="block text-[10px] font-bold text-red-500 uppercase tracking-wider"
                >
                  {isOffline ? "Outage Reason (Required)" : "Fault Comment (Required)"}
                </label>
                <textarea
                  id={commentKey}
                  required
                  rows={2}
                  value={currentComment}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleUserInputChange(commentKey, val);
                  }}
                  placeholder={
                    isOffline
                      ? "Total power failure, breaker tripped..."
                      : "Compressor 1 down..."
                  }
                  className="w-full px-3 py-2 rounded-lg border border-red-200 bg-red-50/30 text-xs font-semibold text-gray-800 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all resize-none"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
