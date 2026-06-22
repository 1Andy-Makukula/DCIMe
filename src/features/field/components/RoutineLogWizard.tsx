import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  CheckCircle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Save,
  CheckCircle2,
  AlertTriangle,
  Database
} from "lucide-react";

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

const steps: Step[] = [
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
  status: boolean | null; // true = OK, false = FAULT, null = unanswered
  comment: string;
}

interface InspectionsState {
  [categoryId: string]: {
    [checkpointId: string]: CheckpointResponse;
  };
}

interface FormDataState {
  metadata: {
    siteName: string;
    date: string;
    shift: string;
    technicianId: string;
  };
  inspections: InspectionsState;
}

const initialFormData = (): FormDataState => {
  const inspections: InspectionsState = {};
  steps.forEach((step) => {
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

export function RoutineLogWizard() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormDataState>(initialFormData());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showPayload, setShowPayload] = useState(false);

  // Update date to current ISO timestamp on load
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        date: new Date().toISOString()
      }
    }));
  }, []);

  const currentStepData = steps.find((s) => s.id === currentStep)!;

  const handleStatusChange = (categoryId: string, checkpointId: string, status: boolean) => {
    setValidationError(null);
    setFormData((prev) => ({
      ...prev,
      inspections: {
        ...prev.inspections,
        [categoryId]: {
          ...prev.inspections[categoryId],
          [checkpointId]: {
            ...prev.inspections[categoryId][checkpointId],
            status,
            // Clear comment if changing back to OK
            comment: status ? "" : prev.inspections[categoryId][checkpointId].comment
          }
        }
      }
    }));
  };

  const handleCommentChange = (categoryId: string, checkpointId: string, comment: string) => {
    setValidationError(null);
    setFormData((prev) => ({
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

  const validateStep = (): boolean => {
    for (const cat of currentStepData.categories) {
      for (const cp of cat.checkpoints) {
        const response = formData.inspections[cat.id][cp.id];
        if (response.status === null) {
          setValidationError(`Please complete all checkpoints under ${cat.name}.`);
          return false;
        }
        if (response.status === false && !response.comment.trim()) {
          setValidationError(`A comment is required to describe the fault in "${cp.question}".`);
          return false;
        }
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setValidationError(null);
    if (currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setValidationError(null);
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep()) return;

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 1500);
  };

  const getFaultCount = (): number => {
    let faultCount = 0;
    Object.values(formData.inspections).forEach((category) => {
      Object.values(category).forEach((checkpoint) => {
        if (checkpoint.status === false) {
          faultCount++;
        }
      });
    });
    return faultCount;
  };

  if (isSuccess) {
    const totalFaults = getFaultCount();
    return (
      <div className="max-w-md mx-auto bg-white rounded-3xl border border-gray-100 shadow-sm p-6 text-center space-y-6 animate-fade-in pb-12">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto border ${totalFaults > 0 ? "bg-amber-50 text-amber-500 border-amber-100" : "bg-green-50 text-green-500 border-green-100"
          }`}>
          {totalFaults > 0 ? (
            <AlertTriangle size={40} className="animate-pulse" />
          ) : (
            <CheckCircle2 size={40} className="animate-bounce" />
          )}
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-black text-gray-900">Inspection Completed</h1>
          <p className="text-sm text-gray-500 px-4">
            Audit trail logged successfully. Data points structured for Excel ingestion.
          </p>
        </div>

        {/* Audit Details */}
        <div className="bg-gray-50 rounded-2xl p-4 text-left border border-gray-100 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
              Inspection Receipt
            </h3>
            <span className="text-[10px] font-mono text-gray-400">Shift Day</span>
          </div>

          <div className="space-y-2 text-xs font-semibold">
            <div className="flex justify-between">
              <span className="text-gray-500">Site ID:</span>
              <span className="text-gray-800">{formData.metadata.siteName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Technician ID:</span>
              <span className="text-gray-800">{formData.metadata.technicianId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Audited Result:</span>
              <span className={totalFaults > 0 ? "text-amber-600 font-bold" : "text-green-600 font-bold"}>
                {totalFaults > 0 ? `${totalFaults} Faults Registered` : "Zero Faults detected"}
              </span>
            </div>
          </div>
        </div>

        {/* View Compiled JSON Toggle */}
        <div className="space-y-2 text-left">
          <button
            type="button"
            onClick={() => setShowPayload(!showPayload)}
            className="w-full py-2.5 px-4 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:text-gray-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Database size={14} />
            <span>{showPayload ? "Hide System JSON Payload" : "View System JSON Payload"}</span>
          </button>

          {showPayload && (
            <pre className="p-4 rounded-2xl bg-gray-900 text-green-400 font-mono text-[10px] overflow-auto max-h-64 border border-gray-850 animate-slide-down">
              {JSON.stringify(formData, null, 2)}
            </pre>
          )}
        </div>

        <button
          onClick={() => navigate("/tech")}
          className="w-full py-4 bg-red-600 text-white font-bold rounded-2xl text-sm uppercase tracking-wide active:scale-[0.98] transition-all shadow-md shadow-red-600/10"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6 pb-28">
      {/* Header & Overall Step Progress */}
      <div className="px-1 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Daily Shift Inspection</h1>
          <span className="text-[10px] font-mono font-bold bg-gray-200 text-gray-600 px-2.5 py-1 rounded-full">
            Step {currentStep} of 4
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
          <div
            className="bg-red-500 h-full transition-all duration-300 ease-out"
            style={{ width: `${(currentStep / 4) * 100}%` }}
          />
        </div>

        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">
          Inspection Stage: <span className="text-red-500">{currentStepData.name}</span>
        </p>
      </div>

      {/* Validation Message */}
      {validationError && (
        <div className="bg-red-50 border border-red-100 p-3.5 rounded-2xl text-xs text-red-600 font-bold flex items-center gap-2 animate-pulse">
          <XCircle size={15} className="shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Checkpoints Categories Container */}
      <div className="space-y-6">
        {currentStepData.categories.map((category) => (
          <div key={category.id} className="space-y-3">
            {/* Category Title Subheader */}
            <div className="px-1">
              <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                {category.name}
              </h2>
            </div>

            {/* Category Checkpoint Cards */}
            <div className="space-y-4">
              {category.checkpoints.map((cp) => {
                const response = formData.inspections[category.id][cp.id];
                const isFault = response.status === false;
                const isOk = response.status === true;

                return (
                  <div
                    key={cp.id}
                    className={`bg-white p-5 rounded-3xl border transition-all shadow-sm ${isFault
                        ? "border-red-200 ring-1 ring-red-100"
                        : isOk
                          ? "border-green-200 ring-1 ring-green-100"
                          : "border-gray-100"
                      }`}
                  >
                    <p className="font-bold text-gray-900 text-sm mb-4 leading-snug">
                      {cp.question}
                    </p>

                    {/* Toggle Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* OK Button */}
                      <button
                        type="button"
                        onClick={() => handleStatusChange(category.id, cp.id, true)}
                        className={`py-3.5 px-4 rounded-2xl border text-center font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${isOk
                            ? "bg-green-100 border-green-500 text-green-700 shadow-sm"
                            : "bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                          }`}
                      >
                        <CheckCircle size={16} />
                        <span>OK</span>
                      </button>

                      {/* FAULT Button */}
                      <button
                        type="button"
                        onClick={() => handleStatusChange(category.id, cp.id, false)}
                        className={`py-3.5 px-4 rounded-2xl border text-center font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${isFault
                            ? "bg-red-100 border-red-500 text-red-700 shadow-sm"
                            : "bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                          }`}
                      >
                        <XCircle size={16} />
                        <span>Fault</span>
                      </button>
                    </div>

                    {/* Conditional Comment Field */}
                    {isFault && (
                      <div className="mt-4 space-y-1.5 animate-slide-down">
                        <label className="text-[10px] font-black text-red-500 uppercase tracking-wider block">
                          Fault Details *
                        </label>
                        <textarea
                          rows={3}
                          value={response.comment}
                          onChange={(e) => handleCommentChange(category.id, cp.id, e.target.value)}
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

      {/* Navigation Footer */}
      <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 h-16 flex items-center justify-between px-4 z-40 max-w-md mx-auto shadow-lg">
        {/* Back Button */}
        <button
          type="button"
          onClick={handleBack}
          disabled={currentStep === 1}
          className={`flex items-center gap-1.5 text-xs font-black uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all ${currentStep === 1
              ? "text-gray-300 cursor-not-allowed"
              : "text-gray-600 hover:text-gray-900 active:scale-95"
            }`}
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        {/* Next / Submit Button */}
        {currentStep === 4 ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 bg-red-600 text-white font-black text-xs uppercase tracking-widest py-3 px-5 rounded-xl shadow-md shadow-red-600/10 active:scale-95 transition-all"
          >
            <span>{isSubmitting ? "Submitting..." : "Submit Inspection"}</span>
            <Save size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
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

export default RoutineLogWizard;
