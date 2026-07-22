// src/features/field/components/RoutineTasksDashboard.tsx
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Save, CheckCircle2, Loader2, Zap, AlertTriangle, ArrowLeft, Plug, ClipboardList, Share2, History } from 'lucide-react';
import { supabase } from '@/shared/api/supabaseClient';
import { useAuth } from '@/shared/context/AuthContext';
import { useCurrentSite } from '@/shared/context/SiteContext';
import { SITE_BLUEPRINTS } from '@/config/sites';
import { useTelemetryData } from '../hooks/useTelemetryData';
import { useSiteEquipment } from '../hooks/useSiteEquipment';
import { useTelemetryMutation } from '../hooks/useTelemetryMutation';
import { toast } from 'sonner';
import { PathRenderer } from './PathRenderer';
import { TelemetryHistoryModal } from './TelemetryHistoryModal';
import { HistoryRecord, sortHistoryAscending, generateReportTexts } from '../utils/whatsappReportFormatter';
import '../styles/telemetryHistory.css';

interface RoutineTasksDashboardProps {
  targetHour: number;
  onComplete?: () => void;
  onBack?: () => void;
  onSubmitSuccess?: (hour: number) => void;
}



/** Derives a human-readable frequency label for the active checks */
function activeChecksLabel(isTwoHour: boolean, isFourHour: boolean, isDaily: boolean): string {
  const parts = ['Hourly'];
  if (isTwoHour) parts.push('2-Hour');
  if (isFourHour) parts.push('4-Hour');
  if (isDaily) parts.push('Daily');
  return parts.join(' + ') + ' Checks';
}

export const RoutineTasksDashboard = ({
  targetHour: propTargetHour,
  onComplete,
  onBack,
  onSubmitSuccess
}: RoutineTasksDashboardProps) => {
  const targetHour = `${String(propTargetHour).padStart(2, '0')}:00`;
  const { employee } = useAuth();
  const { currentSite } = useCurrentSite();
  const siteCode = currentSite?.site_code || "NTC";
  const blueprint = SITE_BLUEPRINTS[siteCode] || SITE_BLUEPRINTS.NTC;

  const [currentTime, setCurrentTime] = useState(new Date());

  // Clock tick for actual time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Consume the Telemetry Hook
  const {
    formData,
    setFormData,
    isLoading,
    isSubmitting,
    isEditMode,
    handleInputChange,
    handleSubmit,
    activePowerSource,
    isSuccess,
    submitError,
    // FSM hooks
    fsmMode,
    setFsmMode,
    isDailyTestDoneToday,
    dailyTestCompletedInfo
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

  const allEquipment = Object.values(groupedEquipment).flat();

  const handleDashboardSubmit = () => {
    // Validate comments for DEGRADED or OFFLINE
    for (const eqId of currentStepEquipmentIds) {
      if (!isEquipmentActive(eqId)) continue;
      const status = formData[`status_${eqId}`] || "ONLINE";
      const comment = formData[`comment_${eqId}`] || "";
      if ((status === "OFFLINE" || status === "DEGRADED") && !comment.trim()) {
        toast.error(`Please provide a comment for ${eqId} (${status})`);
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

  // Fallback: If in outage mode and no generators are selected, default to the last generator as active
  useEffect(() => {
    if ((fsmMode === 'OUTAGE' || fsmMode === 'ON_LOAD_TEST') && activeGenerators.length === 0 && generatorIds.length > 0) {
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
  }, [fsmMode, activeGenerators, generatorIds]);

  const numericHour = parseInt(targetHour.split(":")[0], 10);
  const isTwoHour = numericHour % 2 === 0;
  const isFourHour = numericHour % 4 === 0;
  const isDaily = numericHour === 9;

  // Filtering Logic
  const getVisibleMetrics = (assetId: string, metrics: any[]): any[] => {
    return metrics.filter((metric) => {
      if (metric.id === 'grid_status') return false;

      // Generator metrics are only visible in DAILY_TEST, OUTAGE or ON_LOAD_TEST mode, and only for active enabled generators
      if (assetId.startsWith('dg_')) {
        if (fsmMode === 'NORMAL') return false;
        if (fsmMode === 'DAILY_TEST') {
          // Hide electrical load parameters for No-Load test
          const isLoadMetric = metric.id.endsWith('_current_r') || metric.id.endsWith('_current_y') || metric.id.endsWith('_current_b') ||
            metric.id.endsWith('_voltage_ry') || metric.id.endsWith('_voltage_yb') || metric.id.endsWith('_voltage_br') ||
            metric.id.endsWith('_kwh_meter') || metric.id.endsWith('_frequency');
          if (isLoadMetric) return false;
        }
        return activeGenerators.includes(assetId);
      }

      // Grid metrics are hidden/muted in OUTAGE and ON_LOAD_TEST modes
      if (assetId === 'grid_main') {
        if (fsmMode === 'OUTAGE' || fsmMode === 'ON_LOAD_TEST') return false;
      }

      switch (metric.frequency) {
        case 'hourly': return true;
        case '2-hour': return isTwoHour;
        case '4-hour': return isFourHour;
        case 'daily': return isDaily;
        default: return false;
      }
    });
  };

  const handleBack = onBack || onComplete;

  // Room Pagination / Focus Mode (Wizard)
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
  const [prevGeneratorValues, setPrevGeneratorValues] = useState<Record<string, any>>({});
  const [attemptedFetches, setAttemptedFetches] = useState<Set<string>>(new Set());

  // Determine if an equipment is marked as active in database registry
  const isEquipmentActive = (equipmentId: string): boolean => {
    const eq = allEquipment.find(e => e.equipment_id.toLowerCase() === equipmentId.toLowerCase());
    return eq ? eq.is_active : true;
  };

  // Compile the list of walking path steps that are visible based on active assets & metric schedules
  const visibleSteps = useMemo(() => {
    return blueprint.walking_path.filter((step: any) => {
      // Always show the Generator Fleet & Fuel step so tests can be started/managed from it
      if (step.room_id === "room_fuel") return true;

      return step.equipment_ids.some((eqId: string) => {
        if (!isEquipmentActive(eqId)) return false;
        const equipBp = blueprint.equipment.find((e: any) => e.id === eqId);
        if (!equipBp) return false;
        return getVisibleMetrics(eqId, equipBp.metrics).length > 0;
      });
    });
  }, [blueprint, activeGenerators, targetHour, allEquipment, fsmMode]);

  useEffect(() => {
    if (currentStepIndex >= visibleSteps.length && visibleSteps.length > 0) {
      setCurrentStepIndex(visibleSteps.length - 1);
    }
  }, [visibleSteps, currentStepIndex]);

  // Real-time generator calculations and fuel logic
  useEffect(() => {
    let changed = false;
    const updated = { ...formData };

    const dgIds = ['dg_1', 'dg_2', 'dg_3', 'dg_4', 'dg_hq'];
    dgIds.forEach((dgId) => {
      const startKey = `${dgId}_hr_meter_start`;
      const stopKey = `${dgId}_hr_meter_stop`;
      const cumKey = `${dgId}_cumulative_hrs`;

      const startVal = parseFloat(formData[startKey]);
      const stopVal = parseFloat(formData[stopKey]);

      if (!isNaN(startVal) && !isNaN(stopVal)) {
        const diff = stopVal - startVal;
        const expectedCum = diff >= 0 ? parseFloat(diff.toFixed(2)) : 0;
        if (updated[cumKey] !== expectedCum) {
          updated[cumKey] = expectedCum;
          changed = true;
        }
      }
    });

    const bf = parseFloat(formData['fuel_brought_forward']) || 0;
    const rec = parseFloat(formData['fuel_received']) || 0;
    const cons = parseFloat(formData['fuel_consumed']) || 0;
    const expectedBalance = parseFloat((bf + rec - cons).toFixed(2));
    if (updated['fuel_balance'] !== expectedBalance) {
      updated['fuel_balance'] = expectedBalance;
      changed = true;
    }

    if (changed && setFormData) {
      setFormData(updated);
      const cacheKey = `telemetry_cache_${targetHour}`;
      localStorage.setItem(cacheKey, JSON.stringify(updated));
    }
  }, [formData, targetHour]);

  // WhatsApp Share & History (Synced across Database & Local Storage)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [whatsappHistory, setWhatsappHistory] = useState<HistoryRecord[]>(() => {
    try {
      const stored = localStorage.getItem('dcime_whatsapp_history');
      const parsed = stored ? JSON.parse(stored) : [];
      return sortHistoryAscending(parsed);
    } catch {
      return [];
    }
  });

  const fetchDatabaseHistory = useCallback(async () => {
    try {
      let query = supabase
        .from('telemetry_logs')
        .select('target_hour, metrics, technician_name, submitted_at, site_id, site_uuid')
        .order('target_hour', { ascending: false })
        .limit(100);

      if (currentSite?.id) {
        query = query.or(`site_uuid.eq.${currentSite.id},site_id.eq.${siteCode}`);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        const dbRecords: HistoryRecord[] = data.map((row: any) => {
          const dateObj = new Date(row.target_hour || row.submitted_at);
          const dateStr = isNaN(dateObj.getTime())
            ? "Recent Log"
            : dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

          let hourNum = isNaN(dateObj.getTime())
            ? (typeof targetHour === 'number' ? targetHour : parseInt(String(targetHour || '0').split(':')[0], 10))
            : dateObj.getHours();

          if (isNaN(hourNum)) hourNum = 0;
          const hourStr = `${hourNum.toString().padStart(2, '0')}:00`;

          const m = row.metrics || {};
          let textContent = m._report_text;
          if (!textContent) {
            const generated = generateReportTexts({
              siteCode,
              currentSiteName: currentSite?.site_name,
              employeeName: row.technician_name || employee?.full_name,
              activePowerSource: m['fsm_mode'] === 'OUTAGE' || m['fsm_mode'] === 'ON_LOAD_TEST' || m['grid_status'] === 'OFF' ? 'GENERATOR' : 'MAINS',
              formData: m,
              targetHour: hourStr
            });
            textContent = generated.internalPayload;
          }

          return {
            timestamp: row.target_hour || row.submitted_at || new Date().toISOString(),
            date: dateStr,
            hour: hourStr,
            text: textContent
          };
        });

        setWhatsappHistory((prev) => {
          const dbHours = new Set(dbRecords.map((r) => r.hour));
          const localOnly = prev.filter((r) => !dbHours.has(r.hour));
          const merged = sortHistoryAscending([...dbRecords, ...localOnly]);
          localStorage.setItem('dcime_whatsapp_history', JSON.stringify(merged));
          return merged;
        });
      }
    } catch (err) {
      console.error("Error fetching telemetry history from database:", err);
    }
  }, [siteCode, currentSite?.site_name, currentSite?.id, employee?.full_name, targetHour]);

  useEffect(() => {
    fetchDatabaseHistory();

    const channel = supabase
      .channel('telemetry_history_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'telemetry_logs' },
        () => {
          fetchDatabaseHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDatabaseHistory]);

  const handleShareAndSave = async () => {
    const { whatsappPayload, internalPayload } = generateReportTexts({
      siteCode,
      currentSiteName: currentSite?.site_name,
      employeeName: employee?.full_name,
      activePowerSource,
      formData,
      targetHour
    });
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    const targetNum = typeof targetHour === 'number'
      ? targetHour
      : parseInt(String(targetHour || '0').split(':')[0], 10);
    const safeTargetNum = isNaN(targetNum) ? 0 : targetNum;
    const hourStr = `${safeTargetNum.toString().padStart(2, '0')}:00`;

    const newRecord: HistoryRecord = {
      timestamp: new Date().toISOString(),
      date: dateStr,
      hour: hourStr,
      text: internalPayload
    };

    setWhatsappHistory((prev) => {
      const filtered = prev.filter(r => r.hour !== hourStr);
      const updated = sortHistoryAscending([newRecord, ...filtered]);
      localStorage.setItem('dcime_whatsapp_history', JSON.stringify(updated));
      return updated;
    });

    // Save report text to database via telemetry submission payload
    try {
      const payloadWithText = {
        ...formData,
        _report_text: internalPayload
      };
      await submitTelemetryLog("facility_wide", payloadWithText, targetHour);
      toast.success("Log saved to shared database history!");
    } catch (err: any) {
      console.warn("Telemetry DB save warning:", err);
      toast.warning("Network warning: Log saved to local history only.");
    }

    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappPayload)}`;
    window.open(waUrl, '_blank');
  };

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
    setPrevGeneratorValues({});
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
          const startKey = `${dgId}_hr_meter_start`;
          const cumKey = `${dgId}_cumulative_hrs`;
          const kwhKey = `${dgId}_kwh_meter`;

          setPrevGeneratorValues((prev) => {
            const next = { ...prev };
            if (lastMetrics.hr_meter_stop !== undefined && lastMetrics.hr_meter_stop !== null && lastMetrics.hr_meter_stop !== "") {
              next[startKey] = lastMetrics.hr_meter_stop;
            }
            if (lastMetrics.cumulative_hrs !== undefined && lastMetrics.cumulative_hrs !== null && lastMetrics.cumulative_hrs !== "") {
              next[cumKey] = lastMetrics.cumulative_hrs;
            }
            if (lastMetrics.kwh_meter !== undefined && lastMetrics.kwh_meter !== null && lastMetrics.kwh_meter !== "") {
              next[kwhKey] = lastMetrics.kwh_meter;
            }
            return next;
          });

          setFormData((prev: any) => {
            const updated = { ...prev };
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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-gray-400">
        <Loader2 size={32} className="text-red-500 animate-spin" />
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading slot data…</p>
      </div>
    );
  }

  const currentStep = visibleSteps[currentStepIndex];
  const currentStepEquipmentIds = currentStep ? currentStep.equipment_ids : [];

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
            <span className="bg-amber-50 text-amber-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
              <ClipboardList size={10} /> Editing
            </span>
          )}
          {fsmMode === 'ON_LOAD_TEST' && (
            <span className="bg-amber-50 text-amber-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
              <Zap size={10} /> Simulated Blackout (On-Load Test)
            </span>
          )}
          {fsmMode === 'OUTAGE' && (
            <span className="bg-red-50 text-red-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-red-200 flex items-center gap-1">
              <Zap size={10} /> Outage Mode
            </span>
          )}
        </p>
      </div>

      {/* Facility State Machine (FSM) Mode Selector */}
      <div className="backdrop-blur-md bg-white/75 border border-gray-200/50 rounded-3xl p-5 shadow-sm space-y-4">
        <div>
          <span className="text-xs font-black text-gray-700 uppercase tracking-wider block">Facility Operating Mode</span>
          <span className="text-[10px] text-gray-400 font-semibold mt-0.5 block">Select active state of site grids and generators</span>
        </div>

        <div className="grid grid-cols-4 gap-2 bg-slate-100 rounded-2xl p-1 border border-slate-200/50">
          <button
            type="button"
            onClick={() => setFsmMode('NORMAL')}
            className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center ${fsmMode === 'NORMAL'
                ? "bg-white text-green-600 shadow-sm border border-slate-200/30"
                : "text-slate-500 hover:text-slate-700"
              }`}
          >
            <Plug size={14} />
            <span>Normal</span>
          </button>

          <button
            type="button"
            disabled={isDailyTestDoneToday && fsmMode !== 'DAILY_TEST'}
            onClick={() => setFsmMode('DAILY_TEST')}
            className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center ${fsmMode === 'DAILY_TEST'
                ? "bg-amber-500 text-white shadow-sm"
                : isDailyTestDoneToday
                  ? "opacity-50 cursor-not-allowed text-slate-400"
                  : "text-slate-500 hover:text-slate-700"
              }`}
          >
            <Zap size={14} />
            <span>Daily Test</span>
          </button>

          <button
            type="button"
            onClick={() => setFsmMode('ON_LOAD_TEST')}
            className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center ${fsmMode === 'ON_LOAD_TEST'
                ? "bg-amber-600 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700"
              }`}
          >
            <Zap size={14} />
            <span>On-Load</span>
          </button>

          <button
            type="button"
            onClick={() => setFsmMode('OUTAGE')}
            className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center ${fsmMode === 'OUTAGE'
                ? "bg-red-500 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700"
              }`}
          >
            <AlertTriangle size={14} />
            <span>Outage</span>
          </button>
        </div>

        {/* Daily Test completion gatekeeper banner */}
        {isDailyTestDoneToday && (
          <div className="bg-green-50 border border-green-200/50 rounded-2xl p-3 flex items-center gap-2.5 text-[10px] font-bold text-green-800">
            <CheckCircle2 size={14} className="text-green-600 shrink-0" />
            <div>
              <span>Daily DG No-Load Test completed today</span>
              {dailyTestCompletedInfo && (
                <span className="block text-[9px] font-semibold text-green-600/80 mt-0.5">
                  At {dailyTestCompletedInfo.time} CAT by {dailyTestCompletedInfo.tech}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Checkbox to mark Daily Test Completed during active test */}
        {fsmMode === 'DAILY_TEST' && !isDailyTestDoneToday && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200/50 rounded-2xl p-3 animate-fade-in">
            <input
              id="mark_daily_completed"
              type="checkbox"
              checked={formData['daily_dg_test_completed'] === true}
              onChange={(e) => handleInputChange('daily_dg_test_completed', e.target.checked)}
              className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-gray-300 cursor-pointer"
            />
            <label htmlFor="mark_daily_completed" className="text-[10px] font-black text-amber-950 uppercase tracking-wider cursor-pointer">
              Mark Daily DG No-Load Test Completed
            </label>
          </div>
        )}

        {/* Generator fleet toggle */}
        {(fsmMode === 'DAILY_TEST' || fsmMode === 'OUTAGE' || fsmMode === 'ON_LOAD_TEST') && (
          <div className="space-y-2 border-t border-slate-100 pt-3 animate-fade-in">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider">
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
                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border ${isActive
                        ? "bg-slate-900 text-white border-slate-950 shadow-sm"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Progress Indicator */}
      {visibleSteps.length > 0 && currentStep && (
        <div className="mx-1 bg-white border border-gray-100 rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm animate-fade-in">
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
            Step {currentStepIndex + 1} of {visibleSteps.length}
          </span>
          <span className="text-xs font-black text-gray-800 uppercase tracking-wider bg-slate-100 px-3 py-1 rounded-xl border border-slate-200">
            {currentStep.name}
          </span>
        </div>
      )}

      {/* Focus Mode Room Pagination (Wizard UI) */}
      <div className="flex-1 overflow-y-auto p-4 pb-52">
        {visibleSteps.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-gray-100 shadow-sm animate-fade-in">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">No active parameters for this hour.</p>
          </div>
        ) : (
          <PathRenderer
            targetHour={targetHour}
            currentStep={currentStep}
            blueprint={blueprint}
            formData={formData}
            allEquipment={allEquipment}
            fsmMode={fsmMode}
            autoFilledFields={autoFilledFields}
            prevGeneratorValues={prevGeneratorValues}
            getVisibleMetrics={getVisibleMetrics}
            isEquipmentActive={isEquipmentActive}
            handleUserInputChange={handleUserInputChange}
            handleToggleChange={handleToggleChange}
            setFsmMode={setFsmMode}
          />
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
          {currentStepIndex > 0 && (
            <button
              type="button"
              onClick={() => setCurrentStepIndex((prev) => prev - 1)}
              className="flex-1 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-black text-xs tracking-widest uppercase transition-all shadow-sm cursor-pointer text-center"
            >
              ← Prev Step
            </button>
          )}

          {currentStepIndex < visibleSteps.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentStepIndex((prev) => prev + 1)}
              className="flex-1 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs tracking-widest uppercase transition-all shadow-md cursor-pointer text-center"
            >
              Next Step →
            </button>
          ) : (
            <button
              onClick={handleDashboardSubmit}
              disabled={isSubmitting || isSuccess}
              className={`flex-1 py-3.5 rounded-2xl text-white font-black text-xs tracking-widest uppercase transition-all shadow-lg flex items-center justify-center gap-2 ${isSubmitting
                  ? "bg-gray-400 shadow-none cursor-not-allowed text-gray-100"
                  : isSuccess
                    ? "bg-green-600 shadow-green-600/10 active:scale-[0.98]"
                    : (fsmMode === 'OUTAGE' || fsmMode === 'ON_LOAD_TEST')
                      ? "bg-red-600 hover:bg-red-700 shadow-red-600/10 active:scale-[0.98]"
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
                  {(fsmMode === 'OUTAGE' || fsmMode === 'ON_LOAD_TEST') ? <Zap size={16} /> : <Save size={16} />}
                  <span>{isEditMode ? 'Update Log' : 'Submit Log'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Floating buttons & History modal */}
      <div className="dcime-float-container">
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="dcime-float-btn"
          title="View History Logs"
        >
          <History size={20} />
        </button>
        <button
          type="button"
          onClick={handleShareAndSave}
          className="dcime-float-btn share"
          title="Share to WhatsApp & Save Log"
        >
          <Share2 size={20} />
        </button>
      </div>

      <TelemetryHistoryModal
        isOpen={historyOpen}
        history={whatsappHistory}
        onClose={() => setHistoryOpen(false)}
        onUpdateHistory={(updated) => {
          setWhatsappHistory(updated);
          localStorage.setItem('dcime_whatsapp_history', JSON.stringify(updated));
        }}
      />
    </div>
  );
};

export default RoutineTasksDashboard;
