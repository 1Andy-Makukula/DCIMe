import { useState, useEffect } from 'react';
import { Lock, Save, CheckCircle2, Loader2, Zap, AlertTriangle, ChevronUp, ChevronDown, ArrowLeft } from 'lucide-react';
import { MASTER_ASSET_DICTIONARY } from '../constants/telemetrySchema';
import { useTelemetryData } from '../hooks/useTelemetryData';

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

/** Returns the category icon character for a category name */
function categoryEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('server')) return '🖥️';
  if (n.includes('power room 1')) return '⚡';
  if (n.includes('power room 2')) return '🔋';
  if (n.includes('grid') || n.includes('outside')) return '🏗️';
  if (n.includes('hq')) return '🏢';
  if (n.includes('it room')) return '📡';
  if (n.includes('fuel')) return '⛽';
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

export const RoutineTasksDashboard = ({ 
  targetHour, 
  onComplete,
  onBack,
  onSubmitSuccess 
}: RoutineTasksDashboardProps) => {
  // ── Consume the Telemetry Hook ─────────────────────────────────────────────
  const { 
    formData, 
    isLoading, 
    isSubmitting, 
    isEditMode, 
    handleInputChange, 
    handleSubmit, 
    isGridOff,
    isSuccess,
    submitError,
    fetchError
  } = useTelemetryData(targetHour, onComplete, onSubmitSuccess);

  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [activeDgs, setActiveDgs] = useState<Set<string>>(new Set(['dg_hq']));

  // Synchronize active DGs from loaded formData or cache
  useEffect(() => {
    setActiveDgs((prevDgs) => {
      const nextDgs = new Set(prevDgs);
      ['dg_1', 'dg_2', 'dg_3', 'dg_4', 'dg_hq'].forEach((dgId) => {
        const hasValue = Object.keys(formData).some(
          (key) => key.startsWith(dgId + '_') && formData[key] !== undefined && formData[key] !== null && formData[key] !== ''
        );
        if (hasValue) {
          nextDgs.add(dgId);
        }
      });
      if (isGridOff && nextDgs.size === 0) {
        nextDgs.add('dg_hq');
      }
      
      const setsAreEqual = nextDgs.size === prevDgs.size && [...nextDgs].every((x) => prevDgs.has(x));
      return setsAreEqual ? prevDgs : nextDgs;
    });
  }, [formData, isGridOff]);

  // ── Frequency accordion math (for header display and filtering) ────────────
  const isTwoHour  = targetHour % 2 === 0;
  const isFourHour = targetHour % 4 === 0;
  const isDaily    = targetHour === 9;

  // ── Filtering Logic ────────────────────────────────────────────────────────
  const getVisibleMetrics = (assetId: string, metrics: any[]): any[] => {
    return metrics.filter((metric) => {
      // Exclude grid_status since it is now controlled by the Master Power Toggle at the top
      if (metric.id === 'grid_status') return false;

      if (assetId.includes('dg_') && isGridOff) return true;

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
          Log for {String(targetHour).padStart(2, '0')}:00
        </h1>
        <p className="text-xs text-gray-500 mt-1.5 flex flex-wrap gap-2 items-center">
          <span className="font-semibold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100">
            {activeChecksLabel(isTwoHour, isFourHour, isDaily)}
          </span>
          {isEditMode && (
            <span className="bg-amber-50 text-amber-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-200">
              ✏️ Editing
            </span>
          )}
          {isGridOff && (
            <span className="bg-red-50 text-red-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-red-200">
              ⚡ Outage Mode
            </span>
          )}
        </p>
      </div>

      {/* Blackout Protocol Master Switch & Active Fleet Selector */}
      <div className="backdrop-blur-md bg-white/75 border border-gray-200/50 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-gray-700 uppercase tracking-wider">Power Source</span>
          <div className="flex bg-slate-100 rounded-xl p-1 border border-slate-200/50">
            <button
              type="button"
              onClick={() => {
                handleInputChange('grid_status', 'ON');
              }}
              className={`px-4.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                !isGridOff
                  ? "bg-white text-green-600 shadow-sm border border-slate-200/30"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              🔌 MAINS
            </button>
            <button
              type="button"
              onClick={() => {
                handleInputChange('grid_status', 'OFF');
                // Ensure DG-HQ is pre-selected
                setActiveDgs((prev) => {
                  const next = new Set(prev);
                  next.add('dg_hq');
                  return next;
                });
              }}
              className={`px-4.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                isGridOff
                  ? "bg-red-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              ⚡ GENERATOR
            </button>
          </div>
        </div>

        {isGridOff && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
              Active Generator Fleet (Tap to toggle)
            </label>
            <div className="flex flex-wrap gap-2">
              {['dg_1', 'dg_2', 'dg_3', 'dg_4', 'dg_hq'].map((dgId) => {
                const label = dgId === 'dg_hq' ? 'DG-HQ' : `DG-${dgId.replace('dg_', '')}`;
                const isActive = activeDgs.has(dgId);
                return (
                  <button
                    key={dgId}
                    type="button"
                    onClick={() => {
                      setActiveDgs((prev) => {
                        const next = new Set(prev);
                        if (next.has(dgId)) {
                          next.delete(dgId);
                        } else {
                          next.add(dgId);
                        }
                        return next;
                      });
                    }}
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
        )}
      </div>

      {/* Fetch Error Banner */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 text-sm text-red-800 shadow-sm mx-1">
          <AlertTriangle size={18} className="text-red-600 shrink-0" />
          <span className="font-medium">{fetchError}</span>
        </div>
      )}

      {/* Dictionary loop wrapped in scrollable flex-1 div */}
      <div className="flex-1 overflow-y-auto p-4 pb-52">
        {MASTER_ASSET_DICTIONARY.map((category) => {
          // Determine if any asset in this category has visible metrics
          const categoryHasContent = category.assets.some((asset) => {
            const isDg = asset.id.startsWith('dg_');
            if (isDg && !activeDgs.has(asset.id)) return false;
            return getVisibleMetrics(asset.id, asset.metrics).length > 0;
          });
          if (!categoryHasContent) return null;

          const isOpen = openCategories[category.categoryName] !== false;

          return (
            <div key={category.categoryName} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden transition-all mb-4">
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
                    const isDg = asset.id.startsWith('dg_');
                    if (isDg && !activeDgs.has(asset.id)) return null;

                    const visibleMetrics = getVisibleMetrics(asset.id, asset.metrics);
                    if (visibleMetrics.length === 0) return null;

                    return (
                      <div key={asset.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider border-b border-gray-50 pb-2">
                          {asset.name}
                        </h3>

                        <div className="grid grid-cols-2 gap-3">
                          {visibleMetrics.map((metric) => {
                            const isConst = metric.isConstant === true;

                            return (
                              <div key={metric.id} className="space-y-1">
                                <label htmlFor={metric.id} className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                  <span>{metric.label}</span>
                                  {isConst && (
                                    <span className="cursor-help" title="Constant value — tap to override">
                                      <Lock size={10} className="text-gray-400" />
                                    </span>
                                  )}
                                </label>
                                <div className="relative">
                                  <input
                                    id={metric.id}
                                    type={metric.type === 'number' ? 'number' : 'text'}
                                    inputMode={metric.type === 'number' ? 'decimal' : 'text'}
                                    value={formData[metric.id] ?? ''}
                                    onChange={(e) => handleInputChange(metric.id, e.target.value)}
                                    placeholder={isConst ? String(metric.defaultValue ?? '') : '—'}
                                    className={`w-full px-3 py-2.5 rounded-xl border text-xs font-semibold text-gray-800 focus:outline-none transition-all ${
                                      isConst 
                                        ? "bg-slate-100 border-slate-200 text-slate-500 border-dashed" 
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
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 text-sm text-red-800 shadow-sm mx-1">
          <AlertTriangle size={18} className="text-red-600 shrink-0" />
          <span className="font-medium">{submitError}</span>
        </div>
      )}

      {/* Sticky submit button container with high z-index and border */}
      <div className="fixed bottom-16 left-0 w-full p-4 bg-slate-50 border-t border-slate-200 z-[999] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
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
