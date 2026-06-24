import { useState, useEffect } from 'react';
import { supabase } from '@/shared/api/supabaseClient';
import { MASTER_ASSET_DICTIONARY } from '../constants/telemetrySchema';

export const useTelemetryData = (
  targetHour: number,
  onComplete?: () => void,
  onSubmitSuccess?: (hour: number) => void
) => {
  // 2. Exhaustive State Initialization
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

  // Compatibility states for RoutineTasksDashboard
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 6. The Grid Override Boolean
  const isGridOff = formData['grid_status'] === 'OFF';

  // 3. Zero-Delay Local Cache & Supabase Fetch Engine
  useEffect(() => {
    let active = true;

    // Step A (Instant Load)
    const cacheKey = `telemetry_cache_${targetHour}`;
    const cached = localStorage.getItem(cacheKey);
    let hasCache = false;

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setFormData(parsed);
        setIsLoading(false);
        hasCache = true;
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
          const metrics = currentData.metrics as Record<string, any>;
          setFormData(metrics);
          localStorage.setItem(cacheKey, JSON.stringify(metrics));
          setIsLoading(false);
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
            });
          });
        });

        setFormData(newFormState);
        localStorage.setItem(cacheKey, JSON.stringify(newFormState));
        setIsLoading(false);
      } catch (err: any) {
        console.error('[DCIMe] Fetch telemetry error:', err);
        if (active) {
          setFetchError(err.message || 'Failed to fetch telemetry data');
          setIsLoading(false);
        }
      }
    };

    fetchTelemetryData();

    return () => {
      active = false;
    };
  }, [targetHour]);

  // 4. The Input Handler
  const handleInputChange = (id: string, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [id]: value };
      const cacheKey = `telemetry_cache_${targetHour}`;
      localStorage.setItem(cacheKey, JSON.stringify(updated));
      return updated;
    });
    setSubmitError(null);
  };

  // 5. Exhaustive Ambient Average Math & Submission
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    setIsSuccess(false);

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

    // Append ambient_avg_temp to the formData payload
    const payload = {
      ...formData,
    };
    if (ambient_avg_temp !== null) {
      payload['ambient_avg_temp'] = ambient_avg_temp;
    }

    const today = new Date();
    today.setHours(targetHour, 0, 0, 0);
    const targetHourISO = today.toISOString();

    try {
      // Instantly get the cached user session (Zero Network Delay)
      const { data: { session } } = await supabase.auth.getSession();

      // Intelligently fallback: full_name -> email -> 'Unknown Tech'
      const technicianName = session?.user?.user_metadata?.full_name 
        || session?.user?.email 
        || 'Unknown Technician';

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
            technician_name: technicianName // DYNAMIC IDENTITY
          },
          { onConflict: 'target_hour' }
        );

      if (error) {
        throw error;
      }

      // Cleanup: On success, localStorage.removeItem(cacheKey), set isSubmitting(false), call onComplete?.() and onSubmitSuccess?.().
      const cacheKey = `telemetry_cache_${targetHour}`;
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
    isLoading,
    isSubmitting,
    isEditMode,
    handleInputChange,
    handleSubmit,
    isGridOff,

    // Compatibility exports for existing TechDashboard / RoutineTasksDashboard
    handleChange: handleInputChange,
    isSuccess,
    submitError,
    fetchError,
    getVisibleMetrics,
  };
};
