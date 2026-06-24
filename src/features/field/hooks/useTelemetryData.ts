import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/shared/api/supabaseClient';
import { MASTER_ASSET_DICTIONARY, AssetMetric } from '../constants/telemetrySchema';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Builds a UTC ISO timestamp anchored to a specific hour today */
function buildHourTimestamp(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/**
 * Custom React Hook managing the state, local caching, background synchronization,
 * ambient averaging calculations, and database submissions for routine telemetry.
 */
export function useTelemetryData(
  targetHour: number, 
  onComplete?: () => void, 
  onSubmitSuccess?: (hour: number) => void
) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Frequency accordion math ───────────────────────────────────────────────
  const isTwoHour  = targetHour % 2 === 0;
  const isFourHour = targetHour % 4 === 0;
  const isDaily    = targetHour === 9;

  // ── Outage override ────────────────────────────────────────────────────────
  const isGridOff = formData['grid_status'] === 'OFF';

  // ── Metric visibility filter ───────────────────────────────────────────────
  const getVisibleMetrics = useCallback(
    (assetId: string, metrics: AssetMetric[]): AssetMetric[] => {
      return metrics.filter((metric) => {
        if (assetId.includes('dg_') && isGridOff) return true;

        switch (metric.frequency) {
          case 'hourly':  return true;
          case '2-hour':  return isTwoHour;
          case '4-hour':  return isFourHour;
          case 'daily':   return isDaily;
          default:        return false;
        }
      });
    },
    [isTwoHour, isFourHour, isDaily, isGridOff]
  );

  // ── Zero-Delay Fetch Engine ────────────────────────────────────────────────
  useEffect(() => {
    const fetchSlotData = async () => {
      const cacheKey = `telemetry_cache_${targetHour}`;
      
      // 1. Instant Local Cache Load
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setFormData(parsed);
          setIsLoading(false); // Render UI immediately
        } catch (e) {
          console.warn('[DCIMe] Failed to parse telemetry cache:', e);
        }
      } else {
        setIsLoading(true);
      }

      setIsEditMode(false);
      setFetchError(null);

      try {
        const currentTimestamp = buildHourTimestamp(targetHour);
        const prevTimestamp    = buildHourTimestamp(targetHour - 1);

        // ── Query 1: check whether this slot already has a submission ──────────
        const { data: existing, error: existingErr } = await supabase
          .from('telemetry_logs')
          .select('metrics')
          .eq('target_hour', currentTimestamp)
          .eq('frequency', 'hourly')
          .maybeSingle();

        if (existingErr) {
          throw new Error(`[Current Hour Query] ${existingErr.message}`);
        }

        if (existing?.metrics) {
          const fetchedData = existing.metrics as Record<string, any>;
          setFormData(fetchedData);
          setIsEditMode(true);
          localStorage.setItem(cacheKey, JSON.stringify(fetchedData));
          return;
        }

        // ── Query 2: no current-hour data — fetch previous hour for carry-forward
        const { data: previous, error: prevErr } = await supabase
          .from('telemetry_logs')
          .select('metrics')
          .eq('target_hour', prevTimestamp)
          .eq('frequency', 'hourly')
          .maybeSingle();

        if (prevErr) {
          throw new Error(`[Previous Hour Query] ${prevErr.message}`);
        }

        const prevMetrics: Record<string, any> = (previous?.metrics as Record<string, any>) ?? {};

        // ── Build initial formData from dictionary defaults & carry-forwards ───
        const seed: Record<string, any> = {};

        MASTER_ASSET_DICTIONARY.forEach((category) => {
          category.assets.forEach((asset) => {
            asset.metrics.forEach((metric) => {
              if (metric.defaultValue !== undefined) {
                seed[metric.id] = metric.defaultValue;
              }
              if (metric.carryForward && prevMetrics[metric.id] !== undefined) {
                seed[metric.id] = prevMetrics[metric.id];
              }
            });
          });
        });

        setFormData(seed);
        localStorage.setItem(cacheKey, JSON.stringify(seed));
      } catch (err: any) {
        console.error('[DCIMe] fetchSlotData error:', err);
        // Only trigger visible error if we do not have cached data as fallback
        if (!localStorage.getItem(cacheKey)) {
          setFetchError(err.message || 'Failed to load telemetry slot data');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchSlotData();
  }, [targetHour]);

  // ── Input change handler with local cache update ───────────────────────────
  const handleChange = useCallback((metricId: string, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [metricId]: value };
      localStorage.setItem(`telemetry_cache_${targetHour}`, JSON.stringify(next));
      return next;
    });
    setSubmitError(null);
  }, [targetHour]);

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    // Calculate ambient average dynamically checking visible metrics
    const tempValues: number[] = [];
    MASTER_ASSET_DICTIONARY.forEach((category) => {
      category.assets.forEach((asset) => {
        if (!asset.id.includes('ambient') || asset.id === 'hq_ambient') return;
        asset.metrics.forEach((metric) => {
          if (metric.id.endsWith('_temp') || metric.id.endsWith('_ambient_temp')) {
            const visible = getVisibleMetrics(asset.id, asset.metrics).some(
              (m) => m.id === metric.id
            );
            const raw = formData[metric.id];
            if (visible && raw !== undefined && raw !== '' && raw !== null) {
              const parsed = parseFloat(raw);
              if (!isNaN(parsed)) tempValues.push(parsed);
            }
          }
        });
      });
    });

    const ambientAvg =
      tempValues.length > 0
        ? parseFloat((tempValues.reduce((a, b) => a + b, 0) / tempValues.length).toFixed(1))
        : null;

    const payload = {
      ...formData,
      ...(ambientAvg !== null ? { ambient_avg_temp: ambientAvg } : {}),
    };

    try {
      const { error } = await supabase.from('telemetry_logs').upsert(
        {
          target_hour: buildHourTimestamp(targetHour),
          frequency: 'hourly',
          metrics: payload,
          is_edited: isEditMode,
          asset_id: 'facility_wide',
          technician_name: 'Anderson M.'
        },
        { onConflict: 'target_hour' }
      );

      if (error) throw error;

      // Clear cache for this hour on success
      localStorage.removeItem(`telemetry_cache_${targetHour}`);

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        if (onComplete) {
          onComplete();
        } else if (onSubmitSuccess) {
          onSubmitSuccess(targetHour);
        }
      }, 900);
    } catch (err: any) {
      console.error('[DCIMe] submit error:', err.message || err);
      setSubmitError(err.message || 'Failed to save telemetry log');
    } finally {
      setIsSubmitting(false);
    }
  }, [targetHour, formData, isEditMode, getVisibleMetrics, onComplete, onSubmitSuccess]);

  return {
    formData,
    isLoading,
    isEditMode,
    isSubmitting,
    isSuccess,
    submitError,
    fetchError,
    handleChange,
    handleSubmit,
    getVisibleMetrics
  };
}
