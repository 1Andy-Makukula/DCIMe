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
          } else {
            keysToRemove.push(key);
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
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const { data, error } = await supabase
          .from('telemetry_logs')
          .select('metrics, technician_name, target_hour')
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
    const today = new Date();
    today.setHours(targetHour, 0, 0, 0);
    const targetHourISO = today.toISOString();

    const fetchTelemetryData = async () => {
      try {
        // Step C (Supabase Query 1 - Current Hour)
        const { data: currentData, error: currentError } = await supabase
          .from('telemetry_logs')
          .select('*')
          .eq('target_hour', targetHourISO)
          .maybeSingle();

        if (!active) return;

        if (currentError) {
          throw currentError;
        }

        if (currentData && currentData.metrics) {
          setIsEditMode(true);
          const metrics = { ...currentData.metrics } as Record<string, any>;

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

        // Step D (Supabase Query 2 - Carry-Forward)
        const { data: previousData, error: prevError } = await supabase
          .from('telemetry_logs')
          .select('*')
          .lt('target_hour', targetHourISO)
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

        // Carry forward all asset status values (e.g. status_pac_server_em1 = 'OFFLINE')
        Object.keys(previousMetrics).forEach((key) => {
          if (key.startsWith('status_')) {
            newFormState[key] = previousMetrics[key];
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

    // Subscribe to realtime updates for the current target hour
    const channel = supabase
      .channel(`telemetry_logs_realtime_${targetHourISO}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'telemetry_logs',
          filter: `target_hour=eq.${targetHourISO}`
        },
        (payload) => {
          if (!active) return;
          if (payload.eventType === 'DELETE') {
            setFormData({});
            setIsEditMode(false);
          } else {
            const metrics = payload.new?.metrics as Record<string, any>;
            if (metrics) {
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
  }, [targetHour, siteCode]);

  // Dynamic Ambient Average Temperature Calculations
  useEffect(() => {
    if (formData && Object.keys(formData).length > 0) {
      const updated = { ...formData };
      let changed = false;

      blueprint.rooms.forEach((room: any) => {
        const envEquip = blueprint.equipment.find(
          (eq: any) => eq.room_id === room.id && eq.category === 'ENVIRONMENT'
        );
        const ambientMetric = envEquip?.metrics.find((m: any) => m.id.endsWith('_ambient_temp'));
        if (!ambientMetric) return;

        const roomAircons = blueprint.equipment.filter(
          (eq: any) => eq.room_id === room.id && eq.category === 'AIRCON'
        );

        const temperatures: number[] = [];
        roomAircons.forEach((ac: any) => {
          const status = formData[`status_${ac.id}`] || 'ONLINE';
          if (status !== 'OFFLINE') {
            const tempVal = parseFloat(formData[`${ac.id}_return_temp_actual`]);
            if (!isNaN(tempVal)) {
              temperatures.push(tempVal);
            }
          }
        });

        if (temperatures.length > 0) {
          const avg = parseFloat((temperatures.reduce((a, b) => a + b, 0) / temperatures.length).toFixed(1));
          if (formData[ambientMetric.id] !== avg) {
            updated[ambientMetric.id] = avg;
            changed = true;
          }
        }
      });

      if (changed) {
        setFormData(updated);
        const cacheKey = getCacheKey(targetHour);
        localStorage.setItem(cacheKey, JSON.stringify(updated));
      }
    }
  }, [formData, siteCode]);

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
      const today = new Date();
      today.setHours(targetHour, 0, 0, 0);
      const targetHourISO = today.toISOString();

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

      // Upsert to telemetry_logs
      const { error } = await supabase
        .from('telemetry_logs')
        .upsert(
          {
            target_hour: targetHourISO,
            frequency: 'hourly',
            metrics: payload,
            is_edited: isEditMode,
            asset_id: 'facility_wide',
            technician_name: firstName
          },
          { onConflict: 'target_hour' }
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
        const { data } = await supabase
          .from('shift_reports')
          .select('log_id')
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();
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
  const isTwoHour = targetHour % 2 === 0;
  const isFourHour = targetHour % 4 === 0;
  const isDaily = targetHour === 9;

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
