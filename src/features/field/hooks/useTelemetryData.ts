// src/features/field/hooks/useTelemetryData.ts
import { useState, useEffect } from 'react';
import { useRealtimeTable } from "@/shared/api/realtime";
import { supabase } from '@/shared/api/supabaseClient';
import { useAuth } from '@/shared/context/AuthContext';
import { useCurrentSite } from '@/shared/context/SiteContext';
import { DEFAULT_SITE_CODE } from '@/config/sites';
import { fetchSiteModel } from '@/shared/api/siteModel';
import { toast } from 'sonner';
import { useFacilityState } from './useFacilityState';
import { toLocalDateKey, slotISO, parseHour } from '../utils/dateKeys';
import { useShiftSession } from '@/shared/context/ShiftContext';

export function useTelemetryData(
  targetHourProp: number | string,
  onComplete?: () => void,
  onSubmitSuccess?: (hour: number) => void,
  /** Local day being logged. Defaults to today so existing callers are unaffected. */
  selectedDate?: Date
) {
  const targetHour = typeof targetHourProp === "string" && targetHourProp.includes(":")
    ? parseInt(targetHourProp.split(":")[0], 10)
    : Number(targetHourProp);

  // Every slot identity below (cache key, fetch, submit) derives from this one
  // date, so a technician reviewing 3 days ago reads and writes that day.
  const slotDate = selectedDate ?? new Date();
  const slotDateKey = toLocalDateKey(slotDate);

  const { employee } = useAuth();
  const { currentSite } = useCurrentSite();
  // Null when the technician skipped check-in — logging stays allowed.
  const { shiftSessionId } = useShiftSession();
  const siteCode = currentSite?.site_code || DEFAULT_SITE_CODE;
  // Realtime filter for the hour currently on screen, published by the
  // fetch effect because it depends on the resolved slot timestamp.
  const [liveFilter, setLiveFilter] = useState<string | null>(null);

  // Exhaustive State Initialization
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [carriedFields, setCarriedFields] = useState<Set<string>>(new Set());
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

  const getCacheKey = (hour: number | string) =>
    `telemetry_cache_${siteCode}_${slotDateKey}_${parseHour(hour)}`;

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

        // Scoped to the SELECTED day, not "now" — reviewing an earlier date
        // must report whether that day's test ran, not today's.
        const todayStart = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), 0, 0, 0, 0);
        const todayEnd = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), 23, 59, 59, 999);

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
  }, [formData?.daily_dg_test_completed, slotDateKey, currentSite?.id]);

  // Zero-Delay Local Cache & Supabase Fetch Engine
  useEffect(() => {
    let active = true;

    // Immediately reset carried fields on slot/site switch to prevent stale tags
    setCarriedFields(new Set());

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
    // Built from LOCAL date components of the SELECTED day, so the stored UTC
    // timestamp round-trips back to the correct local clock hour.
    // e.g. UTC+2: local 00:00 → stored as 2026-07-22T22:00:00Z → displays as 00:00 ✓
    // A UTC-based approach would store local 00:00 as 2026-07-23T00:00:00Z,
    // which displays as 02:00 in UTC+2. ✗
    const targetHourISO = slotISO(slotDate, parseHour(targetHour));

    const fetchTelemetryData = async () => {
      try {
        // Step C (Supabase Query 1 - Current Hour)
        if (!currentSite?.id) {
          // Do not read the database under the fallback site identity before context resolves
          setIsLoading(false);
          return;
        }

        // The site's own description of itself, from the registry rather than
        // SITE_01_blueprint.json. Awaited rather than held in state: everything
        // below needs it in full, and a half-loaded model would seed the form
        // with no constants and no carry-forward values, which reads as a
        // technician having cleared them. Cached per site, so this is one
        // request no matter how many screens ask.
        const model = await fetchSiteModel(currentSite.id);

        // Step C (Supabase Query 1 - Current Hour scoped to current site)
        const { data: currentData, error: currentError } = await supabase
          .from('telemetry_logs')
          .select('*')
          .eq('target_hour', targetHourISO)
          .eq('asset_id', 'facility_wide')
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
          model.equipment.forEach((equip: any) => {
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
          // Hour already submitted — no fields are "carried", all are confirmed
          setCarriedFields(new Set());
          localStorage.setItem(cacheKey, JSON.stringify(metrics));
          setIsLoading(false);
          setActivePowerSource(metrics['fsm_mode'] === 'OUTAGE' || metrics['fsm_mode'] === 'ON_LOAD_TEST' || metrics['grid_status'] === 'OFF' ? 'GENERATOR' : 'MAINS');
          return;
        }

        // Step D (Supabase Query 2 - Carry-Forward scoped to current site)
        // Only actual facility logs may seed a new hour — a Daily Checklist
        // row (or any other asset type) at a nearer hour would poison the
        // pre-fill with the wrong data shape.
        const { data: previousData, error: prevError } = await supabase
          .from('telemetry_logs')
          .select('*')
          .lt('target_hour', targetHourISO)
          .eq('asset_id', 'facility_wide')
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
        const newCarried = new Set<string>();

        model.equipment.forEach((equip: any) => {
          equip.metrics.forEach((metric: any) => {
            if (metric.default_value !== undefined) {
              newFormState[metric.id] = metric.default_value;
            }
            // Pre-fill ALL metrics from the previous hour so the tech
            // can confirm-or-tweak rather than re-entering from scratch.
            // Fields flagged carry_forward are treated identically but
            // won't get the "unverified" visual cue (they're cumulative
            // values like meter readings that roll over by design).
            const prevVal = previousMetrics[metric.id];
            if (prevVal !== undefined && prevVal !== null && prevVal !== '') {
              newFormState[metric.id] = prevVal;
              // Only mark point-in-time readings as "carried" (needing
              // visual confirmation). Cumulative carry_forward fields and
              // constants don't need the cue.
              if (!metric.carry_forward && !metric.is_constant) {
                newCarried.add(metric.id);
              }
            }
          });
        });

        setCarriedFields(newCarried);


        // Carry forward all asset status values, persistent comments, and dynamic parameters
        Object.keys(previousMetrics).forEach((key) => {
          if (key.startsWith('status_') || key.startsWith('comment_')) {
            newFormState[key] = previousMetrics[key];
          } else if (key.startsWith('param_')) {
            const prevVal = previousMetrics[key];
            if (prevVal !== undefined && prevVal !== null && prevVal !== '') {
              newFormState[key] = prevVal;
              newCarried.add(key);
            }
          }
        });

        // Ensure background constant remarks for PACs default to "OK" if unspecified
        model.equipment.forEach((equip: any) => {
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

    setLiveFilter(realtimeFilter);

    return () => {
      active = false;
    };
  // M-1 FIX: add currentSite?.id to deps — if the site UUID changes (admin
  // switches sites), the subscription must re-register with the new filter.
  // slotDateKey: scrubbing to another day must refetch that day's slot.
  }, [targetHour, siteCode, currentSite?.id, slotDateKey]);

  // The filter is computed inside the effect above (it needs targetHourISO),
  // so it is published to state and consumed here.
  useRealtimeTable({
    table:   "telemetry_logs",
    filter:  liveFilter ?? undefined,
    enabled: !!liveFilter,
    onChange: (payload) => {
      if (payload.eventType === "DELETE") {
        // The subscription filters on target_hour and site_uuid only, but this
        // table holds several asset_ids per hour — the checklist and the DG
        // test among them. Without this check, deleting any one of those wiped
        // the round the technician was in the middle of typing.
        const goneId = (payload.old as any)?.asset_id;
        if (goneId !== undefined && goneId !== "facility_wide") return;
        setFormData({});
        setIsEditMode(false);
        // The cache has to go with it. Step A of the fetch effect restores
        // from localStorage before the network responds, so leaving the entry
        // behind resurrects the deleted reading on the next mount — and marks
        // the slot as already submitted.
        try { localStorage.removeItem(getCacheKey(targetHour)); } catch { /* private mode */ }
        return;
      }
      const metrics = (payload.new as any)?.metrics as Record<string, any> | undefined;
      // Defence in depth: multi-column filters are not supported on every
      // Supabase plan, so the site is checked again here.
      if (metrics && (metrics.site_id === siteCode || metrics.site_uuid === currentSite?.id)) {
        setFormData(metrics);
        setIsEditMode(true);
        localStorage.setItem(getCacheKey(targetHour), JSON.stringify(metrics));
        setActivePowerSource(
          metrics["fsm_mode"] === "OUTAGE" || metrics["fsm_mode"] === "ON_LOAD_TEST" || metrics["grid_status"] === "OFF"
            ? "GENERATOR" : "MAINS"
        );
      }
    }
  });

  // Ambient temperature & humidity inputs are preserved directly as raw values

  // The Input Handler
  const handleInputChange = (id: string, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [id]: value };
      const cacheKey = getCacheKey(targetHour);
      localStorage.setItem(cacheKey, JSON.stringify(updated));
      return updated;
    });
    // Once a tech touches a field, it's no longer "carried / unverified"
    setCarriedFields((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      return prev;
    });
    setSubmitError(null);
  };



  // Exhaustive Ambient Average Math & Submission
  const handleSubmit = async (
    activeGenerators: string[] = [],
    decommissionedIds: Set<string> = new Set()
  ) => {
    setIsSubmitting(true);
    setSubmitError(null);
    setIsSuccess(false);

    // Resolved before anything is validated or stripped. Every rule below —
    // range checks, the ambient average, nulling grid readings on generator,
    // dropping metrics for offline assets — walks this list, and an empty one
    // would let all of them pass silently instead of failing loudly.
    if (!currentSite?.id) {
      toast.error('No site selected — cannot submit.');
      setIsSubmitting(false);
      return;
    }
    const model = await fetchSiteModel(currentSite.id);
    if (model.equipment.length === 0) {
      toast.error('Site equipment could not be loaded — readings were not submitted.');
      setIsSubmitting(false);
      return;
    }

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

    // ── 2.4: Field input validation ──────────────────────────────────
    // Reject physically impossible values (-40°C, 9999V) and block totally
    // blank submissions from marking the hour "completed".
    const plausibleBounds = (id: string): [number, number] => {
      const cleanId = id.toLowerCase();
      // Percentages / State of Charge / Capacity are strictly 0–100%
      if (cleanId.includes('percent') || cleanId.includes('percentage') || cleanId.includes('charge') || cleanId.includes('capacity')) {
        return [0, 100];
      }
      if (cleanId.includes('temp')) return [-10, 80];
      if (cleanId.includes('humidity')) return [0, 100];
      if (cleanId.includes('freq')) return [30, 80];
      if (cleanId.includes('volt') || cleanId.includes('vdc')) return [0, 10000];
      if (cleanId.includes('current') || cleanId.includes('amp')) return [0, 99999];
      // Power / kW / Load / Meter / Energy / Fuel readings have high upper limits (up to 99,999,999)
      if (cleanId.includes('load') || cleanId.includes('kw') || cleanId.includes('power') || cleanId.includes('watt') || cleanId.includes('fuel') || cleanId.includes('meter') || cleanId.includes('hrs')) {
        return [0, 99999999];
      }
      return [-1000000, 99999999];
    };

    const offlineForValidation = new Set<string>();
    Object.keys(formData).forEach((key) => {
      if (key.startsWith('status_') && formData[key] === 'OFFLINE') {
        offlineForValidation.add(key.substring(7).toLowerCase().replace(/-/g, '_'));
      }
    });

    for (const equip of model.equipment) {
      const normalizedId = (equip.id as string).toLowerCase().replace(/-/g, '_');
      if (offlineForValidation.has(normalizedId)) continue;
      if (equip.id === 'grid_main' && isGridOff) continue;
      // Decommissioned assets aren't rendered, so their readings can't be
      // supplied — never block submission on them.
      if (decommissionedIds.has(equip.id)) continue;

      const visibleMetrics = getVisibleMetrics(equip.id, equip.metrics || []);
      for (const m of visibleMetrics) {
        if (m.type !== 'number' || m.is_constant) continue;
        const raw = formData[m.id];

        if (raw === undefined || raw === null || raw === '') {
          // Core environmental readings are mandatory every hour; other
          // categories may legitimately be skipped (e.g. standby DG).
          if (equip.category === 'ENVIRONMENT') {
            toast.error(`Missing required reading: ${m.label}`);
            setIsSubmitting(false);
            return;
          }
          continue;
        }

        const v = Number(raw);
        if (!Number.isFinite(v)) {
          toast.error(`Invalid number entered for ${m.label}.`);
          setIsSubmitting(false);
          return;
        }
        const [lo, hi] = plausibleBounds(m.id);
        if (v < lo || v > hi) {
          toast.error(`${m.label}: ${v} is outside the plausible range (${lo} – ${hi}).`);
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
    model.equipment.forEach((eq: any) => {
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

    // Purge any legacy rendered-report snapshot. Older rows stored one inside
    // metrics, and because it round-tripped through formData every subsequent
    // edit re-persisted the original pre-edit text. History renders from
    // metrics now, so this field must not survive another write.
    delete payload['_report_text'];

    if (fsmMode === 'ON_LOAD_TEST') {
      payload['outage_type'] = 'planned_test';
    } else if (fsmMode === 'OUTAGE') {
      payload['outage_type'] = 'grid_failure';
    }

    if (fsmMode === 'OUTAGE' || fsmMode === 'ON_LOAD_TEST' || activePowerSource === 'GENERATOR') {
      payload['active_dg_hq'] = true;
      
      // Force all Zesco/Grid metrics (grid_main) to null
      const gridAsset = model.equipment.find((eq: any) => eq.id === 'grid_main');
      if (gridAsset) {
        gridAsset.metrics.forEach((metric: any) => {
          payload[metric.id] = null;
        });
      }
    }

    try {
      // Same local-time construction as the fetch effect above
      const targetHourISO = slotISO(slotDate, parseHour(targetHour));

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

      // Strip metrics for offline and decommissioned assets — stale carried-forward
      // values would otherwise keep writing readings for equipment no longer on site.
      model.equipment.forEach((equip: any) => {
        const normalizedAssetId = equip.id.toLowerCase().replace(/-/g, '_');
        if (offlineAssetIds.has(normalizedAssetId) || decommissionedIds.has(equip.id)) {
          equip.metrics.forEach((m: any) => {
            delete payload[m.id];
          });
        }
      });

      // Strip dynamic parameters for offline assets
      if (allParams) {
        allParams.forEach((param) => {
          // equipment_id is nullable: a parameter can be defined against a
          // TEMPLATE rather than an instance. Those have no asset to be offline,
          // so they are skipped — and dereferencing null here would throw
          // mid-submit and lose the whole reading.
          if (!param.equipment_id) return;
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

      // A site context is mandatory — a NULL site_uuid would violate the
      // NOT NULL constraint and produce an orphaned, unreadable row.
      const siteUuid = currentSite?.id;
      if (!siteUuid) {
        throw new Error('Active site not loaded yet — cannot submit telemetry.');
      }

      // Add site isolation metadata to metrics JSONB payload
      payload['site_id'] = siteCode;
      payload['site_uuid'] = siteUuid;

      const isDgTestMode = fsmMode === 'DAILY_TEST' || payload['daily_dg_test_completed'] === true;

      // Upsert to telemetry_logs (Facility Wide)
      // Composite conflict key (target_hour, site_uuid, asset_id)
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
            site_uuid: siteUuid,
            shift_session_id: shiftSessionId
          },
          { onConflict: 'target_hour,site_uuid,asset_id' }
        );

      if (error) {
        throw error;
      }

      // Upsert dedicated DG Daily Test log when in Daily Test mode
      if (isDgTestMode) {
        const { error: dgError } = await supabase
          .from('telemetry_logs')
          .upsert(
            {
              target_hour: targetHourISO,
              frequency: 'daily',
              metrics: payload,
              is_edited: isEditMode,
              asset_id: 'dg_daily_test',
              technician_name: firstName,
              technician_id: employee?.id || null,
              site_uuid: siteUuid,
              shift_session_id: shiftSessionId
            },
            { onConflict: 'target_hour,site_uuid,asset_id' }
          );
        if (dgError) {
          console.warn('[DCIMe] Warning: Failed to write dedicated dg_daily_test record:', dgError);
        }
      }

      // Update active_power_source in public.shift_reports for the current
      // OPEN shift only. A certified shift report is a signed-off,
      // permanent record — a new technician's first entry must never
      // silently rewrite the previous shift's history.
      let targetShiftLogId: string | null = null;
      if (employee?.id) {
        const { data } = await supabase
          .from('shift_reports')
          .select('log_id')
          .eq('logged_by', employee.id)
          .eq('certified', false)
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
        const shiftQuery = supabase
          .from('shift_reports')
          .select('log_id')
          .eq('site_uuid', siteUuid)
          .eq('certified', false)
          .order('timestamp', { ascending: false })
          .limit(1);
        const { data } = await shiftQuery.maybeSingle();
        if (data) targetShiftLogId = data.log_id;
      }

      if (targetShiftLogId) {
        // Double-guard: the UPDATE itself also refuses certified rows, so
        // even a stale log_id can't touch a closed shift.
        await supabase
          .from('shift_reports')
          .update({ active_power_source: activePowerSource })
          .eq('log_id', targetShiftLogId)
          .eq('certified', false);
      }

 
      const cacheKey = getCacheKey(targetHour);
      localStorage.removeItem(cacheKey);
      
      setCarriedFields(new Set());
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

    // Carried-forward field tracking
    carriedFields,
    setCarriedFields,

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
