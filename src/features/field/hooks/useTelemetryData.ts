// src/features/field/hooks/useTelemetryData.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/shared/api/supabaseClient';
import { useAuth } from '@/shared/context/AuthContext';
import { useCurrentSite } from '@/shared/context/SiteContext';
import { SITE_BLUEPRINTS } from '@/config/sites';
import { toast } from 'sonner';
import { useFacilityState } from './useFacilityState';

export function useTelemetryData(
  targetHourProp: number | string,
  onComplete?: () => void,
  onSubmitSuccess?: (hour: number) => void
) {
  const targetHour = typeof targetHourProp === "string" && targetHourProp.includes(":")
    ? parseInt(targetHourProp.split(":")[0], 10)
    : Number(targetHourProp);

  const { employee } = useAuth();
  const { currentSite } = useCurrentSite();
  const siteCode = currentSite?.site_code || "NTC";
  const blueprint = SITE_BLUEPRINTS[siteCode] || SITE_BLUEPRINTS.NTC;

  // Exhaustive State Initialization
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [activePowerSource, setActivePowerSource] = useState<'MAINS' | 'GENERATOR'>('MAINS');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

  // FSM states
  const { fsmMode, setFsmMode } = useFacilityState();
  const [isDailyTestDoneToday, setIsDailyTestDoneToday] = useState<boolean>(false);
  const [dailyTestCompletedInfo, setDailyTestCompletedInfo] = useState<{ time: string; tech: string } | null>(null);

  // Compatibility states for RoutineTasksDashboard
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // The Grid Override Boolean
  const isGridOff = formData['grid_status'] === 'OFF' || fsmMode === 'OUTAGE' || fsmMode === 'ON_LOAD_TEST';

  const dateStr = new Date().toISOString().slice(0, 10);
  const getCacheKey = (hour: number) => `telemetry_cache_${dateStr}_${hour}`;

  useEffect(() => {
    setFormData((prev) => {
      if (prev['fsm_mode'] === fsmMode) return prev;
      const updated = {
        ...prev,
        fsm_mode: fsmMode,
        grid_status: (fsmMode === 'OUTAGE' || fsmMode === 'ON_LOAD_TEST') ? 'OFF' : 'ON'
      };
      const cacheKey = getCacheKey(targetHour);
      localStorage.setItem(cacheKey, JSON.stringify(updated));
      return updated;
    });
    setActivePowerSource((fsmMode === 'OUTAGE' || fsmMode === 'ON_LOAD_TEST') ? 'GENERATOR' : 'MAINS');
  }, [fsmMode, targetHour]);

  // Purge cached telemetry forms older than 48 hours to prevent localStorage bloat
  useEffect(() => {
    try {
      const now = Date.now();
      const prefix = 'telemetry_cache_';
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          const parts = key.split('_');
          if (parts.length >= 3) {
            const datePart = parts[2];
            const cachedDate = new Date(datePart);
            if (!isNaN(cachedDate.getTime())) {
              const diffMs = now - cachedDate.getTime();
              const diffHours = diffMs / (1000 * 60 * 60);
              if (diffHours > 48) {
                keysToRemove.push(key);
              }
            }
          }
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.warn('[DCIMe] Failed to run cache garbage collection:', e);
    }
  }, []);

  // Check if Daily DG No-Load Test was completed today
  useEffect(() => {
    const checkDailyTest = async () => {
      try {
        // M-2: scope to current site — without this filter, any site's daily
        // test would mark THIS site's isDailyTestDoneToday as true
        if (!currentSite?.id) return;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const { data, error } = await supabase
          .from('telemetry_logs')
          .select('metrics, technician_name, target_hour')
          .eq('site_uuid', currentSite.id)
          .gte('target_hour', todayStart.toISOString())
          .lte('target_hour', todayEnd.toISOString());

        if (error) throw error;

        if (data) {
          const completedLog = data.find((row: any) => row.metrics?.daily_dg_test_completed === true);
          if (completedLog) {
            setIsDailyTestDoneToday(true);
            const timeStr = new Date(completedLog.target_hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            setDailyTestCompletedInfo({
              time: timeStr,
              tech: completedLog.technician_name || "Field Tech"
            });
          } else {
            setIsDailyTestDoneToday(false);
            setDailyTestCompletedInfo(null);
          }
        }
      } catch (e) {
        console.error('[DCIMe] Failed to check daily DG test status:', e);
      }
    };

    checkDailyTest();
  }, [formData?.daily_dg_test_completed]);

  // Zero-Delay Local Cache & Supabase Fetch Engine
  useEffect(() => {
    let active = true;

    // Step A (Instant Load)
    const cacheKey = getCacheKey(targetHour);
    const cached = localStorage.getItem(cacheKey);
    let hasCache = false;

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setFormData(parsed);
        setIsLoading(false);
        hasCache = true;
        setActivePowerSource(parsed['fsm_mode'] === 'OUTAGE' || parsed['fsm_mode'] === 'ON_LOAD_TEST' || parsed['grid_status'] === 'OFF' ? 'GENERATOR' : 'MAINS');
      } catch (e) {
        console.warn('[DCIMe] Failed to parse telemetry cache:', e);
      }
    }

    if (!hasCache) {
      setFormData({});
      setIsLoading(true);
    }

    setIsEditMode(false);
    setFetchError(null);
    setIsSuccess(false);

    // Step B (Date Construction)
    // Build targetHourISO from LOCAL date components so that the stored UTC
    // timestamp round-trips back to the correct local clock hour.
    // e.g. UTC+2: local 00:00 → stored as 2026-07-22T22:00:00Z → displays as 00:00 ✓
    // The previous UTC-based approach stored local 00:00 as 2026-07-23T00:00:00Z
    // which displayed as 02:00 in UTC+2. ✗
    const numericTargetH = typeof targetHour === 'number'
      ? targetHour
      : parseInt(String(targetHour || '0').split(':')[0], 10);
    const safeH = isNaN(numericTargetH) ? 0 : numericTargetH;

    const now = new Date();
    const targetHourISO = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      safeH, 0, 0, 0
    ).toISOString();

    const fetchTelemetryData = async () => {
      try {
        // Step C (Supabase Query 1 - Current Hour)
        if (!currentSite?.id) {
          // Do not read database using default/fallback NTC site identity if site context is not loaded yet
          setIsLoading(false);
          return;
        }

        // Step C (Supabase Query 1 - Current Hour scoped to current site)
        const { data: currentData, error: currentError } = await supabase
          .from('telemetry_logs')
          .select('*')
          .eq('target_hour', targetHourISO)
          .or(`metrics->>site_uuid.eq.${currentSite.id},metrics->>site_id.eq.${siteCode}`)
          .maybeSingle();

        if (!active) return;

        if (currentError) {
          throw currentError;
        }

        if (currentData && currentData.metrics) {
          setIsEditMode(true);
          const metrics = { ...(currentData.metrics as Record<string, any>) };

          // Self-heal: ensure all constants from blueprint are populated if blank/missing
          blueprint.equipment.forEach((equip: any) => {
            equip.metrics.forEach((metric: any) => {
              if (metric.is_constant || metric.default_value !== undefined) {
                const currentVal = metrics[metric.id];
                if (currentVal === undefined || currentVal === null || currentVal === "") {
                  metrics[metric.id] = metric.default_value;
                }
              }
            });
          });

          setFormData(metrics);
          localStorage.setItem(cacheKey, JSON.stringify(metrics));
          setIsLoading(false);
          setActivePowerSource(metrics['fsm_mode'] === 'OUTAGE' || metrics['fsm_mode'] === 'ON_LOAD_TEST' || metrics['grid_status'] === 'OFF' ? 'GENERATOR' : 'MAINS');
          return;
        }

        // Step D (Supabase Query 2 - Carry-Forward scoped to current site)
        const { data: previousData, error: prevError } = await supabase
          .from('telemetry_logs')
          .select('*')
          .lt('target_hour', targetHourISO)
          .or(`metrics->>site_uuid.eq.${currentSite.id},metrics->>site_id.eq.${siteCode}`)
          .order('target_hour', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!active) return;

        if (prevError) {
          throw prevError;
        }

        const newFormState: Record<string, any> = {};
        const previousMetrics = (previousData?.metrics as Record<string, any>) || {};

        blueprint.equipment.forEach((equip: any) => {
          equip.metrics.forEach((metric: any) => {
            if (metric.default_value !== undefined) {
              newFormState[metric.id] = metric.default_value;
            }
            if (previousMetrics[metric.id] !== undefined) {
              newFormState[metric.id] = previousMetrics[metric.id];
            }
          });
        });

        // Carry forward all asset status values & persistent comments (e.g. status_pac_server_em1 = 'OFFLINE', comment_pac_server_em1 = 'Compressor failure')
        Object.keys(previousMetrics).forEach((key) => {
          if (key.startsWith('status_') || key.startsWith('comment_')) {
            newFormState[key] = previousMetrics[key];
          }
        });

        // Ensure background constant remarks for PACs default to "OK" if unspecified
        blueprint.equipment.forEach((equip: any) => {
          if (equip.category === 'AIRCON') {
            const remarkKey = `${equip.id}_remark`;
            if (newFormState[remarkKey] === undefined) {
              newFormState[remarkKey] = 'OK';
            }
          }
        });

        setFormData(newFormState);
        localStorage.setItem(cacheKey, JSON.stringify(newFormState));
        setIsLoading(false);
        setActivePowerSource(newFormState['fsm_mode'] === 'OUTAGE' || newFormState['fsm_mode'] === 'ON_LOAD_TEST' || newFormState['grid_status'] === 'OFF' ? 'GENERATOR' : 'MAINS');
      } catch (err: any) {
        console.error('[DCIMe] Fetch telemetry error:', err);
        if (active) {
          setFetchError(err.message || 'Failed to fetch telemetry data');
          setIsLoading(false);
        }
      }
    };

    fetchTelemetryData();

    // H-3 FIX: Add site_uuid to the realtime subscription filter.
    // The previous filter only narrowed by target_hour — every client received
    // every site's telemetry changes for that hour, with site isolation done
    // purely in JS. With RLS now enforcing site scope server-side (Phase 1),
    // adding site_uuid here also prevents unnecessary cross-site WS traffic.
    const siteUuid = currentSite?.id;
    const realtimeFilter = siteUuid
      ? `target_hour=eq.${targetHourISO},site_uuid=eq.${siteUuid}`
      : `target_hour=eq.${targetHourISO}`;

    const channel = supabase
      .channel(`telemetry_logs_realtime_${targetHourISO}_${siteUuid ?? 'global'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'telemetry_logs',
          filter: realtimeFilter
        },
        (payload) => {
          if (!active) return;
          if (payload.eventType === 'DELETE') {
            setFormData({});
            setIsEditMode(false);
          } else {
            const metrics = payload.new?.metrics as Record<string, any>;
            // Secondary JS-side guard — defence-in-depth in case filter isn't
            // supported on this Supabase plan (some plans don't allow multi-column filters)
            if (metrics && (metrics.site_id === siteCode || metrics.site_uuid === siteUuid)) {
              setFormData(metrics);
              setIsEditMode(true);
              localStorage.setItem(cacheKey, JSON.stringify(metrics));
              setActivePowerSource(metrics['fsm_mode'] === 'OUTAGE' || metrics['fsm_mode'] === 'ON_LOAD_TEST' || metrics['grid_status'] === 'OFF' ? 'GENERATOR' : 'MAINS');
            }
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  // M-1 FIX: add currentSite?.id to deps — if the site UUID changes (admin
  // switches sites), the subscription must re-register with the new filter.
  }, [targetHour, siteCode, currentSite?.id]);

  // Ambient temperature & humidity inputs are preserved directly as raw values

  // The Input Handler
  const handleInputChange = (id: string, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [id]: value };
      const cacheKey = getCacheKey(targetHour);
      localStorage.setItem(cacheKey, JSON.stringify(updated));
      return updated;
    });
    setSubmitError(null);
  };



  // Exhaustive Ambient Average Math & Submission
  const handleSubmit = async (activeGenerators: string[] = []) => {
    setIsSubmitting(true);
    setSubmitError(null);
    setIsSuccess(false);

    // Validate run hours for active generators
    for (const dgId of activeGenerators) {
      const startVal = parseFloat(formData[`${dgId}_hr_meter_start`]);
      const stopVal = parseFloat(formData[`${dgId}_hr_meter_stop`]);
      if (!isNaN(startVal) && !isNaN(stopVal)) {
        const runHours = stopVal - startVal;
        if (runHours < 0) {
          toast.error('Invalid Run Hours: Stop meter cannot be lower than Start meter');
          setIsSubmitting(false);
          return;
        }
      }
    }

    // Calculate theoretical fuel burn for active generators (Dual-Tier Day Tank Math)
    const fuelBurnUpdates: Record<string, any> = {};
    activeGenerators.forEach((dgId) => {
      const startVal = parseFloat(formData[`${dgId}_hr_meter_start`]);
      const stopVal = parseFloat(formData[`${dgId}_hr_meter_stop`]);
      if (!isNaN(startVal) && !isNaN(stopVal)) {
        const runHours = stopVal - startVal;
        if (runHours >= 0) {
          const theoreticalBurn = runHours * 150;
          fuelBurnUpdates[`${dgId}_calculated_fuel_burn`] = parseFloat(theoreticalBurn.toFixed(2));
        }
      }
    });

    // Calculate the ambient_avg_temp dynamically by scanning for all ENVIRONMENT ambient temp metrics
    const ambientIDs: string[] = [];
    blueprint.equipment.forEach((eq: any) => {
      if (eq.category === 'ENVIRONMENT') {
        eq.metrics.forEach((m: any) => {
          if (m.id.endsWith('_ambient_temp')) {
            ambientIDs.push(m.id);
          }
        });
      }
    });

    const tempValues: number[] = [];
    ambientIDs.forEach((id) => {
      const val = formData[id];
      if (val !== undefined && val !== null && val !== '') {
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) {
          tempValues.push(parsed);
        }
      }
    });

    let ambient_avg_temp: number | null = null;
    if (tempValues.length > 0) {
      const sum = tempValues.reduce((acc, curr) => acc + curr, 0);
      ambient_avg_temp = parseFloat((sum / tempValues.length).toFixed(1));
    }

    // Append ambient_avg_temp and day-tank fuel burn to the formData payload
    const payload: Record<string, any> = {
      ...formData,
      ...fuelBurnUpdates,
      fsm_mode: fsmMode,
      grid_status: (fsmMode === 'OUTAGE' || fsmMode === 'ON_LOAD_TEST' || activePowerSource === 'GENERATOR') ? 'OFF' : 'ON'
    };
    if (ambient_avg_temp !== null) {
      payload['ambient_avg_temp'] = ambient_avg_temp;
    }

    if (fsmMode === 'ON_LOAD_TEST') {
      payload['outage_type'] = 'planned_test';
    } else if (fsmMode === 'OUTAGE') {
      payload['outage_type'] = 'grid_failure';
    }

    if (fsmMode === 'OUTAGE' || fsmMode === 'ON_LOAD_TEST' || activePowerSource === 'GENERATOR') {
      payload['active_dg_hq'] = true;
      
      // Force all Zesco/Grid metrics (grid_main) to null
      const gridAsset = blueprint.equipment.find((eq: any) => eq.id === 'grid_main');
      if (gridAsset) {
        gridAsset.metrics.forEach((metric: any) => {
          payload[metric.id] = null;
        });
      }
    }

    try {
      // Same local-time construction as the fetch effect above
      const numericTargetH = typeof targetHour === 'number'
        ? targetHour
        : parseInt(String(targetHour || '0').split(':')[0], 10);
      const safeH = isNaN(numericTargetH) ? 0 : numericTargetH;

      const now = new Date();
      const targetHourISO = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        safeH, 0, 0, 0
      ).toISOString();

      // Fetch all parameters to map parameter_id to equipment_id
      const { data: allParams } = await supabase
        .from('equipment_parameters')
        .select('id, equipment_id');

      const offlineAssetIds = new Set<string>();
      Object.keys(formData).forEach((key) => {
        if (key.startsWith('status_') && formData[key] === 'OFFLINE') {
          const assetId = key.substring(7);
          offlineAssetIds.add(assetId.toLowerCase().replace(/-/g, '_'));
        }
      });

      // Strip metrics for offline assets
      blueprint.equipment.forEach((equip: any) => {
        const normalizedAssetId = equip.id.toLowerCase().replace(/-/g, '_');
        if (offlineAssetIds.has(normalizedAssetId)) {
          equip.metrics.forEach((m: any) => {
            delete payload[m.id];
          });
        }
      });

      // Strip dynamic parameters for offline assets
      if (allParams) {
        allParams.forEach((param) => {
          const normalizedAssetId = param.equipment_id.toLowerCase().replace(/-/g, '_');
          if (offlineAssetIds.has(normalizedAssetId)) {
            delete payload[`param_${param.id}`];
          }
          if (param.equipment_id === 'grid_main' && (fsmMode === 'OUTAGE' || fsmMode === 'ON_LOAD_TEST' || activePowerSource === 'GENERATOR')) {
            payload[`param_${param.id}`] = null;
          }
        });
      }
      
      // Instantly get the cached user session (Zero Network Delay)
      const { data: { session } } = await supabase.auth.getSession();

      const technicianName = employee?.full_name
        || session?.user?.user_metadata?.full_name 
        || session?.user?.email 
        || 'Unknown Technician';

      const firstName = (technicianName || 'Field Tech').trim().split(/\s+/)[0];

      // Add site isolation metadata to metrics JSONB payload
      payload['site_id'] = siteCode;
      payload['site_uuid'] = currentSite?.id || null;

      // Upsert to telemetry_logs
      // C-1: Use the composite conflict key (target_hour, site_uuid) so that
      // each site has its own unique slot per hour — prevents cross-site overwrites.
      const { error } = await supabase
        .from('telemetry_logs')
        .upsert(
          {
            target_hour: targetHourISO,
            frequency: 'hourly',
            metrics: payload,
            is_edited: isEditMode,
            asset_id: 'facility_wide',
            technician_name: firstName,
            technician_id: employee?.id || null,
            site_uuid: currentSite?.id || null
          },
          { onConflict: 'target_hour,site_uuid' }
        );

      if (error) {
        throw error;
      }

      // Update active_power_source in public.shift_reports for the current shift
      let targetShiftLogId: string | null = null;
      if (employee?.id) {
        const { data } = await supabase
          .from('shift_reports')
          .select('log_id')
          .eq('logged_by', employee.id)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) targetShiftLogId = data.log_id;
      }
      
      if (!targetShiftLogId) {
        // H-7 FIX: scope fallback query to current site.
        // Without the site_uuid filter, this returns the most recent shift
        // report across ALL sites, then updates that report's power source —
        // potentially overwriting another site's shift record.
        const siteId = currentSite?.id;
        const shiftQuery = supabase
          .from('shift_reports')
          .select('log_id')
          .order('timestamp', { ascending: false })
          .limit(1);
        if (siteId) {
          shiftQuery.eq('site_uuid', siteId);
        }
        const { data } = await shiftQuery.maybeSingle();
        if (data) targetShiftLogId = data.log_id;
      }

      if (targetShiftLogId) {
        await supabase
          .from('shift_reports')
          .update({ active_power_source: activePowerSource })
          .eq('log_id', targetShiftLogId);
      }
 
      const cacheKey = getCacheKey(targetHour);
      localStorage.removeItem(cacheKey);
      
      setIsSuccess(true);
      setIsSubmitting(false);

      onComplete?.();
      onSubmitSuccess?.(targetHour);
    } catch (err: any) {
      console.error('[DCIMe] Submit telemetry error:', err);
      setSubmitError(err.message || 'Failed to submit telemetry data');
      setIsSubmitting(false);
    }
  };

  // Compatibility helper: getVisibleMetrics
  const numericHour = typeof targetHour === 'number'
    ? targetHour
    : parseInt(String(targetHour || '0').split(':')[0], 10);

  const isTwoHour = !isNaN(numericHour) && numericHour % 2 === 0;
  const isFourHour = !isNaN(numericHour) && numericHour % 4 === 0;
  const isDaily = numericHour === 9;

  const getVisibleMetrics = (assetId: string, metrics: any[]): any[] => {
    return metrics.filter((metric) => {
      if (assetId.includes('dg_') && isGridOff) return true;

      switch (metric.frequency) {
        case 'hourly':
          return true;
        case '2-hour':
          return isTwoHour;
        case '4-hour':
          return isFourHour;
        case 'daily':
          return isDaily;
        default:
          return false;
      }
    });
  };

  // Return Statement
  return {
    formData,
    setFormData,
    isLoading,
    isSubmitting,
    isEditMode,
    handleInputChange,
    handleSubmit,
    isGridOff,
    activePowerSource,
    setActivePowerSource,

    // FSM exports
    fsmMode,
    setFsmMode,
    isDailyTestDoneToday,
    dailyTestCompletedInfo,

    // Compatibility exports for existing TechDashboard / RoutineTasksDashboard
    handleChange: handleInputChange,
    isSuccess,
    submitError,
    fetchError,
    getVisibleMetrics,
  };
}
