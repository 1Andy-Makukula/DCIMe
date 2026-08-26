// src/features/field/components/PathRenderer.tsx
import { Zap, Plug } from "lucide-react";
import type { SiteEquipment, SiteMetric, SiteWalkStep } from "@/shared/api/siteModel";

// The shapes below come from the registry now, not from a JSON file, so they
// are imported rather than re-declared — a local copy is how the two drift.

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

interface PathRendererProps {
  targetHour?: string | number;
  currentStep: SiteWalkStep;
  blueprint: {
    equipment: SiteEquipment[];
  };
  formData: Record<string, any>;
  allEquipment: any[];
  fsmMode: string;
  autoFilledFields: Set<string>;
  carriedFields: Set<string>;
  prevGeneratorValues: Record<string, any>;
  getVisibleMetrics: (assetId: string, metrics: SiteMetric[]) => SiteMetric[];
  isEquipmentActive: (equipmentId: string) => boolean;
  handleUserInputChange: (id: string, value: any) => void;
  handleToggleChange: (key: string, value: any, extraUpdates?: Record<string, any>) => void;
  setFsmMode: (mode: any) => void;
}

export function PathRenderer({
  targetHour: _targetHour,
  currentStep,

  blueprint,
  formData,
  allEquipment,
  fsmMode,
  autoFilledFields,
  carriedFields,
  prevGeneratorValues,
  getVisibleMetrics,
  isEquipmentActive,
  handleUserInputChange,
  handleToggleChange,
  setFsmMode,
}: PathRendererProps) {
  const currentStepEquipmentIds = currentStep.equipment_ids;


  const categoryIcon = (category: string) => {
    switch (category?.toUpperCase()) {
      case "UPS":
        return (
          <div className="w-5 h-5 rounded bg-info-50 text-info-500 flex items-center justify-center font-bold text-[10px]">
            UPS
          </div>
        );
      case "GENERATOR":
        return (
          <div className="w-5 h-5 rounded bg-warn-50 text-warn-500 flex items-center justify-center font-bold text-[10px]">
            GEN
          </div>
        );
      case "AIRCON":
      case "COOLING":
        return (
          <div className="w-5 h-5 rounded bg-info-50 text-info-600 flex items-center justify-center font-bold text-[10px]">
            AC
          </div>
        );
      default:
        return (
          <div className="w-5 h-5 rounded bg-neutral-50 text-neutral-400 flex items-center justify-center font-bold text-[10px]">
            EQ
          </div>
        );
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {currentStep.room_id === "room_fuel" && (
        <div className="backdrop-blur-md bg-white/75 border border-neutral-200/50 rounded-3xl p-5 shadow-sm space-y-4 mb-4">
          <div>
            <span className="text-xs font-black text-neutral-700 uppercase tracking-wider block flex items-center gap-1.5">
              <Zap size={14} className="text-warn-500 animate-pulse" />
              Generator Patrol Test Selector
            </span>
            <span className="text-[10px] text-neutral-400 font-semibold mt-0.5 block">
              Set generator status and load test mode for today's walk
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 bg-neutral-100 rounded-2xl p-1 border border-neutral-200/50">
            <button
              type="button"
              onClick={() => setFsmMode("NORMAL")}
              className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center ${
                fsmMode === "NORMAL"
                  ? "bg-white text-ok-600 shadow-sm border border-neutral-200/30"
                  : "text-neutral-500 hover:text-neutral-700"
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
                  ? "bg-warn-500 text-white shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
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
                  ? "bg-warn-600 text-white shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              <Zap size={14} />
              <span>On-Load Test</span>
            </button>
          </div>

          {fsmMode !== "NORMAL" && (
            <div className="flex items-center justify-between bg-warn-50 border border-warn-100 rounded-2xl p-3 animate-fade-in">
              <div className="text-[10px] font-bold text-warn-800">
                Active State: <span className="uppercase">{fsmMode === 'DAILY_TEST' ? 'No-Load Test' : 'On-Load Test (Simulated Blackout)'}</span>
              </div>
              <button
                type="button"
                onClick={() => setFsmMode("NORMAL")}
                className="px-3 py-1.5 bg-white border border-warn-200 hover:bg-warn-100 rounded-xl text-[10px] font-black text-warn-800 uppercase transition-all"
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
          ONLINE: "bg-ok-600 text-white shadow-sm",
          DEGRADED: "bg-warn-500 text-white shadow-sm",
          OFFLINE: "bg-danger-600 text-white shadow-sm",
        };
        const dotColor: Record<string, string> = {
          ONLINE: "bg-ok-500",
          DEGRADED: "bg-warn-500",
          OFFLINE: "bg-danger-500",
        };

        return (
          <div
            key={eqId}
            className={`bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md ${
              isGridLocked ? "opacity-45 bg-neutral-50/50 pointer-events-none" : ""
            }`}
          >
            {/* Card Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50/50 gap-3">
              <div className="flex items-center gap-2">
                {categoryIcon(equipBp.category)}
                <h3 className="text-xs font-black text-neutral-800 uppercase tracking-wider leading-none">
                  {equipBp.name}
                </h3>
              </div>

              {/* 3-way status toggle */}
              <div className="flex rounded-lg bg-neutral-100 border border-neutral-200 p-0.5 gap-0.5 flex-shrink-0">
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
                          : "bg-white text-neutral-500 border border-neutral-200 hover:text-neutral-700"
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
                            className="flex items-center gap-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider"
                          >
                            <span>{metric.label}</span>
                          </label>
                          {isDg && prevGeneratorValues[metric.id] !== undefined && (
                            <span className="text-[9px] font-semibold text-neutral-400 bg-neutral-50 px-1.5 py-0.5 rounded-md border border-neutral-200/50 flex items-center gap-1">
                              Prev:{" "}
                              <span className="font-mono font-bold text-neutral-600">
                                {prevGeneratorValues[metric.id]}
                              </span>
                            </span>
                          )}
                          {!isDg && carriedFields.has(metric.id) && (
                            <span className="text-[8px] font-black text-info-500 bg-info-50 px-1.5 py-0.5 rounded-md border border-info-100 uppercase tracking-wider">
                              Prev Hr
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          {(() => {
                            const isAmbientField = metric.id.endsWith("_ambient_temp") || metric.id.endsWith("_ambient_humidity");
                            const isReadOnlyField =
                              metric.id.endsWith("_cumulative_hrs") ||
                              metric.id === "fuel_balance";
                            const isCarried = carriedFields.has(metric.id);

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
                                    className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-neutral-300 cursor-pointer"
                                  />
                                  <span className="ml-2 text-xs font-semibold text-neutral-600 uppercase">
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
                                  isOffline || isGridLocked
                                    ? ""
                                    : formData[metric.id] ?? ""
                                }
                                onChange={(e) =>
                                  handleUserInputChange(metric.id, e.target.value)
                                }
                                placeholder={
                                  isAmbientField ? "Enter reading..." : "—"
                                }
                                className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-1 transition-all ${
                                  isReadOnlyField
                                    ? "bg-neutral-100 border-neutral-200 text-neutral-500 cursor-not-allowed"
                                    : isAutoFilled && isDg
                                    ? "bg-ok-50/10 border-ok-200 text-ok-700 focus:border-ok-500 focus:ring-ok-500/20"
                                    : isCarried
                                    ? "bg-info-50/40 border-info-200 text-neutral-800 border-l-[3px] border-l-blue-400 focus:border-info-500 focus:ring-info-400/30"
                                    : "bg-white border-neutral-200 text-neutral-800 focus:border-brand-400 focus:ring-brand-400"
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
                    const isCarried = carriedFields.has(inputKey);

                    return (
                      <div key={param.id} className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <label
                            htmlFor={inputKey}
                            className="flex items-center gap-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider"
                          >
                            <span>{param.parameter_name}</span>
                          </label>
                          {isCarried && (
                            <span className="text-[8px] font-black text-info-500 bg-info-50 px-1.5 py-0.5 rounded-md border border-info-100 uppercase tracking-wider">
                              Prev Hr
                            </span>
                          )}
                        </div>

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
                              className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-neutral-300"
                            />
                            <span className="ml-2 text-xs font-semibold text-neutral-600 uppercase">
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
                              className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-1 transition-all ${
                                isCarried
                                  ? "bg-info-50/40 border-info-200 text-neutral-800 border-l-[3px] border-l-blue-400 focus:border-info-500 focus:ring-info-400/30"
                                  : "bg-white border-neutral-200 text-neutral-800 focus:border-brand-400 focus:ring-brand-400"
                              }`}
                            />
                            {param.unit && (
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400 font-bold uppercase pointer-events-none">
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
                  className="block text-[10px] font-bold text-danger-500 uppercase tracking-wider"
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
                  className="w-full px-3 py-2 rounded-lg border border-danger-200 bg-danger-50/30 text-xs font-semibold text-neutral-800 focus:outline-none focus:border-danger-500 focus:ring-1 focus:ring-danger-500 transition-all resize-none"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
