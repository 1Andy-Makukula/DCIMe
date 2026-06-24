import { useState, useEffect, useCallback } from 'react';
import { Lock, Save, CheckCircle2, Loader2, Zap, AlertTriangle, ChevronUp, ChevronDown, ArrowLeft } from 'lucide-react';
import { MASTER_ASSET_DICTIONARY, AssetMetric } from '../constants/telemetrySchema';
import { supabase } from '@/shared/api/supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RoutineTasksDashboardProps {
  targetHour: number;
  onBack: () => void;
  onSubmitSuccess: (hour: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Builds a UTC ISO timestamp anchored to a specific hour today */
function buildHourTimestamp(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** Returns the category icon character for a category name */
function categoryEmoji(name: string): string {
  if (name.includes('Server')) return '🖥️';
  if (name.includes('Power Room 1')) return '⚡';
  if (name.includes('Power Room 2')) return '🔋';
  if (name.includes('Grid') || name.includes('Outside')) return '🏗️';
  if (name.includes('HQ')) return '🏢';
  if (name.includes('IT Room')) return '📡';
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

export const RoutineTasksDashboard = ({ targetHour, onBack, onSubmitSuccess }: RoutineTasksDashboardProps) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  // ── Frequency accordion math ───────────────────────────────────────────────
  const isTwoHour  = targetHour % 2 === 0;
  const isFourHour = targetHour % 4 === 0;
  const isDaily    = targetHour === 9;

  // ── Outage override ────────────────────────────────────────────────────────
  // When the technician flips ZESCO status to OFF, all generator metrics
  // become immediately visible regardless of the hour.
  const isGridOff = formData['grid_status'] === 'OFF';

  // ── Metric visibility filter ───────────────────────────────────────────────
  const getVisibleMetrics = useCallback(
    (assetId: string, metrics: AssetMetric[]): AssetMetric[] => {
      return metrics.filter((metric) => {
        // Outage override: generators always show when grid is off
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

  // ── Supabase: fetch existing log or carry-forward from previous hour ────────
  useEffect(() => {
    const fetchSlotData = async () => {
      setIsLoading(true);
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
          .maybeSingle();

        if (existingErr) {
          throw new Error(`[Current Hour Query] ${existingErr.message}`);
        }

        if (existing?.metrics) {
          // Edit mode — populate form with saved data
          setFormData(existing.metrics as Record<string, any>);
          setIsEditMode(true);
          return;
        }

        // ── Query 2: no current-hour data — fetch previous hour for carry-forward
        const { data: previous, error: prevErr } = await supabase
          .from('telemetry_logs')
          .select('metrics')
          .eq('target_hour', prevTimestamp)
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
      } catch (err: any) {
        console.error('[DCIMe] fetchSlotData error:', err);
        setFetchError(err.message || 'Failed to load telemetry slot data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSlotData();
  }, [targetHour]);

  // ── Input change handler ───────────────────────────────────────────────────
  const handleChange = (metricId: string, value: string) => {
    setFormData((prev) => ({ ...prev, [metricId]: value }));
    setSubmitError(null);
  };

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    // Calculate ambient average — collect all *_ambient_temp metrics
    // that are currently visible, excluding HQ (4-hour only at non-4 hours)
    const tempValues: number[] = [];
    MASTER_ASSET_DICTIONARY.forEach((category) => {
      category.assets.forEach((asset) => {
        if (!asset.id.includes('ambient') || asset.id === 'hq_ambient') return;
        asset.metrics.forEach((metric) => {
          if (metric.id.endsWith('_temp')) {
            const visible = getVisibleMetrics(asset.id, asset.metrics).some(
              (m) => m.id === metric.id
            );
            const raw = formData[metric.id];
            if (visible && raw !== undefined && raw !== '' && raw !== 'NA') {
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

    const { error } = await supabase.from('telemetry_logs').upsert(
      {
        target_hour: buildHourTimestamp(targetHour),
        metrics:     payload,
        is_edited:   isEditMode,
      },
      { onConflict: 'target_hour' }
    );

    setIsSubmitting(false);

    if (error) {
      console.error('[DCIMe] submit error:', error.message);
      setSubmitError(error.message);
      return;
    }

    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onSubmitSuccess(targetHour);
    }, 900);
  };

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
      {/* Back Button */}
      <div className="px-1">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 py-3 px-4 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-600 hover:text-red-600 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
        >
          <ArrowLeft size={14} />
          <span>← Back</span>
        </button>
      </div>

      {/* Header */}
      <div className="px-1">
        <h1 className="text-xl font-black text-gray-900 tracking-tight">
          Log for {String(targetHour).padStart(2, '0')}:00
        </h1>
        <p className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2 items-center">
          <span>{activeChecksLabel(isTwoHour, isFourHour, isDaily)}</span>
          {isEditMode && (
            <span className="bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-200">
              ✏️ Editing
            </span>
          )}
          {isGridOff && (
            <span className="bg-red-100 text-red-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-red-200">
              ⚡ Outage Mode
            </span>
          )}
        </p>
      </div>

      {/* Fetch Error Banner */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 text-sm text-red-800 shadow-sm mx-1">
          <AlertTriangle size={18} className="text-red-600 shrink-0" />
          <span className="font-medium">{fetchError}</span>
        </div>
      )}

      {/* Dictionary loop */}
      <div className="space-y-4">
        {MASTER_ASSET_DICTIONARY.map((category) => {
          // Determine if any asset in this category has visible metrics
          const categoryHasContent = category.assets.some(
            (asset) => getVisibleMetrics(asset.id, asset.metrics).length > 0
          );
          if (!categoryHasContent) return null;

          const isOpen = openCategories[category.categoryName] !== false;

          return (
            <div key={category.categoryName} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Collapsible Header */}
              <button
                type="button"
                onClick={() => setOpenCategories(prev => ({ ...prev, [category.categoryName]: !isOpen }))}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors border-b border-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{ backgroundColor: isOpen ? "#FF0000" : "#F3F4F6" }}
                  >
                    <span className="text-sm">{categoryEmoji(category.categoryName)}</span>
                  </div>
                  <span className="font-black text-xs text-gray-800 uppercase tracking-wider">{category.categoryName}</span>
                </div>
                {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </button>

              {/* Asset Cards */}
              {isOpen && (
                <div className="p-4 bg-gray-50/50 space-y-4">
                  {category.assets.map((asset) => {
                    const visibleMetrics = getVisibleMetrics(asset.id, asset.metrics);
                    if (visibleMetrics.length === 0) return null;

                    return (
                      <div key={asset.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider border-b border-gray-50 pb-2">
                          {asset.name}
                        </h3>

                        <div className="grid grid-cols-2 gap-3">
                          {visibleMetrics.map((metric) => {
                            const value = formData[metric.id] ?? '';
                            const locked = metric.isConstant === true;

                            return (
                              <div key={metric.id} className="space-y-1">
                                <label htmlFor={metric.id} className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                  <span>{metric.label}</span>
                                  {locked && (
                                    <span className="cursor-help" title="Auto-filled constant value — tap to override">
                                      <Lock size={10} className="text-gray-400" />
                                    </span>
                                  )}
                                </label>
                                <div className="relative">
                                  <input
                                    id={metric.id}
                                    type={metric.type === 'number' ? 'number' : 'text'}
                                    inputMode={metric.type === 'number' ? 'decimal' : 'text'}
                                    value={value}
                                    onChange={(e) => handleChange(metric.id, e.target.value)}
                                    placeholder={locked ? String(metric.defaultValue ?? '') : '—'}
                                    className={`w-full px-3 py-2.5 rounded-xl border text-xs font-semibold text-gray-800 focus:outline-none transition-all ${
                                      locked 
                                        ? "bg-gray-100 border-gray-200 text-gray-400 border-dashed cursor-not-allowed" 
                                        : "bg-gray-50 border-gray-200 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                    }`}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Error banner */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 text-sm text-red-800 shadow-sm">
          <AlertTriangle size={18} className="text-red-600 shrink-0" />
          <span className="font-medium">{submitError}</span>
        </div>
      )}

      {/* Sticky submit button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-50 via-gray-50/95 to-transparent z-40">
        <div className="max-w-md mx-auto">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || isSuccess}
            className={`w-full py-4 rounded-2xl text-white font-black text-sm tracking-widest uppercase transition-all shadow-lg flex items-center justify-center gap-2 ${
              isSubmitting
                ? "bg-gray-400 shadow-none cursor-not-allowed text-gray-100"
                : isSuccess
                ? "bg-green-600 shadow-green-600/10 active:scale-[0.98]"
                : isGridOff
                ? "bg-amber-600 hover:bg-amber-700 shadow-amber-600/10 active:scale-[0.98]"
                : "bg-red-600 hover:bg-red-700 shadow-red-600/10 active:scale-[0.98]"
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Saving…</span>
              </>
            ) : isSuccess ? (
              <>
                <CheckCircle2 size={18} />
                <span>Saved!</span>
              </>
            ) : (
              <>
                {isGridOff ? <Zap size={18} /> : <Save size={18} />}
                <span>{isEditMode ? 'Update Log' : 'Submit Log'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoutineTasksDashboard;
