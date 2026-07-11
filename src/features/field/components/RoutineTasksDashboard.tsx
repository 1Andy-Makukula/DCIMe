import { useState, useMemo, useEffect } from 'react';
import { Lock, Save, CheckCircle2, Loader2, Zap, AlertTriangle, ArrowLeft } from 'lucide-react';
import { supabase } from '@/shared/api/supabaseClient';
import { MASTER_ASSET_DICTIONARY } from '../constants/telemetrySchema';
import { useTelemetryData } from '../hooks/useTelemetryData';
import { useSiteEquipment } from '../hooks/useSiteEquipment';
import { useTelemetryMutation } from '../hooks/useTelemetryMutation';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Types & Props
// ─────────────────────────────────────────────────────────────────────────────

interface RoutineTasksDashboardProps {
  targetHour: number;
  onComplete?: () => void;
  onBack?: () => void;
  onSubmitSuccess?: (hour: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the category icon character for a category name */
function categoryEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('server')) return '🖥️';
  if (n.includes('power room 1')) return '⚡';
  if (n.includes('power room 2')) return '🔋';
  if (n.includes('grid') || n.includes('outside')) return '🏗️';
  if (n.includes('hq')) return '🏢';
  if (n.includes('it room')) return '📡';
  if (n.includes('fuel')) return '⛽';
  return '📋';
}

/** Derives a human-readable frequency label for the active checks */
function activeChecksLabel(isTwoHour: boolean, isFourHour: boolean, isDaily: boolean): string {
  const parts = ['Hourly'];
  if (isTwoHour) parts.push('2-Hour');
  if (isFourHour) parts.push('4-Hour');
  if (isDaily) parts.push('Daily');
  return parts.join(' + ') + ' Checks';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const RoutineTasksDashboard = ({ 
  targetHour: propTargetHour, 
  onComplete,
  onBack,
  onSubmitSuccess 
}: RoutineTasksDashboardProps) => {
  const targetHour = `${String(propTargetHour).padStart(2, '0')}:00`;

  const [currentTime, setCurrentTime] = useState(new Date());

  // Clock tick for actual time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Consume the Telemetry Hook ─────────────────────────────────────────────
  const { 
    formData, 
    setFormData,
    isLoading, 
    isSubmitting, 
    isEditMode, 
    handleInputChange, 
    handleSubmit, 
    activePowerSource,
    setActivePowerSource,
    isSuccess,
    submitError,
  } = useTelemetryData(targetHour, onComplete, onSubmitSuccess);

  const { groupedEquipment } = useSiteEquipment();
  const { submitTelemetryLog } = useTelemetryMutation();

  const handleToggleChange = async (key: string, value: any, extraUpdates: Record<string, any> = {}) => {
    const prevFormData = { ...formData };
    const updatedData = {
      ...formData,
      [key]: value,
      ...extraUpdates
    };

    if (setFormData) {
      setFormData(updatedData);
    }
    const cacheKey = `telemetry_cache_${targetHour}`;
    localStorage.setItem(cacheKey, JSON.stringify(updatedData));

    const success = await submitTelemetryLog('facility_wide', updatedData, targetHour);
    if (!success) {
      if (setFormData) {
        setFormData(prevFormData);
      }
      localStorage.setItem(cacheKey, JSON.stringify(prevFormData));
      toast.error('Network error: Failed to update status');
    }
  };

  // Dynamically resolve generators registered to this site
  const allEquipment = Object.values(groupedEquipment).flat();

  const handleDashboardSubmit = () => {
    // Validate comments for DEGRADED or OFFLINE
    for (const eq of allEquipment) {
      const status = formData[`status_${eq.equipment_id}`] || "ONLINE";
      const comment = formData[`comment_${eq.equipment_id}`] || "";
      if ((status === "OFFLINE" || status === "DEGRADED") && !comment.trim()) {
        toast.error(`Please provide a comment for ${eq.equipment_id} (${status})`);
        return;
      }
    }
    handleSubmit(activeGenerators);
  };
  const activeSiteGenerators = allEquipment
    .filter((eq) => eq.category === "GENERATOR")
    .map((eq) => eq.equipment_id.toLowerCase().replace("-", "_"));

  // Fallback to dg_hq if no generators are registered
  const generatorIds = activeSiteGenerators.length > 0 ? activeSiteGenerators : ['dg_hq'];

  const [activeGenerators, setActiveGenerators] = useState<string[]>(['dg_1', 'dg_2', 'dg_3', 'dg_4', 'dg_hq']);

  // Sync activeGenerators from formData on load / change
  useEffect(() => {
    if (formData && Object.keys(formData).length > 0) {
      const activeFromForm: string[] = [];
      generatorIds.forEach((dgId) => {
        const key = `active_${dgId}`;
        if (formData[key] === true) {
          activeFromForm.push(dgId);
        } else if (formData[key] === undefined) {
          activeFromForm.push(dgId); // Default to active if not initialized
        }
      });
      setActiveGenerators((prev) => {
        const sortedPrev = [...prev].sort().join(',');
        const sortedNext = [...activeFromForm].sort().join(',');
        if (sortedPrev !== sortedNext) {
          return activeFromForm;
        }
        return prev;
      });
    }
  }, [formData]);

  const toggleGenerator = (dgId: string) => {
    setActiveGenerators((prev) => {
      const next = prev.includes(dgId)
        ? prev.filter((id) => id !== dgId)
        : [...prev, dgId];
      
      // Synchronize in-memory (no database network calls onChange)
      setFormData((prevForm: any) => {
        const updated = {
          ...prevForm,
          [`active_${dgId}`]: next.includes(dgId)
        };
        const cacheKey = `telemetry_cache_${targetHour}`;
        localStorage.setItem(cacheKey, JSON.stringify(updated));
        return updated;
      });

      return next;
    });
  };

  // Fallback: If in generator mode and no generators are selected, default to the last generator as active
  useEffect(() => {
    if (activePowerSource === 'GENERATOR' && activeGenerators.length === 0 && generatorIds.length > 0) {
      const defaultDg = generatorIds[generatorIds.length - 1];
      setActiveGenerators([defaultDg]);
      setFormData((prevForm: any) => {
        const updated = {
          ...prevForm,
          [`active_${defaultDg}`]: true
        };
        const cacheKey = `telemetry_cache_${targetHour}`;
        localStorage.setItem(cacheKey, JSON.stringify(updated));
        return updated;
      });
    }
  }, [activePowerSource, activeGenerators, generatorIds]);

  // ── Frequency accordion math (for header display and filtering) ────────────
  // Parse hour as number for compatibility with modulo operations
  const numericHour = parseInt(targetHour.split(":")[0], 10);
  const isTwoHour  = numericHour % 2 === 0;
  const isFourHour = numericHour % 4 === 0;
  const isDaily    = numericHour === 9;

  // ── Filtering Logic ────────────────────────────────────────────────────────
  const getVisibleMetrics = (assetId: string, metrics: any[]): any[] => {
    return metrics.filter((metric) => {
      // Exclude grid_status since it is now controlled by the Master Power Toggle at the top
      if (metric.id === 'grid_status') return false;

      // Generator metrics are shown based solely on whether the generator is inside activeGenerators
      if (assetId.includes('dg_')) {
        return activeGenerators.includes(assetId);
      }

      switch (metric.frequency) {
        case 'hourly':  return true;
        case '2-hour':  return isTwoHour;
        case '4-hour':  return isFourHour;
        case 'daily':   return isDaily;
        default:        return false;
      }
    });
  };

  // ── Back handler ───────────────────────────────────────────────────────────
  const handleBack = onBack || onComplete;

  // ── Room Pagination / Focus Mode ───────────────────────────────────────────
  const [currentRoomIndex, setCurrentRoomIndex] = useState(0);

  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
  const [attemptedFetches, setAttemptedFetches] = useState<Set<string>>(new Set());

  // Helper to fetch last stop values of a specific generator
  const fetchLastDgMetrics = async (dgId: string) => {
    try {
      const { data, error } = await supabase
        .from('telemetry_logs')
        .select('metrics')
        .not('metrics', 'is', null)
        .order('target_hour', { ascending: false });

      if (error) throw error;
      
      if (data) {
        // Find the most recent log where the generator stopped running
        const lastLogWithDg = data.find((row: any) => {
          const m = row.metrics || {};
          return m[`${dgId}_hr_meter_stop`] !== undefined && m[`${dgId}_hr_meter_stop`] !== null && m[`${dgId}_hr_meter_stop`] !== "";
        });

        if (lastLogWithDg) {
          const m = lastLogWithDg.metrics;
          return {
            hr_meter_stop: m[`${dgId}_hr_meter_stop`],
            cumulative_hrs: m[`${dgId}_cumulative_hrs`],
            kwh_meter: m[`${dgId}_kwh_meter`]
          };
        }
      }
    } catch (err) {
      console.error(`[DCIMe] Failed to fetch run hours memory for ${dgId}:`, err);
    }
    return null;
  };

  // Reset fetches on slot/hour change
  useEffect(() => {
    setAttemptedFetches(new Set());
    setAutoFilledFields(new Set());
  }, [targetHour]);

  // Effect to trigger fetching of last run metrics when a generator is ONLINE or DEGRADED
  useEffect(() => {
    generatorIds.forEach(async (dgId) => {
      const status = formData[`status_${dgId}`] || "ONLINE";
      if (status !== "OFFLINE" && !attemptedFetches.has(dgId)) {
        setAttemptedFetches((prev) => {
          const next = new Set(prev);
          next.add(dgId);
          return next;
        });

        const lastMetrics = await fetchLastDgMetrics(dgId);
        if (lastMetrics) {
          setFormData((prev: any) => {
            const updated = { ...prev };
            const startKey = `${dgId}_hr_meter_start`;
            const cumKey = `${dgId}_cumulative_hrs`;
            const kwhKey = `${dgId}_kwh_meter`;
            
            let changed = false;

            if (lastMetrics.hr_meter_stop !== undefined && lastMetrics.hr_meter_stop !== null && lastMetrics.hr_meter_stop !== "" && (updated[startKey] === undefined || updated[startKey] === "")) {
              updated[startKey] = lastMetrics.hr_meter_stop;
              setAutoFilledFields((f) => {
                const s = new Set(f);
                s.add(startKey);
                return s;
              });
              changed = true;
            }

            if (lastMetrics.cumulative_hrs !== undefined && lastMetrics.cumulative_hrs !== null && lastMetrics.cumulative_hrs !== "" && (updated[cumKey] === undefined || updated[cumKey] === "")) {
              updated[cumKey] = lastMetrics.cumulative_hrs;
              setAutoFilledFields((f) => {
                const s = new Set(f);
                s.add(cumKey);
                return s;
              });
              changed = true;
            }

            if (lastMetrics.kwh_meter !== undefined && lastMetrics.kwh_meter !== null && lastMetrics.kwh_meter !== "" && (updated[kwhKey] === undefined || updated[kwhKey] === "")) {
              updated[kwhKey] = lastMetrics.kwh_meter;
              setAutoFilledFields((f) => {
                const s = new Set(f);
                s.add(kwhKey);
                return s;
              });
              changed = true;
            }

            if (changed) {
              const cacheKey = `telemetry_cache_${targetHour}`;
              localStorage.setItem(cacheKey, JSON.stringify(updated));
            }
            return updated;
          });
        }
      }
    });
  }, [formData, attemptedFetches]);

  const handleUserInputChange = (id: string, value: any) => {
    handleInputChange(id, value);
    setAutoFilledFields((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      return prev;
    });
  };

  const visibleCategories = useMemo(() => {
    return MASTER_ASSET_DICTIONARY.filter((category) => {
      return category.assets.some((asset) => {
        const isDg = asset.id.startsWith('dg_');
        if (isDg && !activeGenerators.includes(asset.id)) return false;
        return getVisibleMetrics(asset.id, asset.metrics).length > 0;
      });
    });
  }, [activeGenerators, activePowerSource, targetHour]);

  useEffect(() => {
    if (currentRoomIndex >= visibleCategories.length && visibleCategories.length > 0) {
      setCurrentRoomIndex(visibleCategories.length - 1);
    }
  }, [visibleCategories, currentRoomIndex]);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-gray-400">
        <Loader2 size={32} className="text-red-500 animate-spin" />
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading slot data…</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-md mx-auto space-y-6 pb-24">
      {/* Sticky Audit Banner */}
      <div className="sticky top-0 z-[100] backdrop-blur-md bg-slate-900/90 text-white border border-slate-800 px-4 py-2.5 rounded-2xl shadow-lg flex items-center justify-between text-[11px] font-black uppercase tracking-wider">
        <span>Logging for Shift: {targetHour}</span>
        <span className="text-gray-400 font-mono">Actual: {currentTime.toLocaleTimeString('en-US', { hour12: false })}</span>
      </div>

      {/* Back Button */}
      {handleBack && (
        <div className="px-1">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 py-3 px-4 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-600 hover:text-red-600 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
          >
            <ArrowLeft size={14} />
            <span>← Back</span>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="backdrop-blur-md bg-white/75 border border-gray-200/50 rounded-3xl p-5 shadow-sm">
        <h1 className="text-xl font-black text-gray-900 tracking-tight">
          Log for {targetHour}
        </h1>
        <p className="text-xs text-gray-500 mt-1.5 flex flex-wrap gap-2 items-center">
          <span className="font-semibold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100">
            {activeChecksLabel(isTwoHour, isFourHour, isDaily)}
          </span>
          {isEditMode && (
            <span className="bg-amber-50 text-amber-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-200">
              ✏️ Editing
            </span>
          )}
          {activePowerSource === 'GENERATOR' && (
            <span className="bg-red-50 text-red-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-red-200">
              ⚡ Outage Mode
            </span>
          )}
        </p>
      </div>

      {/* Active Site Power Toggle (Local UI State Only) */}
      <div className="backdrop-blur-md bg-white/75 border border-gray-200/50 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-black text-gray-700 uppercase tracking-wider block">Active Site Power</span>
            <span className="text-[10px] text-gray-400 font-semibold mt-0.5 block">Select primary energy feed</span>
          </div>
          <div className="flex bg-slate-100 rounded-xl p-1 border border-slate-200/50">
            <button
              type="button"
              onClick={() => setActivePowerSource('MAINS')}
              className={`px-4.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activePowerSource === 'MAINS'
                  ? "bg-white text-green-600 shadow-sm border border-slate-200/30"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              🔌 MAINS
            </button>
            <button
              type="button"
              onClick={() => setActivePowerSource('GENERATOR')}
              className={`px-4.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activePowerSource === 'GENERATOR'
                  ? "bg-red-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              ⚡ GENERATOR
            </button>
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-3">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
            Active Generator Fleet (Tap to toggle)
          </label>
          <div className="flex flex-wrap gap-2">
            {generatorIds.map((dgId) => {
              const label = dgId === 'dg_hq' ? 'DG-HQ' : `DG-${dgId.replace('dg_', '').toUpperCase()}`;
              const isActive = activeGenerators.includes(dgId);
              return (
                <button
                  key={dgId}
                  type="button"
                  onClick={() => toggleGenerator(dgId)}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border ${
                    isActive
                      ? "bg-green-500 text-white border-green-600 shadow-sm"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      {visibleCategories.length > 0 && visibleCategories[currentRoomIndex] && (
        <div className="mx-1 bg-white border border-gray-100 rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm animate-fade-in">
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
            Room {currentRoomIndex + 1} of {visibleCategories.length}
          </span>
          <span className="text-xs font-black text-gray-800 uppercase tracking-wider bg-slate-100 px-3 py-1 rounded-xl border border-slate-200">
            {visibleCategories[currentRoomIndex].categoryName}
          </span>
        </div>
      )}

      {/* Dictionary loop replaced with Focus Mode Room Pagination */}
      <div className="flex-1 overflow-y-auto p-4 pb-52">
        {visibleCategories.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-gray-100 shadow-sm animate-fade-in">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">No active parameters for this hour.</p>
          </div>
        ) : (
          (() => {
            const category = visibleCategories[currentRoomIndex];
            if (!category) return null;

            return (
              <div key={category.categoryName} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden transition-all mb-4 animate-fade-in">
                {/* Header */}
                <div className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-50 bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-900 text-white"
                    >
                      <span className="text-sm">{categoryEmoji(category.categoryName)}</span>
                    </div>
                    <span className="font-black text-xs text-gray-800 uppercase tracking-wider">{category.categoryName}</span>
                  </div>
                </div>

                {/* Asset Cards */}
                <div className="p-4 bg-gray-50/50 space-y-4">
                  {category.assets.map((asset) => {
                    const isDg = asset.id.startsWith('dg_');
                    if (isDg && !activeGenerators.includes(asset.id)) return null;

                    const visibleMetrics = getVisibleMetrics(asset.id, asset.metrics);
                    if (visibleMetrics.length === 0) return null;

                    const dbEquipment = allEquipment.find(
                      (eq) => eq.equipment_id.toLowerCase().replace("-", "_") === asset.id.toLowerCase().replace("-", "_")
                    );
                    const dbParams = dbEquipment?.equipment_parameters || [];

                    const isGridLocked = asset.id === 'grid_main' && activePowerSource === 'GENERATOR';

                    return (
                      <div key={asset.id} className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-all ${isGridLocked ? "opacity-45 bg-gray-50/50 pointer-events-none" : ""}`}>
                        {/* ── Card Header: Name  ·  Status Toggle ── */}
                        {(() => {
                          const statusKey  = `status_${asset.id}`;
                          const commentKey = `comment_${asset.id}`;
                          const currentStatus  = formData[statusKey]  || "ONLINE";
                          const currentComment = formData[commentKey] || "";
                          const isOffline  = currentStatus === "OFFLINE";
                          const isDegraded = currentStatus === "DEGRADED";
                          const isDg = asset.id.startsWith('dg_');
                          const hideBody = isDg && isOffline;

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
                            <>
                              {/* Header row */}
                              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-slate-50/50 gap-3">
                                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider leading-none">
                                  {asset.name}
                                </h3>

                                {/* 3-way status toggle — compact pill group */}
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
                                            visibleMetrics.forEach((m) => { extra[m.id] = ""; });
                                            dbParams.forEach((p) => { extra[`param_${p.id}`] = ""; });
                                          }
                                          handleToggleChange(statusKey, st, extra);
                                        }}
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
                              </div>

                              {/* ── Body: Inputs (full-width, normal) ── */}
                              {!hideBody && (
                                <div className={`p-4 space-y-3 transition-opacity ${(isOffline || isGridLocked) ? "opacity-40 pointer-events-none" : ""}`}>
                                <div className="grid grid-cols-2 gap-3">
                                  {visibleMetrics.map((metric) => {
                                    const isConst = metric.isConstant === true;
                                    const isAutoFilled = autoFilledFields.has(metric.id);

                                    return (
                                      <div key={metric.id} className="space-y-1">
                                        <label htmlFor={metric.id} className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                          <span>{metric.label}</span>
                                          {isConst && (
                                            <span title="Constant — tap to override">
                                              <Lock size={9} className="text-gray-300" />
                                            </span>
                                          )}
                                        </label>
                                        <div className="relative">
                                          <input
                                            id={metric.id}
                                            type={metric.type === "number" ? "number" : "text"}
                                            inputMode={metric.type === "number" ? "decimal" : "text"}
                                            disabled={isOffline || isGridLocked}
                                            value={(isOffline || isGridLocked) ? "" : (formData[metric.id] ?? "")}
                                            onChange={(e) => handleUserInputChange(metric.id, e.target.value)}
                                            placeholder={isConst ? String(metric.defaultValue ?? "") : "—"}
                                            className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-1 transition-all ${
                                              isConst
                                                ? "bg-slate-50 border-slate-200 text-slate-400 border-dashed"
                                                : isAutoFilled
                                                ? "bg-emerald-50/10 border-emerald-200 text-emerald-700 focus:border-emerald-500 focus:ring-emerald-500/20"
                                                : "bg-white border-gray-200 text-gray-800 focus:border-red-400 focus:ring-red-400"
                                            }`}
                                          />
                                          {isAutoFilled && (
                                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-100/50 animate-fade-in" title="Auto-filled from previous log">
                                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                              Sync
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* Dynamic DB parameters */}
                                  {dbParams.map((param) => {
                                    const isConst  = param.is_constant;
                                    const inputKey = `param_${param.id}`;
                                    return (
                                      <div key={param.id} className="space-y-1">
                                        <label htmlFor={inputKey} className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                          <span>{param.parameter_name}</span>
                                          {isConst && (
                                            <span title={`Constant: ${param.constant_value}`}>
                                              <Lock size={9} className="text-gray-300" />
                                            </span>
                                          )}
                                        </label>

                                        {isConst ? (
                                          <input
                                            id={inputKey}
                                            type="text"
                                            disabled
                                            value={param.constant_value || ""}
                                            className="w-full px-3 py-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-400 text-xs font-semibold focus:outline-none"
                                          />
                                        ) : param.data_type === "boolean" ? (
                                          <div className="flex items-center h-9 pl-1">
                                            <input
                                              id={inputKey}
                                              type="checkbox"
                                              disabled={isOffline || isGridLocked}
                                              checked={!(isOffline || isGridLocked) && (formData[inputKey] === "true" || formData[inputKey] === true)}
                                              onChange={(e) => handleToggleChange(inputKey, e.target.checked ? "true" : "false")}
                                              className="w-4 h-4 rounded text-red-600 focus:ring-red-500 border-gray-300"
                                            />
                                          </div>
                                        ) : (
                                          <div className="relative">
                                            <input
                                              id={inputKey}
                                              type={param.data_type === "number" ? "number" : "text"}
                                              inputMode={param.data_type === "number" ? "decimal" : "text"}
                                              disabled={isOffline || isGridLocked}
                                              value={(isOffline || isGridLocked) ? "" : (formData[inputKey] ?? "")}
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

                              {/* ── Comment — shown when DEGRADED or OFFLINE ── */}
                              {(isDegraded || isOffline) && (
                                <div className="px-4 pb-4 space-y-1 animate-fade-in">
                                  <label htmlFor={commentKey} className="block text-[10px] font-bold text-red-500 uppercase tracking-wider">
                                    {isOffline ? "Outage Reason (Required)" : "Fault Comment (Required)"}
                                  </label>
                                  <textarea
                                    id={commentKey}
                                    required
                                    rows={2}
                                    value={currentComment}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setFormData((prev: any) => ({ ...prev, [commentKey]: val }));
                                      const cacheKey = `telemetry_cache_${targetHour}`;
                                      localStorage.setItem(cacheKey, JSON.stringify({ ...formData, [commentKey]: val }));
                                    }}
                                    placeholder={isOffline ? "Total power failure, breaker tripped..." : "Compressor 1 down..."}
                                    className="w-full px-3 py-2 rounded-lg border border-red-200 bg-red-50/30 text-xs font-semibold text-gray-800 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all resize-none"
                                  />
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        )}
      </div>

      {/* Error banner */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 text-sm text-red-800 shadow-sm mx-1">
          <AlertTriangle size={18} className="text-red-600 shrink-0" />
          <span className="font-medium">{submitError}</span>
        </div>
      )}

      {/* Sticky Submit / Pagination Footer */}
      <div className="fixed bottom-16 left-0 w-full p-4 bg-slate-50 border-t border-slate-200 z-[999] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="max-w-md mx-auto flex items-center gap-3">
          {currentRoomIndex > 0 && (
            <button
              type="button"
              onClick={() => setCurrentRoomIndex((prev) => prev - 1)}
              className="flex-1 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-black text-xs tracking-widest uppercase transition-all shadow-sm cursor-pointer text-center"
            >
              ← Prev Room
            </button>
          )}

          {currentRoomIndex < visibleCategories.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentRoomIndex((prev) => prev + 1)}
              className="flex-1 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs tracking-widest uppercase transition-all shadow-md cursor-pointer text-center"
            >
              Next Room →
            </button>
          ) : (
            <button
              onClick={handleDashboardSubmit}
              disabled={isSubmitting || isSuccess}
              className={`flex-1 py-3.5 rounded-2xl text-white font-black text-xs tracking-widest uppercase transition-all shadow-lg flex items-center justify-center gap-2 ${
                isSubmitting
                  ? "bg-gray-400 shadow-none cursor-not-allowed text-gray-100"
                  : isSuccess
                  ? "bg-green-600 shadow-green-600/10 active:scale-[0.98]"
                  : activePowerSource === 'GENERATOR'
                  ? "bg-amber-600 hover:bg-amber-700 shadow-amber-600/10 active:scale-[0.98]"
                  : "bg-red-600 hover:bg-red-700 shadow-red-600/10 active:scale-[0.98]"
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Saving…</span>
                </>
              ) : isSuccess ? (
                <>
                  <CheckCircle2 size={16} />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  {activePowerSource === 'GENERATOR' ? <Zap size={16} /> : <Save size={16} />}
                  <span>{isEditMode ? 'Update Log' : 'Submit Log'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoutineTasksDashboard;
