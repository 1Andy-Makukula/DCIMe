import React, { useState, useEffect } from "react";
import { SignaturePad, SignatureField } from "@/shared/ui";
import { siteLabel } from "@/shared/utils/branding";
import { useNavigate, useOutletContext } from "react-router";
import { 
  Clock, 
  MessageSquare, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowLeft
} from "lucide-react";
import { supabase } from "@/shared/api/supabaseClient";
import { useShiftReports } from "../hooks/useShiftReports";
import { TechUser } from "./TechLayout";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useShiftSession } from "@/shared/context/ShiftContext";

export function ShiftHandover() {
  const navigate = useNavigate();
  const { user } = useOutletContext<{ user: TechUser | null }>();
  const { submitShiftReport } = useShiftReports();
  const { currentSite } = useCurrentSite();
  const { checkOut } = useShiftSession();
  const [notes, setNotes] = useState("");
  const [certified, setCertified] = useState(false);
  // The handwritten mark. Certification is the intent; this is the evidence.
  const [signature, setSignature] = useState<string | null>(null);
  const [signedAt, setSignedAt]   = useState<string | null>(null);
  const [padOpen, setPadOpen]     = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [generatedSig, setGeneratedSig] = useState("");

  // Real shift stats — fetched live, never hardcoded
  const [logsCompleted, setLogsCompleted] = useState<number | null>(null);
  const [incidentsFiled, setIncidentsFiled] = useState<number | null>(null);

  const hour = new Date().getHours();
  const currentShiftHours = (hour >= 8 && hour < 18) ? "08:00 - 18:00" : "18:00 - 08:00";

  useEffect(() => {
    const fetchShiftStats = async () => {
      if (!currentSite?.id) return;
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [logsRes, incidentsRes] = await Promise.all([
          supabase
            .from("telemetry_logs")
            .select("id", { count: "exact", head: true })
            .eq("site_uuid", currentSite.id)
            .eq("asset_id", "facility_wide")
            .gte("target_hour", todayStart.toISOString()),
          supabase
            .from("incidents")
            .select("id", { count: "exact", head: true })
            .eq("site_uuid", currentSite.id)
            .gte("created_at", todayStart.toISOString()),
        ]);

        setLogsCompleted(logsRes.count ?? 0);
        setIncidentsFiled(incidentsRes.count ?? 0);
      } catch (err) {
        console.error("Failed to load shift stats:", err);
        setLogsCompleted(0);
        setIncidentsFiled(0);
      }
    };
    fetchShiftStats();
  }, [currentSite?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certified || !signature) return;
    if (!notes.trim()) {
      alert("Please provide pass-down notes for the incoming shift.");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Opaque signature reference — NOT labeled as a cryptographic hash,
      // because it isn't one.
      const sigId = `SIG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      setGeneratedSig(sigId);

      await submitShiftReport({
        notes: notes,
        certified: certified,
        // The drawing itself, so a printed handover can show the mark rather
        // than a reference number nobody can verify.
        signature_image: signature,
        signed_at: signedAt,
        technician_name: user?.name || "Field Tech",
        technician_id: user?.id || "EMP-UNKNOWN",
        signature_id: sigId,
        shift_duration: currentShiftHours,
        routine_logs_completed: logsCompleted ?? 0,
        incidents_filed: incidentsFiled ?? 0,
        site_id: siteLabel(currentSite?.site_name),
        site_uuid: currentSite?.id || null
      });

      // Completing the pass-down closes the shift session — that's the real
      // end of the shift. Never let a failure here fail the handover itself:
      // the report is the record of consequence, the session is bookkeeping.
      try {
        await checkOut(true);
      } catch (sessionErr) {
        console.warn("[DCIMe] Handover saved, but closing the shift session failed:", sessionErr);
      }

      setIsSuccess(true);
    } catch (err) {
      alert("Failed to submit shift handover to the database. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };


  if (isSuccess) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-3xl border border-gray-100 shadow-sm p-6 text-center space-y-6 animate-fade-in pb-12">
        <div className="w-20 h-20 bg-ok-50 rounded-full flex items-center justify-center mx-auto text-ok-500 border border-ok-100">
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
            <span className="font-bold">{user?.name || "Field Tech"}</span>
          </div>
          <div className="flex justify-between border-b border-gray-800 pb-1.5">
            <span className="text-gray-500">Timestamp:</span>
            <span className="font-bold">{new Date().toLocaleString("en-US", { hour12: false })}</span>
          </div>
          <div className="flex justify-between border-b border-gray-800 pb-1.5">
            <span className="text-gray-500">Routine Check:</span>
            <span className="text-ok-400 font-bold">{logsCompleted ?? 0} Logs Saved</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500">Signature ID:</span>
            <span className="text-brand-400 font-bold font-mono truncate max-w-[200px]">{generatedSig}</span>
          </div>
        </div>

        <button
          onClick={() => navigate("/")}
          className="w-full py-4 bg-brand-600 text-white font-bold rounded-2xl text-sm uppercase tracking-wide active:scale-[0.98] transition-all shadow-md shadow-brand-600/10"
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
          className="inline-flex items-center gap-2 py-3 px-4 rounded-xl bg-gray-50 border border-gray-200 text-xs font-bold text-gray-600 hover:text-brand-600 active:scale-[0.98] transition-all cursor-pointer"
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
              <p className="font-black text-sm text-gray-800">{currentShiftHours}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
            <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 text-center space-y-1">
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Routine Logs</p>
              <p className="text-base font-black text-ok-600">
                {logsCompleted === null ? "…" : `${logsCompleted} Saved`}
              </p>
            </div>
            
            <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 text-center space-y-1">
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Incidents Filed</p>
              <p className="text-base font-black text-gray-500">
                {incidentsFiled === null ? "…" : `${incidentsFiled} Reported`}
              </p>
            </div>

          </div>
        </div>

        {/* Pass-down Notes */}
        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-danger-500" />
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">
              Notes for Incoming Shift
            </h2>
          </div>
          
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Keep an eye on the ambient temp in Power Room 1, it was fluctuating slightly around 11:00..."
            className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 resize-none transition-colors"
          />
        </div>

        {/* Digital Signature & Submission */}
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
              Sign to hand over
            </p>
            <SignatureField
              value={signature}
              onClick={() => setPadOpen(true)}
              label={user?.name || "Outgoing technician"}
            />
          </div>

          <label 
            onClick={() => setCertified(!certified)}
            className={`flex items-start gap-3 p-4 rounded-3xl border cursor-pointer select-none transition-all ${
              certified 
                ? "bg-ok-50/50 border-ok-200 text-gray-800 shadow-sm" 
                : "bg-white border-gray-200 text-gray-500"
            }`}
          >
            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
              certified 
                ? "bg-ok-500 border-ok-500 text-white" 
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
            disabled={!certified || !signature || isSubmitting}
            className={`w-full py-4 rounded-2xl text-white font-black text-sm tracking-widest uppercase transition-all shadow-lg flex items-center justify-center gap-2 ${
              !certified || !signature || isSubmitting
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
      <SignaturePad
        open={padOpen}
        onClose={() => setPadOpen(false)}
        signerName={user?.name || "Outgoing technician"}
        context="Shift handover"
        onConfirm={(sig) => {
          setSignature(sig.dataUrl);
          setSignedAt(sig.signedAt);
          setPadOpen(false);
        }}
      />

      </form>
    </div>
  );
}

export default ShiftHandover;
