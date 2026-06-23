import React, { useState } from "react";
import { useNavigate } from "react-router";
import { 
  Camera, 
  ChevronDown, 
  CheckCircle2, 
  X, 
  AlertOctagon, 
  Image as ImageIcon,
  ArrowLeft
} from "lucide-react";

export function IncidentReport() {
  const navigate = useNavigate();
  const [asset, setAsset] = useState("UPS-1");
  const [severity, setSeverity] = useState<"low" | "medium" | "critical">("critical");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const mockAssets = [
    { value: "UPS-1", label: "UPS-1 (Uninterruptible Power Supply)" },
    { value: "Generator A", label: "Generator A (Diesel Backup)" },
    { value: "CRAC Unit 3", label: "CRAC Unit 3 (Cooling)" },
    { value: "Mains ATS", label: "Mains ATS (Automatic Transfer Switch)" }
  ];

  const handlePhotoUpload = () => {
    // Mock photo selection
    setPhoto("incident_capture_zone1.jpg");
  };

  const handleRemovePhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPhoto(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API request
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 1200);
  };

  if (isSuccess) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-3xl border border-gray-100 shadow-sm p-6 text-center space-y-6 animate-fade-in">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto text-green-500 border border-green-100">
          <CheckCircle2 size={40} className="animate-bounce" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-xl font-black text-gray-900">Incident Dispatched</h1>
          <p className="text-sm text-gray-500 px-4">
            The NOC has been alerted. Ticket #INC-2026-{Math.floor(1000 + Math.random() * 9000)} has been created.
          </p>
        </div>

        <div className="bg-gray-50 rounded-2xl p-4 text-left border border-gray-100 font-mono text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400">Asset:</span>
            <span className="font-bold text-gray-800">{asset}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Severity:</span>
            <span className={`font-bold capitalize ${
              severity === "critical" ? "text-red-600" : severity === "medium" ? "text-amber-600" : "text-blue-600"
            }`}>{severity}</span>
          </div>
          {photo && (
            <div className="flex justify-between">
              <span className="text-gray-400">Evidence:</span>
              <span className="text-green-600 font-bold">Attached</span>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate("/tech")}
          className="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl text-sm uppercase tracking-wide active:scale-[0.98] transition-all"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* Back to Dashboard Link */}
      <div className="px-1">
        <button
          type="button"
          onClick={() => navigate("/tech")}
          className="inline-flex items-center gap-2 py-3 px-4 rounded-xl bg-gray-50 border border-gray-200 text-xs font-bold text-gray-600 hover:text-red-600 active:scale-[0.98] transition-all cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span>← Back</span>
        </button>
      </div>

      {/* Header */}
      <div className="px-1">
        <h1 className="text-xl font-black text-gray-900 tracking-tight">Report Incident</h1>
        <p className="text-xs text-gray-500 mt-0.5">Instantly notify the NOC of a hardware fault.</p>
      </div>

      {/* Main Form Card */}
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex flex-col gap-6">
        {/* Field 1: Asset Selector */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-400 uppercase tracking-widest block">
            Affected Asset
          </label>
          <div className="relative">
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              className="w-full p-4 pr-10 rounded-2xl bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-800 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 appearance-none transition-colors"
            >
              {mockAssets.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <ChevronDown size={18} />
            </div>
          </div>
        </div>

        {/* Field 2: Severity Toggle */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-400 uppercase tracking-widest block">
            Incident Severity
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {/* Low Toggle */}
            <button
              type="button"
              onClick={() => setSeverity("low")}
              className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 ${
                severity === "low"
                  ? "bg-blue-50 border-blue-200 text-blue-700 font-bold shadow-sm"
                  : "bg-white border-gray-200 text-gray-400 font-semibold"
              }`}
            >
              <span className="text-xs uppercase tracking-wider">Low</span>
            </button>

            {/* Medium Toggle */}
            <button
              type="button"
              onClick={() => setSeverity("medium")}
              className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 ${
                severity === "medium"
                  ? "bg-amber-50 border-amber-200 text-amber-700 font-bold shadow-sm"
                  : "bg-white border-gray-200 text-gray-400 font-semibold"
              }`}
            >
              <span className="text-xs uppercase tracking-wider">Medium</span>
            </button>

            {/* Critical Toggle */}
            <button
              type="button"
              onClick={() => setSeverity("critical")}
              className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 ${
                severity === "critical"
                  ? "bg-red-50 border-red-200 text-red-700 font-bold shadow-sm"
                  : "bg-white border-gray-200 text-gray-400 font-semibold"
              }`}
            >
              <span className="text-xs uppercase tracking-wider">Critical</span>
            </button>
          </div>
        </div>

        {/* Field 3: Photo Evidence */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-400 uppercase tracking-widest block">
            Photo Evidence
          </label>
          <div
            onClick={handlePhotoUpload}
            className={`h-32 bg-gray-50 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-gray-500 cursor-pointer active:bg-gray-100 transition-colors p-4 relative overflow-hidden ${
              photo ? "border-green-400" : "border-gray-200"
            }`}
          >
            {photo ? (
              <div className="flex flex-col items-center justify-center space-y-1">
                <div className="w-9 h-9 rounded-xl bg-green-50 text-green-500 flex items-center justify-center border border-green-100">
                  <ImageIcon size={18} />
                </div>
                <span className="text-xs font-bold text-gray-800">{photo}</span>
                <span className="text-[10px] text-gray-400">Tap to replace</span>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-gray-200/80 hover:bg-gray-300 text-gray-600 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-1.5 text-center">
                <Camera size={24} className="text-gray-400" />
                <div>
                  <span className="text-xs font-bold text-gray-700 block">Tap to take photo</span>
                  <span className="text-[10px] text-gray-400">or upload from device</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Field 4: Incident Notes */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-400 uppercase tracking-widest block">
            Incident Notes
          </label>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Type observations (e.g. leaking coolant, strange hum, indicator red, etc.)"
            className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-none transition-colors"
          />
        </div>

        {/* Submission Action */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-4 rounded-2xl text-white font-black text-sm tracking-widest uppercase transition-all shadow-lg flex items-center justify-center gap-2 ${
            isSubmitting
              ? "bg-gray-400 shadow-none cursor-not-allowed"
              : severity === "critical"
              ? "bg-red-600 hover:bg-red-700 shadow-red-600/10 active:scale-[0.98]"
              : severity === "medium"
              ? "bg-amber-600 hover:bg-amber-700 shadow-amber-600/10 active:scale-[0.98]"
              : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/10 active:scale-[0.98]"
          }`}
        >
          {isSubmitting ? (
            <span>Sending Alert...</span>
          ) : (
            <>
              <AlertOctagon size={16} />
              <span>Submit {severity} Alert</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export default IncidentReport;
