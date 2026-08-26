// src/features/field/components/RoutineTasksDashboard.tsx
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRealtimeTable } from "@/shared/api/realtime";
import { Save, CheckCircle2, Loader2, Zap, AlertTriangle, ArrowLeft, Plug, ClipboardList, Share2, History, EyeOff } from 'lucide-react';
import { supabase } from '@/shared/api/supabaseClient';
import { useAuth } from '@/shared/context/AuthContext';
import { useCurrentSite } from '@/shared/context/SiteContext';
import { DEFAULT_SITE_CODE } from '@/config/sites';
import { useSiteModel } from '@/shared/api/siteModel';
import { useTelemetryData } from '../hooks/useTelemetryData';
import { useSiteEquipment } from '../hooks/useSiteEquipment';
import { useTelemetryMutation } from '../hooks/useTelemetryMutation';
import { toast } from 'sonner';
import { PathRenderer } from './PathRenderer';
import { TelemetryHistoryModal } from './TelemetryHistoryModal';
import { HistoryRecord, sortHistoryAscending, generateReportTexts } from '../utils/whatsappReportFormatter';
import { toLocalDateKey, slotISO, parseHour } from '../utils/dateKeys';
import '../styles/telemetryHistory.css';

interface RoutineTasksDashboardProps {
  targetHour: number;
  /** Local day this slot belongs to. Defaults to today. */
  selectedDate?: Date;
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
  selectedDate,
  onComplete,
  onBack,
  onSubmitSuccess
}: RoutineTasksDashboardProps) => {
  const targetHour = `${String(propTargetHour).padStart(2, '0')}:00`;
  const slotDate = selectedDate ?? new Date();
  const { employee } = useAuth();
  const { currentSite } = useCurrentSite();
  const siteCode = currentSite?.site_code || DEFAULT_SITE_CODE;
  // Rooms, equipment, readings and the walking round, from the registry rather
  // than SITE_01_blueprint.json. Unlike the blueprint this arrives
  // asynchronously, so registryLoaded below gates on it too — otherwise the
  // first render computes an empty round and tells the technician there is
  // nothing to do.
  const { model, isLoading: isModelLoading, error: modelError } = useSiteModel();

  // Must match useTelemetryData's key exactly, or drafts written here are
  // invisible to the hook that reads them back.
  const cacheKey = `telemetry_cache_${siteCode}_${toLocalDateKey(slotDate)}_${parseHour(propTargetHour)}`;

  // The exact instant this slot represents. Passed to submitTelemetryLog so
  // toggle saves land on the selected day rather than always on today.
  const slotTimestamp = new Date(slotISO(slotDate, parseHour(propTargetHour)));

  const isBackdating = toLocalDateKey(slotDate) !== toLocalDateKey(new Date());

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
    dailyTestCompletedInfo,
    // Carried-forward tracking
    carriedFields,
    setCarriedFields
  } = useTelemetryData(targetHour, onComplete, onSubmitSuccess, slotDate);

  const { groupedEquipment, isLoading: isEquipmentLoading, error: equipmentError } = useSiteEquipment();
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

    // Clear carried state for any key modified by this toggle
    if (setCarriedFields) {
      setCarriedFields((prev) => {
        const next = new Set(prev);
        next.delete(key);
        Object.keys(extraUpdates).forEach((k) => next.delete(k));
        return next;
      });
    }

    // Key by site + local date + hour: an hour-only key bleeds drafts into
    // the same hour on other days and other sites.
    localStorage.setItem(cacheKey, JSON.stringify(updatedData));

    const success = await submitTelemetryLog('facility_wide', updatedData, slotTimestamp);
    if (!success) {
      if (setFormData) {
        setFormData(prevFormData);
      }
      localStorage.setItem(cacheKey, JSON.stringify(prevFormData));
      toast.error('Network error: Failed to update status');
    }
  };

  const allEquipment = Object.values(groupedEquipment).flat();

  // The registry is only authoritative once it has actually loaded. While it is
  // still fetching — or if the fetch failed, or no site is selected yet — every
  // asset is treated as active so a transient error can't blank the walk-through.
  const registryLoaded = !isEquipmentLoading && !equipmentError && allEquipment.length > 0
    && !isModelLoading && !modelError && model.equipment.length > 0;

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
    handleSubmit(activeGenerators, decommissionedIds);
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

  // Determine if an equipment is marked as active in database registry.
  // useSiteEquipment drops decommissioned assets from the registry entirely, so
  // absence from a *loaded* registry means decommissioned — the previous
  // `find() ? is_active : true` fallback read that absence as "assume active"
  // and kept decommissioned equipment on the technician's walk-through.
  const isEquipmentActive = (equipmentId: string): boolean => {
    if (!registryLoaded) return true;
    return allEquipment.some(e => e.equipment_id.toLowerCase() === equipmentId.toLowerCase());
  };

  // Blueprint assets the registry says are decommissioned. Passed into submit so
  // validation can't demand readings for fields the tech is no longer shown.
  const decommissionedIds = useMemo(
    () => new Set<string>(
      model.equipment
        .filter((eq: any) => !isEquipmentActive(eq.id))
        .map((eq: any) => eq.id as string)
    ),
    [model, registryLoaded, allEquipment]
  );

  // Mode transparency: count the readings the current facility mode suppresses.
  // Fields still hide as before, but the technician is told what is missing and
  // why, so a shorter form doesn't read as lost data or a broken toggle.
  const hiddenByMode = useMemo(() => {
    const matchesFrequency = (metric: any): boolean => {
      switch (metric.frequency) {
        case 'hourly': return true;
        case '2-hour': return isTwoHour;
        case '4-hour': return isFourHour;
        case 'daily': return isDaily;
        default: return false;
      }
    };

    let count = 0;
    model.equipment.forEach((equip: any) => {
      if (!isEquipmentActive(equip.id)) return;
      // grid_status is suppressed in every mode, so it isn't a mode difference.
      const eligible = (equip.metrics || []).filter(
        (m: any) => m.id !== 'grid_status' && matchesFrequency(m)
      );
      const visible = getVisibleMetrics(equip.id, equip.metrics || []);
      count += Math.max(0, eligible.length - visible.length);
    });

    let reason = '';
    switch (fsmMode) {
      case 'NORMAL':
        reason = 'Generator readings are not logged while the site runs on mains.';
        break;
      case 'DAILY_TEST':
        reason = 'Electrical load readings are not logged during a no-load test.';
        break;
      case 'ON_LOAD_TEST':
        reason = 'Mains grid readings are not logged during a simulated blackout.';
        break;
      case 'OUTAGE':
        reason = 'Mains grid readings are not logged while the site runs on generator.';
        break;
    }

    return { count, reason };
  }, [model, fsmMode, activeGenerators, targetHour, registryLoaded, allEquipment]);

  // Compile the list of walking path steps that are visible based on active assets & metric schedules
  const visibleSteps = useMemo(() => {
    return model.walking_path.filter((step: any) => {
      // Always show the Generator Fleet & Fuel step so tests can be started and
      // managed from it. Flagged on the step itself now — this used to compare
      // against the literal slug "room_fuel", which the registry does not use.
      if (step.always_visible) return true;

      return step.equipment_ids.some((eqId: string) => {
        if (!isEquipmentActive(eqId)) return false;
        const equipBp = model.equipment.find((e: any) => e.id === eqId);
        if (!equipBp) return false;
        return getVisibleMetrics(eqId, equipBp.metrics).length > 0;
      });
    });
  }, [model, activeGenerators, targetHour, allEquipment, fsmMode]);

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
      localStorage.setItem(cacheKey, JSON.stringify(updated));
    }
  }, [formData, targetHour, siteCode]);


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
    if (!currentSite?.id) {
      // Skip query to avoid persisting the fallback site when context is loading
      return;
    }

    try {
      const { data, error } = await supabase
        .from('telemetry_logs')
        .select('target_hour, metrics, technician_name, submitted_at')
        // Facility logs only. telemetry_logs also carries dg_daily_test rows
        // (same hour, duplicating an entry in the modal) and
        // daily-checklist rows, whose metrics aren't telemetry at all
        // and render as a garbage report.
        .eq('asset_id', 'facility_wide')
        .or(`metrics->>site_uuid.eq.${currentSite.id},metrics->>site_id.eq.${siteCode}`)
        .order('target_hour', { ascending: false })
        .limit(100);

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
          // Always re-render the summary from the live metrics rather than
          // trusting a stored _report_text. That snapshot was written once at
          // first submission and never refreshed, so after a technician edited
          // an hour the history still showed the pre-edit numbers.
          // internalPayload derives its timestamp from targetHour (not wall
          // clock), so regenerating an untouched row reproduces it exactly.
          const { internalPayload } = generateReportTexts({
            siteCode,
            currentSiteName: currentSite?.site_name,
            employeeName: row.technician_name || employee?.full_name,
            activePowerSource: m['fsm_mode'] === 'OUTAGE' || m['fsm_mode'] === 'ON_LOAD_TEST' || m['grid_status'] === 'OFF' ? 'GENERATOR' : 'MAINS',
            formData: m,
            targetHour: hourStr
          });
          const textContent = internalPayload;

          return {
            timestamp: row.target_hour || row.submitted_at || new Date().toISOString(),
            date: dateStr,
            hour: hourStr,
            text: textContent
          };
        });

        setWhatsappHistory((prev) => {
          const dbKeys = new Set(dbRecords.map((r) => `${r.date}_${r.hour}`));
          const localOnly = prev.filter((r) => !dbKeys.has(`${r.date}_${r.hour}`));
          const merged = sortHistoryAscending([...dbRecords, ...localOnly]);
          localStorage.setItem('dcime_whatsapp_history', JSON.stringify(merged));
          return merged;
        });
      }
    } catch (err) {
      console.error("Error fetching telemetry history from database:", err);
    }
  }, [siteCode, currentSite?.site_name, currentSite?.id, employee?.full_name, targetHour]);

  useEffect(() => { fetchDatabaseHistory(); }, [fetchDatabaseHistory]);

  useRealtimeTable({
    table: "telemetry_logs",
    onChange: (payload) => {
      // Filtered in the callback rather than server-side: this table stores
      // the site inside the metrics JSON as well, and older rows predate the
      // site_uuid column being populated.
      const m = (payload.new as any)?.metrics || {};
      if (!payload.new || m.site_id === siteCode || m.site_uuid === currentSite?.id) {
        fetchDatabaseHistory();
      }
    }
  });

  const handleShareAndSave = async () => {
    // iOS Safari only permits window.open while the tap's transient user
    // activation is still alive, and awaiting the Supabase write below burns
    // through it — which is why "Share & Save" silently did nothing on iPhone
    // while working fine on Android. Claim the tab synchronously here, before
    // any await, then point it at WhatsApp once the save settles.
    const shareWindow = window.open('', '_blank');

    const { whatsappPayload, internalPayload } = generateReportTexts({
      siteCode,
      currentSiteName: currentSite?.site_name,
      employeeName: employee?.full_name,
      activePowerSource,
      formData,
      targetHour
    });
    const dateStr = slotDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

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
      const recordKey = `${dateStr}_${hourStr}`;
      const filtered = prev.filter(r => `${r.date}_${r.hour}` !== recordKey);
      const updated = sortHistoryAscending([newRecord, ...filtered]);
      localStorage.setItem('dcime_whatsapp_history', JSON.stringify(updated));
      return updated;
    });

    // Save report text to database via telemetry submission payload
    try {
      // Deliberately does NOT persist the rendered text. History regenerates the
      // summary from metrics on read, so storing a snapshot here only created a
      // stale copy that outranked the real data after an edit.
      await submitTelemetryLog("facility_wide", formData, slotTimestamp);
      toast.success("Log saved to shared database history!");
    } catch (err: any) {
      console.warn("Telemetry DB save warning:", err);
      toast.warning("Network warning: Log saved to local history only.");
    }

    // wa.me is WhatsApp's documented universal link and resolves more reliably
    // on iOS than api.whatsapp.com, which round-trips through a web page first.
    const waUrl = `https://wa.me/?text=${encodeURIComponent(whatsappPayload)}`;

    if (shareWindow && !shareWindow.closed) {
      shareWindow.location.href = waUrl;
    } else {
      // Popup blocked outright — happens when the app is running as an
      // installed PWA in iOS standalone mode. Navigating the current tab is
      // never popup-blocked, and the back gesture returns to the app.
      window.location.href = waUrl;
    }
  };

  // Helper to fetch last stop values of a specific generator.
  // Scoped to THIS site's facility logs — previously read the entire
  // telemetry table unfiltered, so a second site would poison the
  // run-hours memory with foreign data.
  const fetchLastDgMetrics = async (dgId: string) => {
    if (!currentSite?.id) return null;
    try {
      const { data, error } = await supabase
        .from('telemetry_logs')
        .select('metrics')
        .eq('site_uuid', currentSite.id)
        .eq('asset_id', 'facility_wide')
        .not('metrics', 'is', null)
        .order('target_hour', { ascending: false })
        .limit(50);

      if (error) throw error;


      if (data) {
        const lastLogWithDg = data.find((row: any) => {
          const m = (row.metrics || {}) as Record<string, any>;
          return m[`${dgId}_hr_meter_stop`] !== undefined && m[`${dgId}_hr_meter_stop`] !== null && m[`${dgId}_hr_meter_stop`] !== "";
        });

        if (lastLogWithDg) {
          const m = (lastLogWithDg.metrics || {}) as Record<string, any>;
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
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-neutral-400">
        <Loader2 size={32} className="text-brand-500 animate-spin" />
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Loading slot data…</p>
      </div>
    );
  }

  const currentStep = visibleSteps[currentStepIndex];
  const currentStepEquipmentIds = currentStep ? currentStep.equipment_ids : [];

  return (
    <div className="max-w-md mx-auto space-y-6 pb-24">
      {/* Sticky Audit Banner */}
      <div className={`sticky top-0 z-[var(--z-header)] backdrop-blur-md text-white border px-4 py-2.5 rounded-2xl shadow-lg flex items-center justify-between text-[11px] font-black uppercase tracking-wider ${
        isBackdating ? 'bg-warn-900/90 border-warn-700' : 'bg-neutral-900/90 border-neutral-800'
      }`}>
        <span>
          {isBackdating ? 'Backdated Log: ' : 'Logging for Shift: '}
          {targetHour}
        </span>
        <span className={`font-mono ${isBackdating ? 'text-warn-200' : 'text-neutral-400'}`}>
          {isBackdating
            ? slotDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : `Actual: ${currentTime.toLocaleTimeString('en-US', { hour12: false })}`}
        </span>
      </div>

      {/* Backdating is legitimate (catching up a missed slot) but must never be
          silent — the banner keeps the tech aware they aren't logging "now". */}
      {isBackdating && (
        <div className="bg-warn-50 border border-warn-200/70 rounded-2xl px-4 py-2.5 flex items-start gap-2.5 text-[10px] font-bold text-warn-900 mx-1">
          <AlertTriangle size={13} className="shrink-0 mt-0.5 text-warn-600" />
          <span>
            You are logging for <span className="font-black">
              {slotDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>, not today.
          </span>
        </div>
      )}

      {/* Back Button */}
      {handleBack && (
        <div className="px-1">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 py-3 px-4 rounded-xl bg-white border border-neutral-200 text-xs font-bold text-neutral-600 hover:text-brand-600 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
          >
            <ArrowLeft size={14} />
            <span>← Back</span>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="backdrop-blur-md bg-white/75 border border-neutral-200/50 rounded-3xl p-5 shadow-sm">
        <h1 className="text-xl font-black text-neutral-900 tracking-tight">
          Log for {targetHour}
        </h1>
        <p className="text-xs text-neutral-500 mt-1.5 flex flex-wrap gap-2 items-center">
          <span className="font-semibold text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-100">
            {activeChecksLabel(isTwoHour, isFourHour, isDaily)}
          </span>
          {isEditMode && (
            <span className="bg-warn-50 text-warn-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-warn-200 flex items-center gap-1">
              <ClipboardList size={10} /> Editing
            </span>
          )}
          {fsmMode === 'ON_LOAD_TEST' && (
            <span className="bg-warn-50 text-warn-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-warn-200 flex items-center gap-1">
              <Zap size={10} /> Simulated Blackout (On-Load Test)
            </span>
          )}
          {fsmMode === 'OUTAGE' && (
            <span className="bg-danger-50 text-danger-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-danger-200 flex items-center gap-1">
              <Zap size={10} /> Outage Mode
            </span>
          )}
        </p>
      </div>

      {/* Facility State Machine (FSM) Mode Selector */}
      <div className="backdrop-blur-md bg-white/75 border border-neutral-200/50 rounded-3xl p-5 shadow-sm space-y-4">
        <div>
          <span className="text-xs font-black text-neutral-700 uppercase tracking-wider block">Facility Operating Mode</span>
          <span className="text-[10px] text-neutral-400 font-semibold mt-0.5 block">Select active state of site grids and generators</span>
        </div>

        <div className="grid grid-cols-4 gap-2 bg-neutral-100 rounded-2xl p-1 border border-neutral-200/50">
          <button
            type="button"
            onClick={() => setFsmMode('NORMAL')}
            className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center ${fsmMode === 'NORMAL'
                ? "bg-white text-ok-600 shadow-sm border border-neutral-200/30"
                : "text-neutral-500 hover:text-neutral-700"
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
                ? "bg-warn-500 text-white shadow-sm"
                : isDailyTestDoneToday
                  ? "opacity-50 cursor-not-allowed text-neutral-400"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
          >
            <Zap size={14} />
            <span>Daily Test</span>
          </button>

          <button
            type="button"
            onClick={() => setFsmMode('ON_LOAD_TEST')}
            className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center ${fsmMode === 'ON_LOAD_TEST'
                ? "bg-warn-600 text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
              }`}
          >
            <Zap size={14} />
            <span>On-Load</span>
          </button>

          <button
            type="button"
            onClick={() => setFsmMode('OUTAGE')}
            className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center ${fsmMode === 'OUTAGE'
                ? "bg-danger-500 text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
              }`}
          >
            <AlertTriangle size={14} />
            <span>Outage</span>
          </button>
        </div>

        {/* Daily Test completion gatekeeper banner */}
        {isDailyTestDoneToday && (
          <div className="bg-ok-50 border border-ok-200/50 rounded-2xl p-3 flex items-center gap-2.5 text-[10px] font-bold text-ok-800">
            <CheckCircle2 size={14} className="text-ok-600 shrink-0" />
            <div>
              <span>Daily DG No-Load Test completed today</span>
              {dailyTestCompletedInfo && (
                <span className="block text-[9px] font-semibold text-ok-600/80 mt-0.5">
                  At {dailyTestCompletedInfo.time} CAT by {dailyTestCompletedInfo.tech}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Checkbox to mark Daily Test Completed during active test */}
        {fsmMode === 'DAILY_TEST' && !isDailyTestDoneToday && (
          <div className="flex items-center gap-2 bg-warn-50 border border-warn-200/50 rounded-2xl p-3 animate-fade-in">
            <input
              id="mark_daily_completed"
              type="checkbox"
              checked={formData['daily_dg_test_completed'] === true}
              onChange={(e) => handleInputChange('daily_dg_test_completed', e.target.checked)}
              className="w-4 h-4 rounded text-warn-600 focus:ring-warn-500 border-neutral-300 cursor-pointer"
            />
            <label htmlFor="mark_daily_completed" className="text-[10px] font-black text-warn-950 uppercase tracking-wider cursor-pointer">
              Mark Daily DG No-Load Test Completed
            </label>
          </div>
        )}

        {/* Generator fleet toggle */}
        {(fsmMode === 'DAILY_TEST' || fsmMode === 'OUTAGE' || fsmMode === 'ON_LOAD_TEST') && (
          <div className="space-y-2 border-t border-neutral-100 pt-3 animate-fade-in">
            <label className="block text-[9px] font-black text-neutral-400 uppercase tracking-wider">
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
                        ? "bg-neutral-900 text-white border-neutral-950 shadow-sm"
                        : "bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100"
                      }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Mode transparency banner — explains the shorter form instead of
            leaving the technician to guess whether readings went missing. */}
        {hiddenByMode.count > 0 && (
          <div className="bg-neutral-50 border border-neutral-200/70 rounded-2xl p-3 flex items-start gap-2.5 animate-fade-in">
            <EyeOff size={13} className="text-neutral-400 shrink-0 mt-0.5" />
            <div className="text-[10px] leading-relaxed">
              <span className="font-black text-neutral-800 uppercase tracking-wider">
                {hiddenByMode.count} reading{hiddenByMode.count === 1 ? '' : 's'} hidden in this mode
              </span>
              <span className="block font-semibold text-neutral-500 mt-0.5">
                {hiddenByMode.reason} Nothing has been lost — switch mode to log them.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Progress Indicator */}
      {visibleSteps.length > 0 && currentStep && (
        <div className="mx-1 bg-white border border-neutral-100 rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm animate-fade-in">
          <span className="text-[11px] font-black text-neutral-500 uppercase tracking-widest">
            Step {currentStepIndex + 1} of {visibleSteps.length}
          </span>
          <span className="text-xs font-black text-neutral-800 uppercase tracking-wider bg-neutral-100 px-3 py-1 rounded-xl border border-neutral-200">
            {currentStep.name}
          </span>
        </div>
      )}

      {/* Focus Mode Room Pagination (Wizard UI) */}
      <div className="flex-1 overflow-y-auto p-4 pb-52">
        {visibleSteps.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-neutral-100 shadow-sm animate-fade-in">
            {/* An empty round and a round that has not arrived yet look
                identical on screen, and telling a technician there is nothing
                to do when the site is still loading is the worse of the two. */}
            <p className="text-sm font-bold text-neutral-400 uppercase tracking-wider">
              {isModelLoading || isEquipmentLoading
                ? "Loading this site's round…"
                : modelError || equipmentError
                  ? "Could not load this site's equipment."
                  : "No active parameters for this hour."}
            </p>
          </div>
        ) : (
          <PathRenderer
            targetHour={targetHour}
            currentStep={currentStep}
            blueprint={model}
            formData={formData}
            allEquipment={allEquipment}
            fsmMode={fsmMode}
            autoFilledFields={autoFilledFields}
            carriedFields={carriedFields}
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
        <div className="bg-danger-50 border border-danger-200 rounded-2xl p-4 flex items-center gap-3 text-sm text-danger-800 shadow-sm mx-1">
          <AlertTriangle size={18} className="text-danger-600 shrink-0" />
          <span className="font-medium">{submitError}</span>
        </div>
      )}

      {/* Sticky Submit / Pagination Footer */}
      <div className="fixed bottom-16 left-0 w-full p-4 bg-neutral-50 border-t border-neutral-200 z-[var(--z-appnav)] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="max-w-md mx-auto flex items-center gap-3">
          {currentStepIndex > 0 && (
            <button
              type="button"
              onClick={() => setCurrentStepIndex((prev) => prev - 1)}
              className="flex-1 py-3.5 rounded-2xl bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 font-black text-xs tracking-widest uppercase transition-all shadow-sm cursor-pointer text-center"
            >
              ← Prev Step
            </button>
          )}

          {currentStepIndex < visibleSteps.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentStepIndex((prev) => prev + 1)}
              className="flex-1 py-3.5 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-white font-black text-xs tracking-widest uppercase transition-all shadow-md cursor-pointer text-center"
            >
              Next Step →
            </button>
          ) : (
            <button
              onClick={handleDashboardSubmit}
              disabled={isSubmitting || isSuccess}
              className={`flex-1 py-3.5 rounded-2xl text-white font-black text-xs tracking-widest uppercase transition-all shadow-lg flex items-center justify-center gap-2 ${isSubmitting
                  ? "bg-neutral-400 shadow-none cursor-not-allowed text-neutral-100"
                  : isSuccess
                    ? "bg-ok-600 shadow-ok-600/10 active:scale-[0.98]"
                    : (fsmMode === 'OUTAGE' || fsmMode === 'ON_LOAD_TEST')
                      ? "bg-danger-600 hover:bg-danger-700 shadow-danger-600/10 active:scale-[0.98]"
                      : "bg-danger-600 hover:bg-danger-700 shadow-danger-600/10 active:scale-[0.98]"
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
