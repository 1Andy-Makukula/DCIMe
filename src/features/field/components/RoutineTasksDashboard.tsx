import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Save, CheckCircle2, Loader2, Zap, AlertTriangle, ArrowLeft, Plug, Edit2, Server, Battery, Network, Building2, Radio, Flame, ClipboardList, Share2, History, Copy, Trash2, X } from 'lucide-react';
import { supabase } from '@/shared/api/supabaseClient';
import { useAuth } from '@/shared/context/AuthContext';
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

/** Returns the category icon element for a category name */
function categoryIcon(name: string): React.ReactNode {
  const n = name.toLowerCase();
  const size = 14;
  if (n.includes('server')) return <Server size={size} />;
  if (n.includes('power room 1')) return <Zap size={size} />;
  if (n.includes('power room 2')) return <Battery size={size} />;
  if (n.includes('grid') || n.includes('outside')) return <Network size={size} />;
  if (n.includes('hq')) return <Building2 size={size} />;
  if (n.includes('it room')) return <Radio size={size} />;
  if (n.includes('fuel')) return <Flame size={size} />;
  return <ClipboardList size={size} />;
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
  const { employee } = useAuth();

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
  const [prevGeneratorValues, setPrevGeneratorValues] = useState<Record<string, any>>({});
  const [attemptedFetches, setAttemptedFetches] = useState<Set<string>>(new Set());

  // --- Auto-calculate generator cumulative hours and fuel balance in real-time ---
  useEffect(() => {
    let changed = false;
    const updated = { ...formData };

    // 1. Generator Cumulative Run Hours
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

    // 2. Fuel Balance
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
  }, [
    formData['dg_1_hr_meter_start'], formData['dg_1_hr_meter_stop'],
    formData['dg_2_hr_meter_start'], formData['dg_2_hr_meter_stop'],
    formData['dg_3_hr_meter_start'], formData['dg_3_hr_meter_stop'],
    formData['dg_4_hr_meter_start'], formData['dg_4_hr_meter_stop'],
    formData['dg_hq_hr_meter_start'], formData['dg_hq_hr_meter_stop'],
    formData['fuel_brought_forward'], formData['fuel_received'], formData['fuel_consumed'],
    targetHour
  ]);

  // --- WhatsApp Share & Save History ---
  const [historyOpen, setHistoryOpen] = useState(false);
  const [whatsappHistory, setWhatsappHistory] = useState<{ timestamp: string, date: string, hour: string, text: string }[]>(() => {
    try {
      const stored = localStorage.getItem('dcime_whatsapp_history');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const getCleanValue = (key: string, fallback: string = "NA") => {
    const val = formData[key];
    if (val === undefined || val === null || String(val).trim() === "") return fallback;
    return String(val).trim();
  };

  const generateReportTexts = () => {
    const technicianName = employee?.full_name || "Unknown Tech";
    const firstName = technicianName.trim().split(/\s+/)[0];
    
    // ZESCO Grid load variables depending on active source
    const powerSourceText = activePowerSource === 'GENERATOR' ? 'GENERATOR' : 'ZESCO MAINS';
    const isGen = activePowerSource === 'GENERATOR';
    
    // Grid vs Gen Voltage / Current / Load
    const voltageVal = isGen ? getCleanValue('dg_load_voltage_r') : getCleanValue('grid_voltage_r');
    const ampsVal = isGen ? getCleanValue('dg_load_amps_r') : getCleanValue('grid_amps_r');
    
    // Calculate Generator KW: KW = (Volts * Amps * 1.732 * PF) / 1000
    const pfVal = isGen ? "0.9" : getCleanValue('grid_power_factor', "0.9");
    const voltageNum = parseFloat(voltageVal);
    const ampsNum = parseFloat(ampsVal);
    const pfNum = parseFloat(pfVal);
    const calcKw = (isGen && !isNaN(voltageNum) && !isNaN(ampsNum))
      ? Math.round((voltageNum * ampsNum * 1.732 * pfNum) / 1000)
      : 0;

    const kwVal = isGen ? calcKw.toString() : getCleanValue('grid_total_site_load'); 

    // Rectifiers
    const r1_v = getCleanValue('rectifier_1_dc_voltage', '54.2');
    const r1_a = getCleanValue('rectifier_1_amps');
    const r1_cap = getCleanValue('rectifier_1_used_percentage');
    
    const r2_v = getCleanValue('rectifier_2_dc_voltage', '54.2');
    const r2_a = getCleanValue('rectifier_2_amps');
    const r2_cap = getCleanValue('rectifier_2_used_percentage');

    // UPS 1
    const ups1_l1 = getCleanValue('ups_1_output_voltage_a', '230');
    const ups1_l2 = getCleanValue('ups_1_output_voltage_b', '230');
    const ups1_l3 = getCleanValue('ups_1_output_voltage_c', '230');
    const ups1_a1 = getCleanValue('ups_1_load_amps_a');
    const ups1_a2 = getCleanValue('ups_1_load_amps_b');
    const ups1_a3 = getCleanValue('ups_1_load_amps_c');
    const ups1_batt = getCleanValue('ups_1_battery_voltage');
    const ups1_charge = getCleanValue('ups_1_battery_charge_percent', '100');
    const ups1_used = getCleanValue('ups_1_used_capacity');
    const ups1_load = getCleanValue('ups_1_output_load_kw');

    // UPS 2
    const ups2_l1 = getCleanValue('ups_2_output_voltage_a', '230');
    const ups2_l2 = getCleanValue('ups_2_output_voltage_b', '230');
    const ups2_l3 = getCleanValue('ups_2_output_voltage_c', '230');
    const ups2_a1 = getCleanValue('ups_2_load_amps_a');
    const ups2_a2 = getCleanValue('ups_2_load_amps_b');
    const ups2_a3 = getCleanValue('ups_2_load_amps_c');
    const ups2_batt = getCleanValue('ups_2_battery_voltage');
    const ups2_charge = getCleanValue('ups_2_battery_charge_percent', '100');
    const ups2_used = getCleanValue('ups_2_used_capacity');
    const ups2_load = getCleanValue('ups_2_output_load_kw');

    // Temperature Room values
    const tempMain = getCleanValue('server_ambient_temp');
    const tempPr1 = getCleanValue('pr1_ambient_temp');
    const tempPr2 = getCleanValue('pr2_ambient_temp');
    const tempIt1 = getCleanValue('it1_ambient_temp');
    const tempIt2 = getCleanValue('it2_ambient_temp');
    const humidityMain = getCleanValue('server_ambient_humidity');

    // Real system time when sharing is happening
    const shareTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // VERSION A (WhatsApp Share) - strictly formatted according to user template, with asterisks for bolding
    const whatsappPayload = `*NTC ZM 0874*
*${firstName.toUpperCase()} ON DUTY*
*TIME: ${shareTime}hrs (Log Hour: ${targetHour}hrs)*
*LOAD ON ${powerSourceText}*
Load voltage *${voltageVal}*V
Load in Amps *${ampsVal}*A

*KW:${kwVal}*KW
Power factor *${pfVal}*

*VERTIV RECTIFIER 1*
(Power room 1) *${r1_v}*v/*${r1_a}*A/*${r1_cap}*%
*VERTIV RECTIFIER 2*
(Power room 2)*${r2_v}*v/*${r2_a}*A/*${r2_cap}*%

*UPS 1 out put*
(Power room_1)
L1-*${ups1_l1}*/*${ups1_a1}*A
L2-*${ups1_l2}*/*${ups1_a2}*A
L3-*${ups1_l3}*/*${ups1_a3}*A
Battery voltage

*${ups1_batt}*VDC
Battery Charge:*${ups1_charge}*%
Used Capacity:*${ups1_used}*%
Load *${ups1_load}*KW

*UPS 2 out put*
(Power room_2)
L1-*${ups2_l1}*/*${ups2_a1}*A
L2-*${ups2_l2}*/*${ups2_a2}*A
L3-*${ups2_l3}*/*${ups2_a3}*A
Battery voltage

*${ups2_batt}*VDC
Battery Charge:*${ups2_charge}*%
Used Capacity:*${ups2_used}*%
Load *${ups2_load}*KW

*TEMPERATURE*
Main Room *${tempMain}*°C
Power Room1_*${tempPr1}*°C
Power Room2_ *${tempPr2}*°C
First  Floor Server Room
ENTERPRISE  ROOM 1 *${tempIt1}*°C
ENTERPRISE ROOM 2 *${tempIt2}*°C
Humidity *${humidityMain}*%`;

    // Extracting unit temperatures
    const em1_temp = getCleanValue('pac_server_em1_return_temp_actual');
    const em2_temp = getCleanValue('pac_server_em2_return_temp_actual');
    const em3_temp = getCleanValue('pac_server_em3_return_temp_actual');
    const em4_temp = getCleanValue('pac_server_em4_return_temp_actual');
    const em5_temp = getCleanValue('pac_server_em5_return_temp_actual');
    const em6_temp = getCleanValue('pac_server_em6_return_temp_actual');
    const em7_temp = getCleanValue('pac_server_em7_return_temp_actual');

    const vt1_temp = getCleanValue('pac_server_vt1_return_temp_actual');
    const vt2_temp = getCleanValue('pac_server_vt2_return_temp_actual');
    const vt3_temp = getCleanValue('pac_server_vt3_return_temp_actual');
    const vt4_temp = getCleanValue('pac_server_vt4_return_temp_actual');
    const vt5_temp = getCleanValue('pac_server_vt5_return_temp_actual');
    const vt6_temp = getCleanValue('pac_data_vt6_return_temp_actual');

    // Extracting Voltages and Currents for Active Power Source (ZESCO Grid vs Generator)
    const v_r = isGen ? getCleanValue('dg_load_voltage_r') : getCleanValue('grid_voltage_r');
    const v_y = isGen ? getCleanValue('dg_load_voltage_y') : getCleanValue('grid_voltage_y');
    const v_b = isGen ? getCleanValue('dg_load_voltage_b') : getCleanValue('grid_voltage_b');

    const v_rn = isGen ? "230" : getCleanValue('grid_phase_voltage_rn', '230');
    const v_yn = isGen ? "230" : getCleanValue('grid_phase_voltage_yn', '230');
    const v_bn = isGen ? "230" : getCleanValue('grid_phase_voltage_bn', '230');

    const a_r = isGen ? getCleanValue('dg_load_amps_r') : getCleanValue('grid_amps_r');
    const a_y = isGen ? getCleanValue('dg_load_amps_y') : getCleanValue('grid_amps_y');
    const a_b = isGen ? getCleanValue('dg_load_amps_b') : getCleanValue('grid_amps_b');

    // VERSION B (Internal Save) - includes unit temperatures and active source electrical metrics
    const internalPayload = `${whatsappPayload}

Unit Temperatures
Emerson 1 : ${em1_temp}
Emerson 2 : ${em2_temp}
Emerson 3 : ${em3_temp}
Emerson 4 : ${em4_temp}
Emerson 5 : ${em5_temp}
Emerson 6 : ${em6_temp}
Emerson 7 : ${em7_temp}

Vertiv 1 : ${vt1_temp}
Vertiv 2: ${vt2_temp}
Vertiv 3: ${vt3_temp}
Vertiv 4 : ${vt4_temp}
Vertiv 5 : ${vt5_temp}
Vertiv 6 : ${vt6_temp}

VOLTAGE: ${v_r} ${v_b} ${v_y}
VOLTAGE: ${v_rn} ${v_bn} ${v_yn}
CURRENT: ${a_r} ${a_b} ${a_y}`;

    return { whatsappPayload, internalPayload };
  };

  const handleShareAndSave = () => {
    const { whatsappPayload, internalPayload } = generateReportTexts();
    
    // Save locally for History
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    
    const newRecord = {
      timestamp: new Date().toISOString(),
      date: dateStr,
      hour: targetHour,
      text: internalPayload
    };

    setWhatsappHistory((prev) => {
      const updated = [newRecord, ...prev];
      localStorage.setItem('dcime_whatsapp_history', JSON.stringify(updated));
      return updated;
    });

    toast.success("Log saved locally to history!");

    // Open WhatsApp Web / App
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
            <span className="bg-amber-50 text-amber-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
              <Edit2 size={10} /> Editing
            </span>
          )}
          {activePowerSource === 'GENERATOR' && (
            <span className="bg-red-50 text-red-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-red-200 flex items-center gap-1">
              <Zap size={10} /> Outage Mode
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
              className={`px-4.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                activePowerSource === 'MAINS'
                  ? "bg-white text-green-600 shadow-sm border border-slate-200/30"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Plug size={12} /> MAINS
            </button>
            <button
              type="button"
              onClick={() => setActivePowerSource('GENERATOR')}
              className={`px-4.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                activePowerSource === 'GENERATOR'
                  ? "bg-red-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Zap size={12} /> GENERATOR
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
                      <span className="text-sm">{categoryIcon(category.categoryName)}</span>
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
                    const dbParams = (dbEquipment?.equipment_parameters || []).filter(
                      (p) => !visibleMetrics.some(
                        (m) => m.label.toLowerCase() === p.parameter_name.toLowerCase()
                      )
                    );

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
                          const dotColor: Record<string, string> = {
                            ONLINE:   "bg-green-500",
                            DEGRADED: "bg-amber-500",
                            OFFLINE:  "bg-red-500",
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
                                        <span className={`w-1.5 h-1.5 rounded-full inline-block flex-shrink-0 ${isActive ? 'bg-white' : dotColor[st]}`} />
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
                                    if (isConst) return null;
                                    const isAutoFilled = autoFilledFields.has(metric.id);

                                    return (
                                      <div key={metric.id} className="space-y-1">
                                        <div className="flex items-center justify-between text-[10px] mb-1">
                                          <label htmlFor={metric.id} className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            <span>{metric.label}</span>
                                          </label>
                                          {/* Muted read-only previous value label next to the active input for Generators */}
                                          {isDg && prevGeneratorValues[metric.id] !== undefined && (
                                            <span className="text-[9px] font-semibold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-200/50 flex items-center gap-1">
                                              Prev: <span className="font-mono font-bold text-slate-600">{prevGeneratorValues[metric.id]}</span>
                                            </span>
                                          )}
                                        </div>
                                        <div className="relative">
                                          {(() => {
                                            const isReadOnlyField = metric.id.endsWith('_cumulative_hrs') || metric.id === 'fuel_balance';
                                            return (
                                              <input
                                                id={metric.id}
                                                type={metric.type === "number" ? "number" : "text"}
                                                inputMode={metric.type === "number" ? "decimal" : "text"}
                                                disabled={isOffline || isGridLocked || isReadOnlyField}
                                                value={(isOffline || isGridLocked) ? "" : (formData[metric.id] ?? "")}
                                                onChange={(e) => handleUserInputChange(metric.id, e.target.value)}
                                                placeholder="—"
                                                className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-1 transition-all ${
                                                  isReadOnlyField
                                                    ? "bg-slate-100 border-gray-200 text-slate-500 cursor-not-allowed"
                                                    : isAutoFilled && isDg
                                                    ? "bg-emerald-50/10 border-emerald-200 text-emerald-700 focus:border-emerald-500 focus:ring-emerald-500/20"
                                                    : "bg-white border-gray-200 text-gray-800 focus:border-red-400 focus:ring-red-400"
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
                                    const isConst  = param.is_constant;
                                    if (isConst) return null;
                                    const inputKey = `param_${param.id}`;
                                    return (
                                      <div key={param.id} className="space-y-1">
                                        <label htmlFor={inputKey} className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                          <span>{param.parameter_name}</span>
                                        </label>

                                        {param.data_type === "boolean" ? (
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

      {/* --- Task 1 & 2: Floating buttons & History bottom sheet --- */}
      <style dangerouslySetInnerHTML={{ __html: `
        .dcime-float-container {
          position: fixed;
          bottom: 96px;
          right: 24px;
          z-index: 999;
          display: flex;
          flex-direction: column;
          gap: 12px;
          align-items: center;
        }
        .dcime-float-btn {
          width: 46px;
          height: 46px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #1e293b;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          outline: none;
        }
        .dcime-float-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.85);
          color: #0f172a;
        }
        .dcime-float-btn:active {
          transform: scale(0.95);
          background: rgba(255, 255, 255, 0.95);
        }
        .dcime-float-btn.share {
          background: rgba(239, 68, 68, 0.9);
          color: #ffffff;
          border: 1px solid rgba(239, 68, 68, 0.2);
        }
        .dcime-float-btn.share:hover {
          background: rgba(220, 38, 38, 1);
          color: #ffffff;
        }
        .dcime-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(6px);
          z-index: 999999;
          display: flex;
          justify-content: center;
          align-items: stretch;
        }
        .dcime-modal-sheet {
          width: 100%;
          max-width: 100vw;
          height: 100vh;
          max-height: 100vh;
          background: #ffffff;
          display: flex;
          flex-direction: column;
          box-shadow: 0 -10px 25px rgba(0, 0, 0, 0.15);
          border: none;
          z-index: 1000000;
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .dcime-modal-header {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .dcime-modal-body {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
        }
        .dcime-history-group {
          margin-bottom: 24px;
        }
        .dcime-history-header {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
          margin-bottom: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .dcime-history-card {
          background: rgba(255, 255, 255, 0.6);
          border: 1px solid rgba(0, 0, 0, 0.05);
          border-radius: 16px;
          padding: 14px;
          margin-bottom: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .dcime-history-text {
          font-family: monospace;
          font-size: 10px;
          white-space: pre-wrap;
          color: #334155;
          background: rgba(248, 250, 252, 0.5);
          padding: 10px;
          border-radius: 8px;
          max-height: 180px;
          overflow-y: auto;
          border: 1px solid rgba(0, 0, 0, 0.02);
        }
        .dcime-btn-action {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 6px 12px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .dcime-btn-action.copy {
          background: rgba(15, 23, 42, 0.05);
          color: #0f172a;
        }
        .dcime-btn-action.copy:hover {
          background: rgba(15, 23, 42, 0.1);
        }
        .dcime-btn-action.delete {
          background: rgba(239, 68, 68, 0.08);
          color: #ef4444;
        }
        .dcime-btn-action.delete:hover {
          background: rgba(239, 68, 68, 0.15);
        }
      `}} />

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

      {historyOpen && createPortal(
        <div className="dcime-modal-overlay" onClick={() => setHistoryOpen(false)}>
          <div className="dcime-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="dcime-modal-header">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Saved Telemetry History</h4>
              <button 
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="text-slate-400 hover:text-slate-600 outline-none"
              >
                <X size={18} />
              </button>
            </div>
            <div className="dcime-modal-body">
              {whatsappHistory.length === 0 ? (
                <div className="text-center py-8 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  No saved history found.
                </div>
              ) : (
                whatsappHistory.map((item, idx) => (
                  <div key={item.timestamp || idx} className="dcime-history-card">
                    <div className="dcime-history-header">
                      <span>{item.date} — {item.hour}hrs</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="dcime-btn-action copy"
                          onClick={() => {
                            navigator.clipboard.writeText(item.text);
                            toast.success("Report copied to clipboard!");
                          }}
                        >
                          <Copy size={10} className="inline mr-1" /> Copy
                        </button>
                        <button
                          type="button"
                          className="dcime-btn-action delete"
                          onClick={() => {
                            const updated = whatsappHistory.filter((_, i) => i !== idx);
                            setWhatsappHistory(updated);
                            localStorage.setItem('dcime_whatsapp_history', JSON.stringify(updated));
                            toast.success("History item deleted.");
                          }}
                        >
                          <Trash2 size={10} className="inline mr-1" /> Delete
                        </button>
                      </div>
                    </div>
                    <div className="dcime-history-text">{item.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default RoutineTasksDashboard;
