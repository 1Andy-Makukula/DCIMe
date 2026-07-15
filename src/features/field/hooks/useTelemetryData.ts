import { useState, useEffect } from 'react';
import { supabase } from '@/shared/api/supabaseClient';
import { MASTER_ASSET_DICTIONARY } from '../constants/telemetrySchema';
import { useAuth } from '@/shared/context/AuthContext';
import { PAC_CONSTANTS } from '../constants/pacConstants';
import { toast } from 'sonner';

export function useTelemetryData(
  targetHourProp: number | string,
  onComplete?: () => void,
  onSubmitSuccess?: (hour: number) => void
) {
  const targetHour = typeof targetHourProp === "string" && targetHourProp.includes(":")
    ? parseInt(targetHourProp.split(":")[0], 10)
    : Number(targetHourProp);

  const { employee } = useAuth();
  // 2. Exhaustive State Initialization
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [activePowerSource, setActivePowerSource] = useState<'MAINS' | 'GENERATOR'>('MAINS');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

  // Compatibility states for RoutineTasksDashboard
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 6. The Grid Override Boolean
  const isGridOff = formData['grid_status'] === 'OFF';

  const dateStr = new Date().toISOString().slice(0, 10);
  const getCacheKey = (hour: number) => `telemetry_cache_${dateStr}_${hour}`;

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

  // 3. Zero-Delay Local Cache & Supabase Fetch Engine
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
        setActivePowerSource(parsed['grid_status'] === 'OFF' ? 'GENERATOR' : 'MAINS');
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

          // Self-heal: ensure all constants/PAC constants are populated if blank/missing
          MASTER_ASSET_DICTIONARY.forEach((category) => {
            category.assets.forEach((asset) => {
              asset.metrics.forEach((metric) => {
                if (metric.isConstant || metric.defaultValue !== undefined) {
                  const currentVal = metrics[metric.id];
                  if (currentVal === undefined || currentVal === null || currentVal === "") {
                    metrics[metric.id] = metric.defaultValue;
                  }
                }
                if (asset.id.startsWith('pac_')) {
                  const constants = PAC_CONSTANTS[asset.id];
                  if (constants) {
                    let expectedVal: any = undefined;
                    if (metric.id.endsWith('_return_temp_set')) expectedVal = constants.returnTempSet;
                    else if (metric.id.endsWith('_supply_temp_set')) expectedVal = constants.supplyTempSet;
                    else if (metric.id.endsWith('_humidity_set')) expectedVal = constants.humiditySet;
                    else if (metric.id.endsWith('_humidity_actual')) expectedVal = constants.humidityActual;

                    if (expectedVal !== undefined) {
                      const currentVal = metrics[metric.id];
                      if (currentVal === undefined || currentVal === null || currentVal === "") {
                        metrics[metric.id] = expectedVal;
                      }
                    }
                  }
                }
              });
            });
          });

          setFormData(metrics);
          localStorage.setItem(cacheKey, JSON.stringify(metrics));
          setIsLoading(false);
          setActivePowerSource(metrics['grid_status'] === 'OFF' ? 'GENERATOR' : 'MAINS');
          return;
        }

        // Step D (Supabase Query 2 - Carry-Forward)
        const prevHour = targetHour - 1;
        const prevDate = new Date();
        prevDate.setHours(prevHour, 0, 0, 0);
        const prevHourISO = prevDate.toISOString();

        const { data: previousData, error: prevError } = await supabase
          .from('telemetry_logs')
          .select('*')
          .eq('target_hour', prevHourISO)
          .maybeSingle();

        if (!active) return;

        if (prevError) {
          throw prevError;
        }

        const newFormState: Record<string, any> = {};
        const previousMetrics = (previousData?.metrics as Record<string, any>) || {};

        // Loop through every category, asset, and metric in MASTER_ASSET_DICTIONARY
        MASTER_ASSET_DICTIONARY.forEach((category) => {
          category.assets.forEach((asset) => {
            asset.metrics.forEach((metric) => {
              // If a metric has defaultValue, set newFormState[metric.id] = metric.defaultValue
              if (metric.defaultValue !== undefined) {
                newFormState[metric.id] = metric.defaultValue;
              }
              // If a metric has carryForward: true AND previous hour data exists, set newFormState[metric.id] = previousData.metrics[metric.id]
              if (metric.carryForward && previousMetrics[metric.id] !== undefined) {
                newFormState[metric.id] = previousMetrics[metric.id];
              }

              // PAC Constants override for initialization
              if (asset.id.startsWith('pac_')) {
                const constants = PAC_CONSTANTS[asset.id];
                if (constants) {
                  if (metric.id.endsWith('_return_temp_set')) {
                    newFormState[metric.id] = constants.returnTempSet;
                  } else if (metric.id.endsWith('_supply_temp_set')) {
                    newFormState[metric.id] = constants.supplyTempSet;
                  } else if (metric.id.endsWith('_humidity_set')) {
                    newFormState[metric.id] = constants.humiditySet;
                  } else if (metric.id.endsWith('_humidity_actual')) {
                    newFormState[metric.id] = constants.humidityActual;
                  }
                }
              }
            });
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
        setActivePowerSource(newFormState['grid_status'] === 'OFF' ? 'GENERATOR' : 'MAINS');
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
              setActivePowerSource(metrics['grid_status'] === 'OFF' ? 'GENERATOR' : 'MAINS');
            }
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [targetHour]);

  // 4. The Input Handler
  const handleInputChange = (id: string, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [id]: value };
      const cacheKey = getCacheKey(targetHour);
      localStorage.setItem(cacheKey, JSON.stringify(updated));
      return updated;
    });
    setSubmitError(null);
  };

  // 5. Exhaustive Ambient Average Math & Submission
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

    // The Math: Calculate the ambient_avg_temp.
    // You MUST exclusively average these specific exact IDs:
    // server_ambient_temp, pr1_ambient_temp, pr2_ambient_temp, it1_ambient_temp, it2_ambient_temp.
    // Ignore hq_ambient_temp or any empty/null values.
    const ambientIDs = [
      'server_ambient_temp',
      'pr1_ambient_temp',
      'pr2_ambient_temp',
      'it1_ambient_temp',
      'it2_ambient_temp',
      'media_ambient_temp',
    ];

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
      grid_status: activePowerSource === 'GENERATOR' ? 'OFF' : 'ON'
    };
    if (ambient_avg_temp !== null) {
      payload['ambient_avg_temp'] = ambient_avg_temp;
    }

    if (activePowerSource === 'GENERATOR') {
      payload['active_dg_hq'] = true;
      
      // Force all Zesco/Grid metrics (grid_main) to null
      const gridAsset = MASTER_ASSET_DICTIONARY
        .find((cat) => cat.categoryName.includes('Main Grid'))
        ?.assets.find((ast) => ast.id === 'grid_main');

      if (gridAsset) {
        gridAsset.metrics.forEach((metric) => {
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

      // Strip legacy metrics for offline assets
      MASTER_ASSET_DICTIONARY.forEach((cat) => {
        cat.assets.forEach((asset) => {
          const normalizedAssetId = asset.id.toLowerCase().replace(/-/g, '_');
          if (offlineAssetIds.has(normalizedAssetId)) {
            asset.metrics.forEach((m) => {
              delete payload[m.id];
            });
          }
        });
      });

      // Strip dynamic parameters for offline assets
      if (allParams) {
        allParams.forEach((param) => {
          const normalizedAssetId = param.equipment_id.toLowerCase().replace(/-/g, '_');
          if (offlineAssetIds.has(normalizedAssetId)) {
            delete payload[`param_${param.id}`];
          }
          if (param.equipment_id === 'grid_main' && activePowerSource === 'GENERATOR') {
            payload[`param_${param.id}`] = null;
          }
        });
      }
      // Instantly get the cached user session (Zero Network Delay)
      const { data: { session } } = await supabase.auth.getSession();

      // Intelligently fallback: employee.full_name -> auth.metadata -> auth.email -> 'Unknown Tech'
      const technicianName = employee?.full_name
        || session?.user?.user_metadata?.full_name 
        || session?.user?.email 
        || 'Unknown Technician';

      const firstName = (technicianName || 'Field Tech').trim().split(/\s+/)[0];

      // The Upsert: Execute a Supabase .upsert to telemetry_logs.
      const { error } = await supabase
        .from('telemetry_logs')
        .upsert(
          {
            target_hour: targetHourISO,
            frequency: 'hourly',
            metrics: payload,
            is_edited: isEditMode,
            asset_id: 'facility_wide', // Keeping site hardcoded as requested
            technician_name: firstName // DYNAMIC IDENTITY (First name only)
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
 
      // Cleanup: On success, localStorage.removeItem(cacheKey), set isSubmitting(false), call onComplete?.() and onSubmitSuccess?.().
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

  // 7. Return Statement
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

    // Compatibility exports for existing TechDashboard / RoutineTasksDashboard
    handleChange: handleInputChange,
    isSuccess,
    submitError,
    fetchError,
    getVisibleMetrics,
  };
}
