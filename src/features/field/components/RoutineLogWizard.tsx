import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { 
  ClipboardList, 
  Activity, 
  ArrowLeft, 
  ArrowRight,
  CheckCircle, 
  XCircle, 
  Save, 
  CheckCircle2, 
  AlertTriangle,
  Database,
  ChevronRight
} from "lucide-react";
import { HOURLY_TELEMETRY_SCHEMA } from "../constants/telemetrySchema";

// ==========================================
// 1. DATA STRUCTURES FOR DAILY PHYSICAL FORM
// ==========================================

interface Checkpoint {
  id: string;
  question: string;
}

interface Category {
  id: string;
  name: string;
  checkpoints: Checkpoint[];
}

interface Step {
  id: number;
  name: string;
  categories: Category[];
}

const dailySteps: Step[] = [
  {
    id: 1,
    name: "Power Entry & Distribution",
    categories: [
      {
        id: "transformer_avr",
        name: "Transformer & AVR Systems",
        checkpoints: [
          { id: "temp_acceptable", question: "Transformer/AVR temperature is within nominal limits (< 90°C)" },
          { id: "breakers_on", question: "Transformer/AVR main breakers are in the standard ON position" },
          { id: "grid_voltage", question: "Grid voltage is stable within tolerance (380V - 410V)" },
          { id: "avr_metrics", question: "AVR telemetry metrics displays are active and accurate" },
          { id: "avr_dust", question: "AVR cabinet and intake vents are free of dust and debris" },
          { id: "spd_status", question: "Surge Protection Device (SPD) status indicator is normal/green" }
        ]
      },
      {
        id: "switchboard_ats",
        name: "Switchboard & ATS",
        checkpoints: [
          { id: "relays_intact", question: "Control relays and wiring connections are intact with no wear" },
          { id: "voltage_monitoring", question: "Voltage and frequency monitoring relays are active and normal" },
          { id: "ats_ups_healthy", question: "ATS control unit UPS backup power supply is healthy" }
        ]
      },
      {
        id: "mdbs",
        name: "Main Distribution Boards (MDBs)",
        checkpoints: [
          { id: "breakers_on", question: "MDB branch breakers are ON and functional" },
          { id: "spd_functional", question: "MDB Surge Protection Devices (SPD) are functional/green" },
          { id: "terminals_busbar", question: "Power terminals and busbars show no signs of hot spots or overheating" }
        ]
      }
    ]
  },
  {
    id: 2,
    name: "Backup Power Systems",
    categories: [
      {
        id: "generators_fuel",
        name: "Generators & Fuel Systems",
        checkpoints: [
          { id: "no_active_alarms", question: "Generator control panel reports no active system alarms" },
          { id: "auto_mode_ready", question: "Generator control switch set to AUTO mode and ready for start" },
          { id: "starting_batteries", question: "Starting batteries voltage and battery charger status are normal" },
          { id: "fuel_levels", question: "Diesel fuel tank levels verified above minimum 75% capacity" },
          { id: "oil_coolant_levels", question: "Engine oil and coolant levels are verified nominal" },
          { id: "manual_test_run", question: "Weekly manual test run completed successfully (if scheduled)" }
        ]
      },
      {
        id: "ups_batteries",
        name: "UPS & Batteries",
        checkpoints: [
          { id: "status_normal", question: "UPS system operating on normal mode (inverter active, not bypass)" },
          { id: "modules_carrying_load", question: "All UPS power modules active and sharing load proportionally" },
          { id: "telemetry_metrics", question: "UPS telemetry metrics (load, charge, runtime) nominal" },
          { id: "visual_inspection", question: "UPS battery racks show no leakage, swelling, or terminal corrosion" },
          { id: "batteries_breaker_on", question: "UPS battery cabinet main breaker is closed/ON" }
        ]
      },
      {
        id: "rectifier_batteries",
        name: "Rectifier & Telecom Batteries",
        checkpoints: [
          { id: "status_normal", question: "Rectifier system operating in normal float charge mode" },
          { id: "modules_carrying_load", question: "Rectifier modules are active and sharing system load" },
          { id: "visual_inspection", question: "DC telecom battery bank visual inspection clear (no swelling)" },
          { id: "dc_busbar_cables", question: "DC busbars and power connection cables verified secure" }
        ]
      }
    ]
  },
  {
    id: 3,
    name: "Thermal Management",
    categories: [
      {
        id: "cooling_systems",
        name: "Cooling & CRAC Systems",
        checkpoints: [
          { id: "no_active_alarms", question: "CRAC control panels report no active system alarms" },
          { id: "setpoints_correct", question: "Cooling setpoints configured to standard temperature/humidity" },
          { id: "no_water_leaks", question: "No visible condensation or water leaks on floor/under raised floor" },
          { id: "compressors_working", question: "All active compressor stages operating normally without abnormal noise" },
          { id: "blower_belts_intact", question: "Blower fan drive belts are intact and have proper tension" },
          { id: "external_fans_running", question: "External condenser fans running freely and clear of dust/debris" }
        ]
      }
    ]
  },
  {
    id: 4,
    name: "Security & Safety",
    categories: [
      {
        id: "safety_security",
        name: "Fire Suppression, CCTV & Access",
        checkpoints: [
          { id: "no_fire_alarms", question: "Fire alarm control panel reports normal (no active fire alarms)" },
          { id: "cylinder_pressure", question: "FM200 gas suppression agent cylinders pressure gauges in green zone" },
          { id: "cameras_active", question: "CCTV security monitor feeds are online, clear, and active" }
        ]
      }
    ]
  }
];

interface CheckpointResponse {
  status: boolean | null; // true = OK, false = FAULT
  comment: string;
}

interface DailyInspectionsState {
  [categoryId: string]: {
    [checkpointId: string]: CheckpointResponse;
  };
}

interface DailyFormData {
  metadata: {
    siteName: string;
    date: string;
    shift: string;
    technicianId: string;
  };
  inspections: DailyInspectionsState;
}

const initialDailyFormData = (): DailyFormData => {
  const inspections: DailyInspectionsState = {};
  dailySteps.forEach((step) => {
    step.categories.forEach((cat) => {
      inspections[cat.id] = {};
      cat.checkpoints.forEach((cp) => {
        inspections[cat.id][cp.id] = { status: null, comment: "" };
      });
    });
  });

  return {
    metadata: {
      siteName: "LUSAKA-HQ-DC1",
      date: new Date().toISOString(),
      shift: "Day",
      technicianId: "NTC-ZM-0874"
    },
    inspections
  };
};

// ==========================================
// 2. DATA STRUCTURES FOR HOURLY TELEMETRY FORM
// ==========================================

interface HourlyMetadata {
  siteName: string;
  date: string;
  shift: string;
  technicianId: string;
}

const initialHourlyMetadata = (): HourlyMetadata => ({
  siteName: "LUSAKA-HQ-DC1",
  date: new Date().toISOString(),
  shift: "Day",
  technicianId: "NTC-ZM-0874"
});

// ==========================================
// 3. CORE COMPONENT
// ==========================================

export function RoutineLogWizard() {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<"menu" | "daily" | "hourly">("menu");

  // Daily Form State
  const [currentDailyStep, setCurrentDailyStep] = useState(1);
  const [dailyFormData, setDailyFormData] = useState<DailyFormData>(initialDailyFormData());
  const [isDailySubmitting, setIsDailySubmitting] = useState(false);
  const [isDailySuccess, setIsDailySuccess] = useState(false);
  const [dailyValidationError, setDailyValidationError] = useState<string | null>(null);
  const [showDailyPayload, setShowDailyPayload] = useState(false);

  // Hourly Form State (Dynamic Category Steps & Data Points)
  const hourlyCategories = Array.from(
    new Set(HOURLY_TELEMETRY_SCHEMA.map((field) => field.category))
  );
  const [currentHourlyStep, setCurrentHourlyStep] = useState(0); // 0 to N-1
  const [hourlyMetadata, setHourlyMetadata] = useState<HourlyMetadata>(initialHourlyMetadata());
  const [hourlyData, setHourlyData] = useState<Record<string, any>>({});
  const [isHourlySubmitting, setIsHourlySubmitting] = useState(false);
  const [isHourlySuccess, setIsHourlySuccess] = useState(false);
  const [hourlyValidationError, setHourlyValidationError] = useState<string | null>(null);
  const [showHourlyPayload, setShowHourlyPayload] = useState(false);

  // Refresh timestamps on mount or view changes
  useEffect(() => {
    const now = new Date().toISOString();
    setDailyFormData((prev) => ({
      ...prev,
      metadata: { ...prev.metadata, date: now }
    }));
    setHourlyMetadata((prev) => ({
      ...prev,
      date: now
    }));
  }, [currentView]);

  // ------------------------------------------
  // DAILY FORM HANDLERS
  // ------------------------------------------
  const currentDailyStepData = dailySteps.find((s) => s.id === currentDailyStep)!;

  const handleDailyStatusChange = (categoryId: string, checkpointId: string, status: boolean) => {
    setDailyValidationError(null);
    setDailyFormData((prev) => ({
      ...prev,
      inspections: {
        ...prev.inspections,
        [categoryId]: {
          ...prev.inspections[categoryId],
          [checkpointId]: {
            ...prev.inspections[categoryId][checkpointId],
            status,
            comment: status ? "" : prev.inspections[categoryId][checkpointId].comment
          }
        }
      }
    }));
  };

  const handleDailyCommentChange = (categoryId: string, checkpointId: string, comment: string) => {
    setDailyValidationError(null);
    setDailyFormData((prev) => ({
      ...prev,
      inspections: {
        ...prev.inspections,
        [categoryId]: {
          ...prev.inspections[categoryId],
          [checkpointId]: {
            ...prev.inspections[categoryId][checkpointId],
            comment
          }
        }
      }
    }));
  };

  const validateDailyStep = (): boolean => {
    for (const cat of currentDailyStepData.categories) {
      for (const cp of cat.checkpoints) {
        const response = dailyFormData.inspections[cat.id][cp.id];
        if (response.status === null) {
          setDailyValidationError(`Please complete all checkpoints under ${cat.name}.`);
          return false;
        }
        if (response.status === false && !response.comment.trim()) {
          setDailyValidationError(`A comment is required to describe the fault in "${cp.question}".`);
          return false;
        }
      }
    }
    return true;
  };

  const handleDailyNext = () => {
    if (!validateDailyStep()) return;
    setDailyValidationError(null);
    if (currentDailyStep < 4) {
      setCurrentDailyStep((prev) => prev + 1);
    }
  };

  const handleDailyBack = () => {
    setDailyValidationError(null);
    if (currentDailyStep > 1) {
      setCurrentDailyStep((prev) => prev - 1);
    }
  };

  const handleDailySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateDailyStep()) return;

    setIsDailySubmitting(true);
    setTimeout(() => {
      setIsDailySubmitting(false);
      setIsDailySuccess(true);
    }, 1500);
  };

  const getDailyFaultCount = (): number => {
    let faultCount = 0;
    Object.values(dailyFormData.inspections).forEach((category) => {
      Object.values(category).forEach((checkpoint) => {
        if (checkpoint.status === false) {
          faultCount++;
        }
      });
    });
    return faultCount;
  };

  // ------------------------------------------
  // HOURLY FORM HANDLERS
  // ------------------------------------------
  const handleHourlyFieldChange = (fieldId: string, value: string) => {
    setHourlyValidationError(null);
    setHourlyData((prev) => ({
      ...prev,
      [fieldId]: value
    }));
  };

  const validateHourlyStep = (): boolean => {
    const currentCategory = hourlyCategories[currentHourlyStep];
    const categoryFields = HOURLY_TELEMETRY_SCHEMA.filter(
      (field) => field.category === currentCategory
    );
    for (const field of categoryFields) {
      const val = hourlyData[field.id];
      if (val === undefined || val === null || String(val).trim() === "") {
        setHourlyValidationError(`Please enter a value for all fields in ${currentCategory}.`);
        return false;
      }
    }
    return true;
  };

  const handleHourlyNext = () => {
    if (!validateHourlyStep()) return;
    setHourlyValidationError(null);
    if (currentHourlyStep < hourlyCategories.length - 1) {
      setCurrentHourlyStep((prev) => prev + 1);
    }
  };

  const handleHourlyBack = () => {
    setHourlyValidationError(null);
    if (currentHourlyStep > 0) {
      setCurrentHourlyStep((prev) => prev - 1);
    }
  };

  const handleHourlySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateHourlyStep()) return;

    setIsHourlySubmitting(true);
    setTimeout(() => {
      setIsHourlySubmitting(false);
      setIsHourlySuccess(true);
    }, 1500);
  };

  const resetAllForms = () => {
    setCurrentView("menu");
    // Reset daily
    setCurrentDailyStep(1);
    setDailyFormData(initialDailyFormData());
    setIsDailySuccess(false);
    setDailyValidationError(null);
    
    // Reset hourly
    setCurrentHourlyStep(0);
    setHourlyData({});
    setIsHourlySuccess(false);
    setHourlyValidationError(null);
  };

  // ==========================================
  // VIEW RENDERING
  // ==========================================

  // A. MENU VIEW
  if (currentView === "menu") {
    return (
      <div className="max-w-md mx-auto space-y-6 pb-24">
        {/* Back to Dashboard Link */}
        <div className="px-1">
          <button
            onClick={() => navigate("/tech")}
            className="inline-flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-red-500 transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Back to Dashboard</span>
          </button>
        </div>

        <div className="px-1 text-center py-4">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Select Task</h1>
          <p className="text-xs text-gray-500 mt-1">Select the operational log form to proceed.</p>
        </div>

        <div className="space-y-4">
          {/* Card 1: Daily Physical Checklist */}
          <button
            onClick={() => setCurrentView("daily")}
            className="w-full text-left bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:border-red-200 active:scale-[0.98] transition-all flex gap-4 group"
          >
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 border border-red-100 flex items-center justify-center shrink-0">
              <ClipboardList size={26} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900 text-base">Daily Physical Checklist</span>
                <ChevronRight size={16} className="text-gray-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <p className="text-xs text-gray-500 mt-1 leading-normal">
                End-of-shift physical status checks and visual site inspections.
              </p>
            </div>
          </button>

          {/* Card 2: Hourly Telemetry Log */}
          <button
            onClick={() => setCurrentView("hourly")}
            className="w-full text-left bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:border-red-200 active:scale-[0.98] transition-all flex gap-4 group"
          >
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 border border-red-100 flex items-center justify-center shrink-0">
              <Activity size={26} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900 text-base">Hourly Telemetry Log</span>
                <ChevronRight size={16} className="text-gray-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <p className="text-xs text-gray-500 mt-1 leading-normal">
                Quantitative panel readings, load metrics, and temperatures.
              </p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // B. DAILY PHYSICAL INSPECTION VIEW
  if (currentView === "daily") {
    if (isDailySuccess) {
      const totalFaults = getDailyFaultCount();
      return (
        <div className="max-w-md mx-auto bg-white rounded-3xl border border-gray-100 shadow-sm p-6 text-center space-y-6 animate-fade-in pb-24">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto border ${
            totalFaults > 0 ? "bg-amber-50 text-amber-500 border-amber-100" : "bg-green-50 text-green-500 border-green-100"
          }`}>
            {totalFaults > 0 ? (
              <AlertTriangle size={40} className="animate-pulse" />
            ) : (
              <CheckCircle2 size={40} className="animate-bounce" />
            )}
          </div>
          
          <div className="space-y-2">
            <h1 className="text-xl font-black text-gray-900">Checklist Submitted</h1>
            <p className="text-sm text-gray-500 px-4">
              Daily Physical Checklist records have been archived successfully.
            </p>
          </div>

          <div className="bg-gray-50 rounded-2xl p-4 text-left border border-gray-100 space-y-2.5">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-gray-500">Site ID:</span>
              <span className="text-gray-800">{dailyFormData.metadata.siteName}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-gray-500">Audited Result:</span>
              <span className={totalFaults > 0 ? "text-amber-600 font-bold" : "text-green-600 font-bold"}>
                {totalFaults > 0 ? `${totalFaults} Faults Logged` : "Zero Faults Detected"}
              </span>
            </div>
          </div>

          <div className="space-y-2 text-left">
            <button
              type="button"
              onClick={() => setShowDailyPayload(!showDailyPayload)}
              className="w-full py-2.5 px-4 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:text-gray-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Database size={14} />
              <span>{showDailyPayload ? "Hide System Payload" : "View System Payload"}</span>
            </button>
            
            {showDailyPayload && (
              <pre className="p-4 rounded-2xl bg-gray-900 text-green-400 font-mono text-[9px] overflow-auto max-h-60 border border-gray-800">
                {JSON.stringify(dailyFormData, null, 2)}
              </pre>
            )}
          </div>

          <button
            onClick={resetAllForms}
            className="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl text-sm uppercase tracking-wide active:scale-[0.98] transition-all"
          >
            Back to Log Hub Menu
          </button>
        </div>
      );
    }

    return (
      <div className="max-w-md mx-auto space-y-6 pb-28">
        {/* Header & Back to Menu Link */}
        <div className="px-1 space-y-2.5">
          <button
            onClick={resetAllForms}
            className="inline-flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-red-500 transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Back to Menu</span>
          </button>

          <div className="flex items-center justify-between">
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Daily Shift Inspection</h1>
            <span className="text-[10px] font-mono font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
              {currentDailyStep}/4 Steps
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-red-500 h-full transition-all duration-300 ease-out" 
              style={{ width: `${(currentDailyStep / 4) * 100}%` }}
            />
          </div>

          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">
            Stage: <span className="text-red-500">{currentDailyStepData.name}</span>
          </p>
        </div>

        {/* Validation Message */}
        {dailyValidationError && (
          <div className="bg-red-50 border border-red-100 p-3.5 rounded-2xl text-xs text-red-600 font-bold flex items-center gap-2 animate-pulse">
            <XCircle size={14} className="shrink-0" />
            <span>{dailyValidationError}</span>
          </div>
        )}

        {/* Checkpoint Cards */}
        <div className="space-y-6">
          {currentDailyStepData.categories.map((category) => (
            <div key={category.id} className="space-y-3">
              <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">
                {category.name}
              </h2>

              <div className="space-y-4">
                {category.checkpoints.map((cp) => {
                  const response = dailyFormData.inspections[category.id][cp.id];
                  const isFault = response.status === false;
                  const isOk = response.status === true;

                  return (
                    <div 
                      key={cp.id}
                      className={`bg-white p-5 rounded-3xl border transition-all shadow-sm ${
                        isFault 
                          ? "border-red-200 ring-1 ring-red-100" 
                          : isOk 
                          ? "border-green-200 ring-1 ring-green-100" 
                          : "border-gray-100"
                      }`}
                    >
                      <p className="font-bold text-gray-900 text-sm mb-4 leading-snug">
                        {cp.question}
                      </p>

                      <div className="grid grid-cols-2 gap-3">
                        {/* OK Button */}
                        <button
                          type="button"
                          onClick={() => handleDailyStatusChange(category.id, cp.id, true)}
                          className={`py-3.5 px-4 rounded-2xl border text-center font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                            isOk
                              ? "bg-green-100 border-green-500 text-green-700 shadow-sm"
                              : "bg-white border-gray-200 text-gray-400 hover:bg-gray-50"
                          }`}
                        >
                          <CheckCircle size={16} />
                          <span>OK</span>
                        </button>

                        {/* FAULT Button */}
                        <button
                          type="button"
                          onClick={() => handleDailyStatusChange(category.id, cp.id, false)}
                          className={`py-3.5 px-4 rounded-2xl border text-center font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                            isFault
                              ? "bg-red-100 border-red-500 text-red-700 shadow-sm"
                              : "bg-white border-gray-200 text-gray-400 hover:bg-gray-50"
                          }`}
                        >
                          <XCircle size={16} />
                          <span>Fault</span>
                        </button>
                      </div>

                      {/* Comment Area */}
                      {isFault && (
                        <div className="mt-4 space-y-1.5 animate-slide-down">
                          <label className="text-[10px] font-black text-red-500 uppercase tracking-wider block">
                            Fault Details *
                          </label>
                          <textarea
                            rows={3}
                            value={response.comment}
                            onChange={(e) => handleDailyCommentChange(category.id, cp.id, e.target.value)}
                            placeholder="Required: Describe the fault or threshold breach..."
                            className="w-full p-3 rounded-xl bg-red-50/20 border border-red-300 text-xs font-semibold text-gray-800 placeholder-red-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-none transition-colors"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Navigation */}
        <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 h-16 flex items-center justify-between px-4 z-40 max-w-md mx-auto shadow-lg">
          <button
            type="button"
            onClick={handleDailyBack}
            disabled={currentDailyStep === 1}
            className={`flex items-center gap-1.5 text-xs font-black uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all ${
              currentDailyStep === 1 ? "text-gray-300 cursor-not-allowed" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>

          {currentDailyStep === 4 ? (
            <button
              type="button"
              onClick={handleDailySubmit}
              disabled={isDailySubmitting}
              className="flex items-center gap-1.5 bg-red-600 text-white font-black text-xs uppercase tracking-widest py-3 px-5 rounded-xl shadow-md shadow-red-600/10 active:scale-95 transition-all"
            >
              <span>{isDailySubmitting ? "Submitting..." : "Submit Inspection"}</span>
              <Save size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDailyNext}
              className="flex items-center gap-1.5 bg-gray-900 text-white font-black text-xs uppercase tracking-widest py-3 px-5 rounded-xl active:scale-95 transition-all"
            >
              <span>Next Step</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }
  // C. HOURLY TELEMETRY LOG VIEW
  if (currentView === "hourly") {
    if (isHourlySuccess) {
      return (
        <div className="max-w-md mx-auto bg-white rounded-3xl border border-gray-100 shadow-sm p-6 text-center space-y-6 animate-fade-in pb-24">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto text-green-500 border border-green-100">
            <CheckCircle2 size={40} className="animate-bounce" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black text-gray-900">Telemetry Logged</h1>
            <p className="text-sm text-gray-500 px-4">
              Hourly numerical logs compiled and verified successfully.
            </p>
          </div>

          {/* Log Details */}
          <div className="bg-gray-50 rounded-2xl p-4 text-left border border-gray-100 space-y-2.5">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-1.5 flex justify-between">
              <span>Metrics Summary</span>
              <span>{Object.keys(hourlyData).length} Points</span>
            </h3>
            <div className="max-h-60 overflow-y-auto pr-1 space-y-2 font-mono text-[10px] text-gray-700">
              {HOURLY_TELEMETRY_SCHEMA.map((field) => {
                const val = hourlyData[field.id];
                if (val !== undefined && val !== "") {
                  return (
                    <div key={field.id} className="flex justify-between border-b border-gray-100 pb-1">
                      <span className="text-gray-400 truncate max-w-[200px]">{field.label}:</span>
                      <span className="font-bold text-gray-900">{val} {field.unit || ""}</span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>

          {/* View Compiled JSON Toggle */}
          <div className="space-y-2 text-left">
            <button
              type="button"
              onClick={() => setShowHourlyPayload(!showHourlyPayload)}
              className="w-full py-2.5 px-4 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:text-gray-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Database size={14} />
              <span>{showHourlyPayload ? "Hide System Payload" : "View System Payload"}</span>
            </button>
            
            {showHourlyPayload && (
              <pre className="p-4 rounded-2xl bg-gray-900 text-green-400 font-mono text-[9px] overflow-auto max-h-60 border border-gray-800">
                {JSON.stringify({
                  metadata: hourlyMetadata,
                  readings: hourlyData
                }, null, 2)}
              </pre>
            )}
          </div>

          <button
            onClick={resetAllForms}
            className="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl text-sm uppercase tracking-wide active:scale-[0.98] transition-all"
          >
            Back to Log Hub Menu
          </button>
        </div>
      );
    }

    const currentCategory = hourlyCategories[currentHourlyStep];
    const categoryFields = HOURLY_TELEMETRY_SCHEMA.filter(
      (field) => field.category === currentCategory
    );

    // Group the filtered fields by subgroup
    const groupedFields: Record<string, typeof categoryFields> = {};
    categoryFields.forEach((field) => {
      const sub = field.subgroup || "General";
      if (!groupedFields[sub]) {
        groupedFields[sub] = [];
      }
      groupedFields[sub].push(field);
    });

    return (
      <div className="max-w-md mx-auto space-y-6 pb-28">
        {/* Header & Back to Menu Link */}
        <div className="px-1 space-y-2.5">
          <button
            onClick={resetAllForms}
            className="inline-flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-red-500 transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Back to Menu</span>
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight">Hourly Telemetry Log</h1>
              <p className="text-xs text-gray-500 mt-0.5">Enter current panel readings.</p>
            </div>
            <span className="text-[10px] font-mono font-bold bg-gray-200 text-gray-600 px-2.5 py-1 rounded-full shrink-0">
              Step {currentHourlyStep + 1} of {hourlyCategories.length}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-red-500 h-full transition-all duration-300 ease-out" 
              style={{ width: `${((currentHourlyStep + 1) / hourlyCategories.length) * 100}%` }}
            />
          </div>

          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">
            Category: <span className="text-red-500">{currentCategory}</span>
          </p>
        </div>

        {/* Validation Errors */}
        {hourlyValidationError && (
          <div className="bg-red-50 border border-red-100 p-3.5 rounded-2xl text-xs text-red-600 font-bold flex items-center gap-2 animate-pulse">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{hourlyValidationError}</span>
          </div>
        )}

        {/* Dynamic Subgroup Cards */}
        <div className="space-y-4">
          {Object.entries(groupedFields).map(([subgroupName, fields]) => (
            <div 
              key={subgroupName} 
              className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm space-y-3"
            >
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                {subgroupName}
              </h3>
              
              <div 
                className={`grid gap-3 ${
                  fields.length === 3 
                    ? "grid-cols-3" 
                    : "grid-cols-2 md:grid-cols-3"
                }`}
              >
                {fields.map((field) => (
                  <div key={field.id} className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider text-center block truncate">
                      {field.label} {field.unit ? `(${field.unit})` : ""}
                    </label>
                    <input
                      type={field.type}
                      step="any"
                      inputMode={field.type === "number" ? "decimal" : undefined}
                      value={hourlyData[field.id] || ""}
                      onChange={(e) => handleHourlyFieldChange(field.id, e.target.value)}
                      placeholder="e.g. 0"
                      className="w-full text-base font-bold text-center py-2 px-1 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-red-500 focus:bg-white transition-all font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Navigation */}
        <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 h-16 flex items-center justify-between px-4 z-40 max-w-md mx-auto shadow-lg">
          <button
            type="button"
            onClick={handleHourlyBack}
            disabled={currentHourlyStep === 0}
            className={`flex items-center gap-1.5 text-xs font-black uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all ${
              currentHourlyStep === 0 ? "text-gray-300 cursor-not-allowed" : "text-gray-600 hover:text-gray-900 active:scale-95"
            }`}
          >
            <ArrowLeft size={16} />
            <span>Previous</span>
          </button>

          {currentHourlyStep === hourlyCategories.length - 1 ? (
            <button
              type="button"
              onClick={handleHourlySubmit}
              disabled={isHourlySubmitting}
              className="flex items-center gap-1.5 bg-red-600 text-white font-black text-xs uppercase tracking-widest py-3 px-5 rounded-xl shadow-md shadow-red-600/10 active:scale-95 transition-all"
            >
              <span>{isHourlySubmitting ? "Submitting..." : `Submit ${HOURLY_TELEMETRY_SCHEMA.length}-Point Log`}</span>
              <Save size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleHourlyNext}
              className="flex items-center gap-1.5 bg-gray-900 text-white font-black text-xs uppercase tracking-widest py-3 px-5 rounded-xl active:scale-95 transition-all"
            >
              <span>Next Category</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default RoutineLogWizard;
