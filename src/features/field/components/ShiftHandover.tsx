import React, { useState } from "react";
import { useNavigate } from "react-router";
import { 
  Clock, 
  MessageSquare, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowLeft
} from "lucide-react";

export function ShiftHandover() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState("");
  const [certified, setCertified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!certified) return;
    
    setIsSubmitting(true);
    
    // Simulate immutable ledger signature delay
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 1500);
  };

  if (isSuccess) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-3xl border border-gray-100 shadow-sm p-6 text-center space-y-6 animate-fade-in pb-12">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto text-green-500 border border-green-100">
          <ShieldCheck size={40} className="animate-pulse" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-xl font-black text-gray-900">Shift Handover Sealed</h1>
          <p className="text-sm text-gray-500 px-4">
            Your shift records have been signed digitally and archived into the immutable ledger.
          </p>
        </div>

        <div className="bg-gray-900 text-gray-100 rounded-2xl p-4 text-left border border-gray-800 font-mono text-xs space-y-2.5">
          <div className="flex justify-between border-b border-gray-800 pb-1.5">
            <span className="text-gray-500">Signatory:</span>
            <span className="font-bold">Anderson M.</span>
          </div>
          <div className="flex justify-between border-b border-gray-800 pb-1.5">
            <span className="text-gray-500">Timestamp:</span>
            <span className="font-bold">2026-06-22 12:49 UTC</span>
          </div>
          <div className="flex justify-between border-b border-gray-800 pb-1.5">
            <span className="text-gray-500">Routine Check:</span>
            <span className="text-green-400 font-bold">4/4 Logs Saved</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Signature ID:</span>
            <span className="text-red-400 font-bold font-mono">SHA256:d3f58a...b72a</span>
          </div>
        </div>

        <button
          onClick={() => navigate("/")}
          className="w-full py-4 bg-red-600 text-white font-bold rounded-2xl text-sm uppercase tracking-wide active:scale-[0.98] transition-all shadow-md shadow-red-600/10"
        >
          Close Session (Logout)
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6 pb-8">
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
        <h1 className="text-xl font-black text-gray-900 tracking-tight">Shift Handover</h1>
        <p className="text-xs text-gray-500 mt-0.5">Review and securely close your current shift.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Shift Summary Card */}
        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-3 text-gray-800">
            <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500 shrink-0">
              <Clock size={16} />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Shift Duration</p>
              <p className="font-black text-sm text-gray-800">06:00 - 14:00</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
            <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 text-center space-y-1">
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Routine Logs</p>
              <p className="text-base font-black text-green-600">4 / 4 Complete</p>
            </div>
            
            <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 text-center space-y-1">
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Incidents Filed</p>
              <p className="text-base font-black text-gray-500">0 Reported</p>
            </div>
          </div>
        </div>

        {/* Pass-down Notes */}
        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-red-500" />
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">
              Notes for Incoming Shift
            </h2>
          </div>
          
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Keep an eye on the ambient temp in Power Room 1, it was fluctuating slightly around 11:00..."
            className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-none transition-colors"
          />
        </div>

        {/* Digital Signature & Submission */}
        <div className="space-y-4">
          <label 
            onClick={() => setCertified(!certified)}
            className={`flex items-start gap-3 p-4 rounded-3xl border cursor-pointer select-none transition-all ${
              certified 
                ? "bg-green-50/50 border-green-200 text-gray-800 shadow-sm" 
                : "bg-white border-gray-200 text-gray-500"
            }`}
          >
            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
              certified 
                ? "bg-green-500 border-green-500 text-white" 
                : "border-gray-300 bg-white"
            }`}>
              {certified && <CheckCircle2 size={16} fill="none" strokeWidth={3} />}
            </div>
            <span className="text-xs font-bold leading-relaxed">
              I certify that all physical inspections were completed and telemetry is accurate.
            </span>
          </label>

          <button
            type="submit"
            disabled={!certified || isSubmitting}
            className={`w-full py-4 rounded-2xl text-white font-black text-sm tracking-widest uppercase transition-all shadow-lg flex items-center justify-center gap-2 ${
              !certified || isSubmitting
                ? "bg-gray-300 shadow-none cursor-not-allowed text-gray-400"
                : "bg-gray-900 hover:bg-gray-800 shadow-gray-900/10 active:scale-[0.98]"
            }`}
          >
            {isSubmitting ? (
              <span>Signing...</span>
            ) : (
              <>
                <ShieldCheck size={18} />
                <span>Sign & End Shift</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ShiftHandover;
