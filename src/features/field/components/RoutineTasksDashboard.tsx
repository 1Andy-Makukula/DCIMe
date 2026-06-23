import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { 
  ArrowLeft,
  Save, 
  CheckCircle2, 
  AlertTriangle,
  Database,
  Lock,
  Zap,
  Thermometer,
  Activity,
  MapPin,
  Loader2,
  AlertCircle
} from "lucide-react";
import { MASTER_ASSET_DICTIONARY, AssetMetric } from "../constants/telemetrySchema";
import { supabase } from "@/shared/api/supabaseClient";

interface RoutineTasksDashboardProps {
  targetHour?: number;
  onBack?: () => void;
  onSubmitSuccess?: (hour: number) => void;
}

export function RoutineTasksDashboard({
  targetHour = new Date().getHours(),
  onBack,
  onSubmitSuccess
}: RoutineTasksDashboardProps) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showPayload, setShowPayload] = useState(false);

  // The Accordion Math
  const isTwoHour = targetHour % 2 === 0;
  const isFourHour = targetHour % 4 === 0;
  const isDaily = targetHour === 9; // Trigger daily tasks at 09:00

  // Filter the dictionary based on the current accordion state
  const getVisibleMetrics = (metrics: AssetMetric[]) => {
    return metrics.filter(metric => {
      if (metric.frequency === 'hourly') return true;
      if (metric.frequency === '2-hour' && isTwoHour) return true;
      if (metric.frequency === '4-hour' && isFourHour) return true;
      if (metric.frequency === 'daily' && isDaily) return true;
      return false;
    });
  };

  // Helper to resolve Category Icons
  const getCategoryIcon = (categoryName: string) => {
    switch (categoryName) {
      case "Power Infrastructure":
        return <Zap className="text-yellow-500 w-5 h-5 animate-pulse" />;
      case "Thermal Management":
        return <Thermometer className="text-cyan-500 w-5 h-5 animate-pulse" />;
      case "Fuel System":
        return <Database className="text-amber-500 w-5 h-5" />;
      case "Environment":
        return <MapPin className="text-emerald-500 w-5 h-5" />;
      default:
        return <Activity className="text-red-500 w-5 h-5" />;
    }
  };

  // Fetch slot data and handle carry-forward / edit mode
  useEffect(() => {
    const fetchSlotData = async () => {
      setIsLoading(true);
      setValidationError(null);
      try {
        const today = new Date();
        today.setHours(targetHour, 0, 0, 0);
        const targetIso = today.toISOString();

        // Query 1: Check for Edit Mode
        const { data: currentData, error: currentError } = await supabase
          .from("telemetry_logs")
          .select("metrics")
          .eq("target_hour", targetIso)
          .eq("frequency", "hourly")
          .maybeSingle();

        if (currentError) {
          console.error("Error checking edit mode:", currentError);
        }

        if (currentData && currentData.metrics) {
          setFormData(currentData.metrics);
          setIsEditMode(true);
        } else {
          // Query 2: Carry-Forward/Defaults (Only if not in Edit Mode)
          setIsEditMode(false);
          const prevHourDate = new Date();
          prevHourDate.setHours(targetHour - 1, 0, 0, 0);
          const prevIso = prevHourDate.toISOString();

          const { data: prevData, error: prevError } = await supabase
            .from("telemetry_logs")
            .select("metrics")
            .eq("target_hour", prevIso)
            .eq("frequency", "hourly")
            .maybeSingle();

          if (prevError) {
            console.error("Error carrying forward previous logs:", prevError);
          }

          const initialData: Record<string, any> = {};

          MASTER_ASSET_DICTIONARY.forEach((category) => {
            category.assets.forEach((asset) => {
              getVisibleMetrics(asset.metrics).forEach((metric) => {
                const prevVal = prevData?.metrics?.[metric.id];
                if ((metric.carryForward || metric.isConstant) && prevVal !== undefined && prevVal !== null && prevVal !== "") {
                  initialData[metric.id] = prevVal;
                } else if (metric.defaultValue !== undefined) {
                  initialData[metric.id] = metric.defaultValue;
                } else {
                  initialData[metric.id] = "";
                }
              });
            });
          });

          setFormData(initialData);
        }
      } catch (err) {
        console.error("Error in fetchSlotData:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSlotData();
  }, [targetHour]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate("/tech");
    }
  };

  const handleFieldChange = (id: string, value: string) => {
    setValidationError(null);
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const validateForm = (): boolean => {
    const currentVisibleMetrics: AssetMetric[] = [];
    MASTER_ASSET_DICTIONARY.forEach((category) => {
      category.assets.forEach((asset) => {
        getVisibleMetrics(asset.metrics).forEach((metric) => {
          currentVisibleMetrics.push(metric);
        });
      });
    });

    const missingFields: string[] = [];
    for (const metric of currentVisibleMetrics) {
      const val = formData[metric.id];
      if (val === undefined || val === null || String(val).trim() === "") {
        missingFields.push(metric.label);
      }
    }

    if (missingFields.length > 0) {
      setValidationError(
        `Please complete all fields. Missing: ${missingFields.slice(0, 3).join(", ")}${
          missingFields.length > 3 ? ` and ${missingFields.length - 3} more` : ""
        }.`
      );
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const today = new Date();
      today.setHours(targetHour, 0, 0, 0);
      const targetIso = today.toISOString();

      const { error } = await supabase
        .from("telemetry_logs")
        .upsert({
          technician_name: "Anderson M.",
          target_hour: targetIso,
          frequency: "hourly",
          asset_id: "facility_wide",
          metrics: formData,
          is_edited: isEditMode,
          last_edited_at: isEditMode ? new Date().toISOString() : null
        });

      if (error) throw error;
      setIsSuccess(true);
    } catch (err) {
      console.error("Error submitting telemetry to Supabase:", err);
      setValidationError("Failed to submit telemetry data to database.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturnToTimeline = () => {
    if (onSubmitSuccess) {
      onSubmitSuccess(targetHour);
    } else {
      navigate("/tech");
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-12 h-12 text-red-500 animate-spin" />
        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider animate-pulse">
          Fetching Slot Data...
        </p>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="max-w-md mx-auto bg-slate-905 border border-slate-800 rounded-3xl p-6 text-center space-y-6 animate-fade-in pb-24 shadow-2xl bg-slate-900">
        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto text-green-500 border border-green-500/20">
          <CheckCircle2 size={40} className="animate-bounce" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-black text-white tracking-tight">Telemetry Logged</h1>
          <p className="text-sm text-gray-400 px-4">
            Hourly numerical logs compiled and verified successfully.
          </p>
        </div>

        <div className="bg-slate-950/60 rounded-2xl p-4 text-left border border-slate-800 space-y-2.5">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-gray-400">Site ID:</span>
            <span className="text-white">LUSAKA-HQ-DC1</span>
          </div>
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-gray-400">Total Fields:</span>
            <span className="text-green-500 font-bold">
              {Object.keys(formData).length} Points
            </span>
          </div>
        </div>

        <div className="space-y-2 text-left">
          <button
            type="button"
            onClick={() => setShowPayload(!showPayload)}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-800 text-xs font-bold text-gray-400 hover:text-white active:scale-[0.98] transition-all flex items-center justify-center gap-2 bg-slate-950/40"
          >
            <Database size={14} />
            <span>{showPayload ? "Hide System Payload" : "View System Payload"}</span>
          </button>
          
          {showPayload && (
            <pre className="p-4 rounded-2xl bg-slate-950 text-green-400 font-mono text-[9px] overflow-auto max-h-60 border border-slate-800">
              {JSON.stringify({
                metadata: {
                  siteName: "LUSAKA-HQ-DC1",
                  date: new Date().toISOString(),
                  technicianId: "Anderson M."
                },
                readings: formData
              }, null, 2)}
            </pre>
          )}
        </div>

        <button
          onClick={handleReturnToTimeline}
          className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl text-sm uppercase tracking-wide active:scale-[0.98] transition-all shadow-lg shadow-red-600/20"
        >
          {onSubmitSuccess ? "Complete Slot & Return" : "Back to Dashboard"}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6 pb-28 text-slate-100">
      {/* Header Bar */}
      <div className="px-1 space-y-4">
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-gray-300 hover:text-red-500 active:scale-[0.98] transition-all cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span>Back to Shift Timeline</span>
        </button>

        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
          <div className="absolute -top-16 -right-16 w-36 h-36 bg-blue-600 rounded-full blur-3xl opacity-10 pointer-events-none" />
          <h2 className="text-2xl font-black text-white tracking-tight">Log for {targetHour.toString().padStart(2, "0")}:00</h2>
          <p className="text-xs text-blue-400 mt-1 font-semibold uppercase tracking-wider">
            {isFourHour ? "Hourly + 2-Hour + 4-Hour Checks" : isTwoHour ? "Hourly + 2-Hour Checks" : "Standard Hourly Checks"}
            {isDaily && " + Daily Checks"}
          </p>
          {isEditMode && (
            <div className="inline-flex items-center gap-1 mt-3 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <AlertCircle size={10} />
              <span>EDIT MODE</span>
            </div>
          )}
        </div>
      </div>

      {/* Validation Message */}
      {validationError && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-3xl text-xs text-red-400 font-semibold flex items-center gap-2.5 animate-pulse">
          <AlertTriangle size={16} className="shrink-0 text-red-500" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Accordion Categories */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {MASTER_ASSET_DICTIONARY.map((category) => {
          // Check if category has any visible assets
          const visibleAssets = category.assets.filter(asset => getVisibleMetrics(asset.metrics).length > 0);
          if (visibleAssets.length === 0) return null;

          return (
            <div key={category.categoryName} className="space-y-3.5">
              <div className="flex items-center gap-2 px-1">
                {getCategoryIcon(category.categoryName)}
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                  {category.categoryName}
                </h3>
              </div>

              <div className="space-y-4">
                {visibleAssets.map((asset) => {
                  const visibleMetrics = getVisibleMetrics(asset.metrics);
                  return (
                    <div 
                      key={asset.id} 
                      className="bg-slate-900/60 backdrop-blur-md p-5 rounded-3xl border border-slate-800 shadow-lg space-y-4"
                    >
                      <h4 className="font-bold text-sm text-gray-200 border-b border-slate-800/60 pb-2 flex items-center justify-between">
                        <span>{asset.name}</span>
                        <span className="text-[10px] text-gray-500 font-normal">
                          {visibleMetrics.length} {visibleMetrics.length === 1 ? 'Reading' : 'Readings'}
                        </span>
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {visibleMetrics.map(metric => {
                          const hasUnit = !!metric.unit;
                          return (
                            <div key={metric.id} className="space-y-1.5">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                {metric.label}
                                {metric.isConstant && (
                                  <span className="inline-flex items-center ml-1 text-[9px] text-slate-500 lowercase font-normal gap-0.5">
                                    <Lock size={8} /> constant
                                  </span>
                                )}
                              </label>

                              <div className="relative flex rounded-2xl bg-slate-950/40 border border-slate-800 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500 transition-all overflow-hidden">
                                <input
                                  type={metric.type === 'number' ? 'number' : 'text'}
                                  step="any"
                                  inputMode={metric.type === 'number' ? 'decimal' : undefined}
                                  className={`w-full bg-transparent p-3 text-sm font-bold font-mono focus:outline-none ${
                                    metric.isConstant ? 'text-slate-400' : 'text-white'
                                  }`}
                                  value={formData[metric.id] ?? ''}
                                  onChange={(e) => handleFieldChange(metric.id, e.target.value)}
                                  placeholder={metric.isConstant && metric.defaultValue !== undefined ? String(metric.defaultValue) : "Enter reading"}
                                />
                                {hasUnit && (
                                  <span className="flex items-center justify-center px-3 bg-slate-900 text-[10px] font-bold text-gray-500 border-l border-slate-800">
                                    {metric.unit}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Submit Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent pt-8 pb-4 px-4 z-40 max-w-md mx-auto">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all uppercase tracking-wider text-sm flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Saving Report...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Submit {targetHour.toString().padStart(2, "0")}:00 Report</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default RoutineTasksDashboard;
