import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { 
  Camera, 
  CheckCircle2, 
  X, 
  AlertOctagon, 
  ArrowLeft,
  FileText,
  MessageSquare,
  PlusCircle,
  History
} from "lucide-react";
import { useIncidents, Incident } from "../hooks/useIncidents";
import { TechUser } from "./TechLayout";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { supabase } from "@/shared/api/supabaseClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";


// Utility to compress image and convert to WebP base64 in-browser
const compressToWebP = (file: File, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context is not available"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL("image/webp", quality);
        resolve(base64);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export function IncidentReport() {
  const navigate = useNavigate();
  const { user } = useOutletContext<{ user: TechUser | null }>();
  const { 
    incidents, 
    reportIncident, 
    addIncidentComment,
    resolveIncident
  } = useIncidents();
  const { currentSite } = useCurrentSite();
  
  // Tab state: "report" | "contractor" | "history"
  const [activeTab, setActiveTab] = useState<"report" | "contractor" | "history">("report");

  // Refs for hidden camera/file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const actionFileInputRef = useRef<HTMLInputElement>(null);

  // Contractor & Visit logging states
  const [activeAction, setActiveAction] = useState<{ incidentId: string; type: "visit" | "resolve" } | null>(null);
  const [contractorName, setContractorName] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [actionPhoto, setActionPhoto] = useState<string | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Report Form State
  const [asset, setAsset] = useState("");
  const [equipmentList, setEquipmentList] = useState<{ value: string; label: string }[]>([]);
  const [isLoadingEquip, setIsLoadingEquip] = useState(true);

  useEffect(() => {
    let active = true;
    const loadEquipment = async () => {
      if (!currentSite?.id) return;
      try {
        const { data, error } = await supabase
          .from("equipment_registry")
          .select("equipment_id, category, location")
          .eq("site_uuid", currentSite.id)
          .eq("is_active", true)
          .order("equipment_id", { ascending: true });

        if (error) throw error;
        if (!active) return;

        if (data) {
          const list = data.map((item) => {
            const prettyCategory = item.category ? item.category.toUpperCase() : "EQUIPMENT";
            const prettyId = item.equipment_id.toUpperCase().replace(/_/g, " ");
            const locationStr = item.location ? ` - ${item.location}` : "";
            return {
              value: item.equipment_id,
              label: `${prettyId} (${prettyCategory}${locationStr})`
            };
          });
          setEquipmentList(list);
          if (list.length > 0) {
            setAsset(list[0].value);
          }
        }
      } catch (err) {
        console.error("Failed to fetch equipment for incident reporting:", err);
      } finally {
        if (active) setIsLoadingEquip(false);
      }
    };

    loadEquipment();
    return () => {
      active = false;
    };
  }, [currentSite?.id]);
  const [severity, setSeverity] = useState<"low" | "medium" | "critical">("critical");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [occurredAt, setOccurredAt] = useState(() => {
    // Pre-fill with current local time in YYYY-MM-DDTHH:MM format
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - offset).toISOString().slice(0, 16);
    return localISOTime;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [ticketNumber, setTicketNumber] = useState("");

  // History / Add Comment State
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentType, setCommentType] = useState<"addition" | "correction">("addition");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);



  const handlePhotoUpload = () => {
    // Trigger hidden camera file input
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedBase64 = await compressToWebP(file);
      setPhoto(compressedBase64);
    } catch (err) {
      console.error("Image processing failed:", err);
      alert("Failed to process and compress the captured image. Please try again.");
    }
  };

  const handleRemovePhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPhoto(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      alert("Please provide incident notes detailing the fault.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const firstName = (user?.name || "Field Tech").trim().split(/\s+/)[0];
      const result = await reportIncident({
        asset_id: asset,
        severity: severity,
        notes: notes,
        photo_url: photo,
        occurred_at: new Date(occurredAt).toISOString(),
        raised_by_name: firstName,
        raised_by_id: user?.id || "EMP-UNKNOWN",
        site_name: currentSite?.site_name || "NTC ZM 0874",
        site_uuid: currentSite?.id || null
      });

      if (result) {
        setTicketNumber(result.ticket_number);
        setIsSuccess(true);
      }
    } catch (err) {
      alert("Failed to submit the incident alert. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent, incidentId: string) => {
    e.preventDefault();
    if (!commentText.trim()) {
      alert("Please enter comment details.");
      return;
    }
    setIsSubmittingComment(true);
    try {
      const firstName = (user?.name || "Field Tech").trim().split(/\s+/)[0];
      await addIncidentComment(incidentId, {
        comment_text: commentText,
        type: commentType,
        author_name: firstName,
        author_id: user?.id || "EMP-UNKNOWN"
      });
      setCommentText("");
      setSelectedIncidentId(null);
      alert("Comment appended successfully.");
    } catch (err) {
      alert("Failed to append comment. Please try again.");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleActionPhotoUpload = () => {
    actionFileInputRef.current?.click();
  };

  const handleActionFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedBase64 = await compressToWebP(file);
      setActionPhoto(compressedBase64);
    } catch (err) {
      console.error("Image processing failed:", err);
      alert("Failed to process and compress the captured image. Please try again.");
    }
  };

  const handleRemoveActionPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionPhoto(null);
    if (actionFileInputRef.current) {
      actionFileInputRef.current.value = "";
    }
  };

  const handleSubmitContractorVisit = async (incidentId: string) => {
    if (!contractorName.trim()) {
      alert("Please specify the Contractor name.");
      return;
    }
    if (!actionNotes.trim()) {
      alert("Please provide the tasks being executed.");
      return;
    }

    setIsSubmittingAction(true);
    try {
      const firstName = (user?.name || "Field Tech").trim().split(/\s+/)[0];
      
      // 1. Update the contractor name on the incident record in Supabase
      const { error: updateError } = await supabase
        .from("incidents")
        .update({ contractor_engaged: contractorName })
        .eq("id", incidentId);
      
      if (updateError) throw updateError;

      // 2. Append a comment logging the visitor/arrival details and work details
      await addIncidentComment(incidentId, {
        comment_text: `[Contractor: ${contractorName}] Logged site visit. Tasks: ${actionNotes}`,
        type: "contractor_visit",
        photo_url: actionPhoto,
        author_name: firstName,
        author_id: user?.id || "EMP-UNKNOWN"
      });

      alert("Contractor site visit logged successfully!");
      setActiveAction(null);
      setContractorName("");
      setActionNotes("");
      setActionPhoto(null);
    } catch (err: any) {
      console.error("Error logging contractor visit:", err);
      alert("Failed to log contractor visit. Please try again.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleSubmitResolution = async (incidentId: string) => {
    if (!contractorName.trim()) {
      alert("Please specify the Contractor name.");
      return;
    }
    if (!actionNotes.trim()) {
      alert("Please provide resolution details.");
      return;
    }

    setIsSubmittingAction(true);
    try {
      const firstName = (user?.name || "Field Tech").trim().split(/\s+/)[0];

      // 1. Update incident photo_url with the final resolution photo if available
      if (actionPhoto) {
        await supabase
          .from("incidents")
          .update({ photo_url: actionPhoto })
          .eq("id", incidentId);
      }

      // 2. Call resolveIncident hook
      await resolveIncident(incidentId, {
        contractor_engaged: contractorName,
        resolution_details: actionNotes,
        impact: "NONE",
        resolved_by_name: firstName,
        resolved_by_id: user?.id || "EMP-UNKNOWN"
      });

      // 3. Append final resolution comment
      await addIncidentComment(incidentId, {
        comment_text: `[Incident Resolved by ${firstName}] Contractor: ${contractorName}. Details: ${actionNotes}`,
        type: "resolution",
        photo_url: actionPhoto,
        author_name: firstName,
        author_id: user?.id || "EMP-UNKNOWN"
      });

      alert("Incident resolved and closed successfully!");
      setActiveAction(null);
      setContractorName("");
      setActionNotes("");
      setActionPhoto(null);
    } catch (err: any) {
      console.error("Error resolving incident:", err);
      alert("Failed to resolve incident. Please try again.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const renderIncidentTimeline = (incident: Incident) => {
    const visits = (incident.comments || []).filter((c: any) => c.type === 'contractor_visit');
    const remarks = (incident.comments || []).filter((c: any) => c.type === 'addition' || c.type === 'correction' || c.type === 'resolution');

    const hasVisits = visits.length > 0;
    const hasRemarks = remarks.length > 0;

    if (!hasVisits && !hasRemarks) {
      return <p className="text-[10px] text-gray-400 italic pl-1">No comments or visit logs recorded yet.</p>;
    }

    return (
      <div className="pl-1 space-y-4">
        {/* Contractor Visits Section */}
        {hasVisits && (
          <div className="space-y-2">
            <h4 className="text-[9px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5 bg-emerald-50/50 w-fit px-2 py-0.5 rounded-md border border-emerald-100">
              <span>👷‍♂️ Contractor Visits ({visits.length})</span>
            </h4>
            <div className="relative pl-3.5 border-l border-emerald-200/60 space-y-3.5 ml-1.5">
              {visits.map((cmt: any, idx: number) => (
                <div key={idx} className="relative space-y-1">
                  <div className="absolute -left-[22px] top-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
                  <div className="flex items-center justify-between text-[8px] font-bold text-emerald-650">
                    <span className="uppercase tracking-wider">Site Visit</span>
                    <span className="font-mono">{formatDate(cmt.timestamp)}</span>
                  </div>
                  <p className="text-xs text-slate-700 font-semibold leading-relaxed">{cmt.comment_text}</p>
                  {cmt.photo_url && (
                    <div className="mt-1.5 max-w-[140px] rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                      <img src={cmt.photo_url} alt="Visit Evidence" className="w-full h-auto object-cover" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Technician Remarks & Resolution Details */}
        {hasRemarks && (
          <div className="space-y-2">
            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 bg-slate-50 w-fit px-2 py-0.5 rounded-md border border-slate-200">
              <span>📝 Shift Remarks & Fixes ({remarks.length})</span>
            </h4>
            <div className="relative pl-3.5 border-l border-slate-200/60 space-y-3.5 ml-1.5">
              {remarks.map((cmt: any, idx: number) => (
                <div key={idx} className="relative space-y-1">
                  <div className="absolute -left-[22px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-350 border-2 border-white" />
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded ${
                      cmt.type === "correction"
                        ? "bg-red-50 text-red-600 border border-red-100"
                        : cmt.type === "resolution"
                        ? "bg-green-50 text-green-700 border border-green-100"
                        : "bg-blue-50 text-blue-600 border border-blue-100"
                    }`}>
                      {cmt.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[8px] font-mono text-gray-400">{formatDate(cmt.timestamp)}</span>
                  </div>
                  <p className="text-xs text-slate-700 font-semibold leading-relaxed">{cmt.comment_text}</p>
                  {cmt.photo_url && (
                    <div className="mt-1.5 max-w-[140px] rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                      <img src={cmt.photo_url} alt="Resolution Evidence" className="w-full h-auto object-cover" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Filter incidents personally reported by this technician
  const myIncidents = incidents.filter(
    (i) => i.raised_by_id === (user?.id || "EMP-UNKNOWN")
  );

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
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
            The NOC has been alerted. Ticket #{ticketNumber} has been created and logged in the tracking system.
          </p>
        </div>

        <div className="bg-gray-50 rounded-2xl p-4 text-left border border-gray-100 font-mono text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400">Asset:</span>
            <span className="font-bold text-gray-800">{asset}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Severity:</span>
            <span className="font-bold text-red-600 capitalize">{severity}</span>
          </div>
          {photo && (
            <div className="flex justify-between">
              <span className="text-gray-400">Evidence:</span>
              <span className="text-green-600 font-bold">Attached</span>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            setIsSuccess(false);
            setNotes("");
            setPhoto(null);
            setActiveTab("history");
          }}
          className="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl text-sm uppercase tracking-wide active:scale-[0.98] transition-all"
        >
          View in My History
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6 pb-32">
      {/* Back to Dashboard Link */}
      <div className="px-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate("/tech")}
          className="inline-flex items-center gap-2 py-3 px-4 rounded-xl bg-gray-50 border border-gray-200 text-xs font-bold text-gray-600 hover:text-red-600 active:scale-[0.98] transition-all cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span>← Back</span>
        </button>
      </div>

      {/* Segmented Tab Controls */}
      <div className="bg-white border border-gray-100 rounded-2xl p-1.5 flex shadow-sm gap-1">
        <button
          onClick={() => { setActiveTab("report"); setSelectedIncidentId(null); setActiveAction(null); }}
          className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "report"
              ? "bg-red-500 text-white shadow-sm shadow-red-500/10"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <PlusCircle size={12} />
          <span>Report Alert</span>
        </button>
        <button
          onClick={() => { setActiveTab("contractor"); setSelectedIncidentId(null); setActiveAction(null); }}
          className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "contractor"
              ? "bg-red-500 text-white shadow-sm shadow-red-500/10"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <FileText size={12} />
          <span>Contractors</span>
        </button>
        <button
          onClick={() => { setActiveTab("history"); setSelectedIncidentId(null); setActiveAction(null); }}
          className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "history"
              ? "bg-red-500 text-white shadow-sm shadow-red-500/10"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <History size={12} />
          <span>History ({myIncidents.length})</span>
        </button>
      </div>

      {/* Tab 1: Report Incident Form */}
      {activeTab === "report" && (
        <>
          <div className="px-1">
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Report Incident</h1>
            <p className="text-xs text-gray-500 mt-0.5">Instantly notify the NOC of a hardware fault.</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex flex-col gap-6">
            {/* Hidden Input for Camera Capture */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Field 1: Asset Selector */}
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest block">
                Affected Asset
              </label>
              <Select value={asset} onValueChange={setAsset}>
                <SelectTrigger className="w-full h-12 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-800 focus:ring-1 focus:ring-red-500/20 focus:border-red-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border border-gray-100 rounded-2xl shadow-lg z-[10000]">
                  {isLoadingEquip ? (
                    <SelectItem value="loading" disabled className="text-xs font-semibold text-gray-400">
                      Loading equipment...
                    </SelectItem>
                  ) : equipmentList.length === 0 ? (
                    <SelectItem value="empty" disabled className="text-xs font-semibold text-gray-400">
                      No active equipment found
                    </SelectItem>
                  ) : (
                    equipmentList.map((a) => (
                      <SelectItem key={a.value} value={a.value} className="text-xs font-semibold text-gray-800 cursor-pointer">
                        {a.label}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Field 2: Severity Toggle */}
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest block">
                Incident Severity
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {["low", "medium", "critical"].map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverity(sev as any)}
                    className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 ${
                      severity === sev
                        ? sev === "critical"
                          ? "bg-red-50 border-red-200 text-red-700 font-bold shadow-sm"
                          : sev === "medium"
                          ? "bg-amber-50 border-amber-200 text-amber-700 font-bold shadow-sm"
                          : "bg-blue-50 border-blue-200 text-blue-700 font-bold shadow-sm"
                        : "bg-white border-gray-200 text-gray-400 font-semibold"
                    }`}
                  >
                    <span className="text-xs uppercase tracking-wider">{sev}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Field 2.5: Occurrence Datetime */}
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest block">
                Date & Time of Occurrence
              </label>
              <input
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-900 focus:outline-none focus:border-red-500 transition-colors"
                required
              />
            </div>

            {/* Field 3: Photo Evidence */}
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest block">
                Photo Evidence
              </label>
              <div
                onClick={handlePhotoUpload}
                className={`h-32 bg-gray-50 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-gray-500 cursor-pointer active:bg-gray-100 transition-colors p-0 relative overflow-hidden ${
                  photo ? "border-green-400" : "border-gray-200"
                }`}
              >
                {photo ? (
                  <div className="w-full h-full flex flex-col items-center justify-center relative p-0">
                    <img 
                      src={photo} 
                      alt="Captured evidence preview" 
                      className="w-full h-full object-cover rounded-2xl"
                    />
                    <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center text-white opacity-0 hover:opacity-100 transition-opacity rounded-2xl">
                      <Camera size={20} />
                      <span className="text-[10px] font-bold mt-1 uppercase tracking-wider">Tap to retake</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors z-10"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-1.5 text-center px-4">
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

            {/* Sticky/Fixed Bottom Action Container */}
            <div className="fixed bottom-16 left-0 right-0 p-4 bg-white/85 backdrop-blur-lg border-t border-gray-100 z-40 max-w-md mx-auto flex justify-center shadow-lg rounded-t-3xl">
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
            </div>
          </form>
        </>
      )}

      {/* Tab 2: Contractor & Ticketing Management */}
      {activeTab === "contractor" && (
        <div className="space-y-4">
          <div className="px-1">
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Contractors & Ticketing</h1>
            <p className="text-xs text-gray-500 mt-0.5">Log contractor visits and provide resolutions for active alerts.</p>
          </div>

          {/* Hidden input for Contractor Visit/Resolution Photo evidence */}
          <input
            type="file"
            ref={actionFileInputRef}
            accept="image/*"
            capture="environment"
            onChange={handleActionFileChange}
            className="hidden"
          />

          {incidents.filter((i) => i.status === "OPEN").length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-3xl p-8 text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-400 border border-gray-100">
                <CheckCircle2 size={30} className="text-green-500" />
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-gray-950 text-sm">All Systems Nominal</h3>
                <p className="text-xs text-gray-400 max-w-[240px] mx-auto">
                  There are no open incident alerts at this time.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {incidents
                .filter((i) => i.status === "OPEN")
                .map((incident) => {
                  const isSelectedAction = activeAction?.incidentId === incident.id;
                  const currentContractor = incident.contractor_engaged || "";
                  
                  return (
                    <div
                      key={incident.id}
                      className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-4 relative overflow-hidden"
                    >
                      {/* Left border indicator */}
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500" />

                      <div className="flex items-center justify-between pl-1">
                        <span className="text-[10px] font-mono font-black text-gray-400 tracking-wider">
                          {incident.ticket_number}
                        </span>
                        <span className="bg-red-55 border border-red-100 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded text-red-600">
                          {incident.severity}
                        </span>
                      </div>

                      <div className="pl-1">
                        <h3 className="font-black text-gray-900 text-sm tracking-tight">
                          {incident.asset_id.toUpperCase().replace(/_/g, " ")}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1 font-medium leading-relaxed">
                          <span className="font-bold text-gray-400 block text-[9px] uppercase tracking-wider mb-0.5">Fault Details</span>
                          {incident.notes}
                        </p>
                        
                        {incident.contractor_engaged && (
                          <div className="mt-2.5 inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-600">
                            <span>Contractor:</span>
                            <span className="text-slate-800 font-extrabold">{incident.contractor_engaged}</span>
                          </div>
                        )}
                      </div>

                      {/* Display comments/visits log timeline */}
                      <div className="border-t border-gray-50 pt-3.5">
                        {renderIncidentTimeline(incident)}
                      </div>

                      {/* Ticketing Action Forms */}
                      {!isSelectedAction ? (
                        <div className="grid grid-cols-2 gap-2 pl-1 pt-3.5 border-t border-gray-50">
                          <button
                            onClick={() => {
                              setActiveAction({ incidentId: incident.id, type: "visit" });
                              setContractorName(currentContractor);
                              setActionNotes("");
                              setActionPhoto(null);
                            }}
                            className="py-2.5 bg-gray-50 border border-gray-250 hover:bg-gray-100 text-slate-700 font-bold rounded-2xl text-xs uppercase tracking-wider active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <FileText size={13} />
                            <span>Log Visit</span>
                          </button>
                          <button
                            onClick={() => {
                              setActiveAction({ incidentId: incident.id, type: "resolve" });
                              setContractorName(currentContractor);
                              setActionNotes("");
                              setActionPhoto(null);
                            }}
                            className="py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl text-xs uppercase tracking-wider active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-green-600/10"
                          >
                            <CheckCircle2 size={13} />
                            <span>Resolve</span>
                          </button>
                        </div>
                      ) : (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (activeAction.type === "visit") {
                              handleSubmitContractorVisit(incident.id);
                            } else {
                              handleSubmitResolution(incident.id);
                            }
                          }}
                          className="space-y-4 bg-gray-50/60 p-4 border border-gray-200/50 rounded-2xl animate-fade-in pl-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider">
                              {activeAction.type === "visit" ? "Log Contractor Visit" : "Resolve Incident"}
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveAction(null)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <X size={14} />
                            </button>
                          </div>

                          {/* Contractor Name */}
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                              Contractor Company/Name
                            </label>
                            <input
                              type="text"
                              value={contractorName}
                              onChange={(e) => setContractorName(e.target.value)}
                              placeholder="e.g. Vertiv Services"
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:border-red-500"
                              required
                            />
                          </div>

                          {/* Work/Resolution Details */}
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                              {activeAction.type === "visit" ? "Tasks / Work Progress" : "Resolution / Solution Provided"}
                            </label>
                            <textarea
                              rows={3}
                              value={actionNotes}
                              onChange={(e) => setActionNotes(e.target.value)}
                              placeholder={activeAction.type === "visit" ? "Explain work started or completed..." : "Explain how the fault was resolved..."}
                              className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:border-red-500 resize-none"
                              required
                            />
                          </div>

                          {/* Capture/Upload progress photo */}
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                              Attachment Photo (Optional)
                            </label>
                            <div
                              onClick={handleActionPhotoUpload}
                              className={`h-24 bg-white border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-gray-500 cursor-pointer active:bg-gray-50 transition-colors relative overflow-hidden p-0 ${
                                actionPhoto ? "border-green-400" : "border-gray-200"
                              }`}
                            >
                              {actionPhoto ? (
                                <div className="w-full h-full flex flex-col items-center justify-center relative p-0">
                                  <img src={actionPhoto} alt="Evidence" className="w-full h-full object-cover rounded-xl" />
                                  <button
                                    type="button"
                                    onClick={handleRemoveActionPhoto}
                                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center space-y-1 text-center">
                                  <Camera size={18} className="text-gray-400" />
                                  <span className="text-[10px] font-bold text-gray-700">Upload Visit/Resolution Photo</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => setActiveAction(null)}
                              className="py-2 px-3.5 border border-gray-200 text-gray-600 font-bold rounded-xl text-[10px] uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer bg-white"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={isSubmittingAction}
                              className={`py-2 px-4 text-white font-black rounded-xl text-[10px] uppercase tracking-wider active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                activeAction.type === "visit" ? "bg-slate-800 hover:bg-slate-900" : "bg-green-600 hover:bg-green-700"
                              }`}
                            >
                              {isSubmittingAction ? (
                                <span>Saving...</span>
                              ) : (
                                <>
                                  <CheckCircle2 size={12} />
                                  <span>{activeAction.type === "visit" ? "Save Visit Log" : "Confirm Resolution"}</span>
                                </>
                              )}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: My Reported Incidents & Comments Timeline (Corrections / Additions) */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="px-1">
            <h1 className="text-xl font-black text-gray-900 tracking-tight">My Reported Alerts</h1>
            <p className="text-xs text-gray-500 mt-0.5">Attach corrections or add logs to your reports.</p>
          </div>

          {myIncidents.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-3xl p-8 text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-400 border border-gray-100">
                <FileText size={30} />
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-gray-950 text-sm">No Incidents Reported</h3>
                <p className="text-xs text-gray-400 max-w-[240px] mx-auto">
                  You haven't reported any hardware incidents on this shift.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {myIncidents.map((incident, idx) => {
                const isOpen = incident.status === "OPEN";
                const isSelected = selectedIncidentId === incident.id;
                
                return (
                  <React.Fragment key={incident.id}>
                    <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-4 relative overflow-hidden">
                      {/* Left border indicator */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isOpen ? "bg-red-500" : "bg-green-500"}`} />
                      
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-black text-gray-400 tracking-wider">
                          {incident.ticket_number}
                        </span>
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md border ${
                          isOpen
                            ? "bg-red-50 text-red-600 border-red-100"
                            : "bg-green-50 text-green-600 border-green-100"
                        }`}>
                          {incident.status}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-black text-gray-900 text-sm tracking-tight">
                          {incident.asset_id.toUpperCase().replace(/_/g, " ")} Alert
                        </h3>
                        <p className="text-xs text-gray-500 mt-1 font-medium leading-relaxed">
                          <span className="font-bold text-gray-400 block text-[9px] uppercase tracking-wider mb-0.5">Original Report Notes</span>
                          {incident.notes}
                        </p>
                      </div>

                      {/* Display Main Incident Photo if uploaded */}
                      {incident.photo_url && (
                        <div className="max-w-[200px] rounded-2xl overflow-hidden border border-gray-100">
                          <img src={incident.photo_url} alt="Incident Evidence" className="w-full h-auto object-cover" />
                        </div>
                      )}

                      {/* Appended comments timeline */}
                      <div className="border-t border-gray-50 pt-3.5">
                        {renderIncidentTimeline(incident)}
                      </div>

                      {/* Interactive Form Trigger (Only for open incidents) */}
                      {isOpen && (
                        <div className="border-t border-gray-50 pt-3.5">
                          {!isSelected ? (
                            <button
                              onClick={() => setSelectedIncidentId(incident.id)}
                              className="w-full py-2.5 border border-gray-200 hover:border-gray-300 hover:text-red-600 text-gray-600 font-bold rounded-2xl text-xs uppercase tracking-wider active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <MessageSquare size={13} />
                              <span>Append Correction or Add Log</span>
                            </button>
                          ) : (
                            <form 
                              onSubmit={(e) => handleAddComment(e, incident.id)}
                              className="space-y-3 bg-gray-50/70 p-4 border border-gray-200/50 rounded-2xl animate-fade-in"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-gray-800">New Log Entry</span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedIncidentId(null)}
                                  className="text-gray-400 hover:text-gray-700"
                                >
                                  <X size={14} />
                                </button>
                              </div>

                              {/* Comment Type */}
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setCommentType("addition")}
                                  className={`py-2 text-[10px] rounded-xl border font-bold transition-all text-center ${
                                    commentType === "addition"
                                      ? "bg-blue-50 border-blue-200 text-blue-700"
                                      : "bg-white border-gray-200 text-gray-400"
                                  }`}
                                >
                                  Additional Details
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCommentType("correction")}
                                  className={`py-2 text-[10px] rounded-xl border font-bold transition-all text-center ${
                                    commentType === "correction"
                                      ? "bg-red-50 border-red-200 text-red-700"
                                      : "bg-white border-gray-200 text-gray-400"
                                  }`}
                                >
                                  Correction Log
                                </button>
                              </div>

                              {/* Comment Textarea */}
                              <textarea
                                rows={3}
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                placeholder="Detail the addition or correction here..."
                                className="w-full p-3 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-red-500 resize-none"
                                required
                              />

                              {/* Actions */}
                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={() => setSelectedIncidentId(null)}
                                  className="py-2 px-4 border border-gray-200 text-gray-600 font-bold rounded-xl text-[10px] uppercase tracking-wider active:scale-98 transition-all cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  disabled={isSubmittingComment}
                                  className="py-2 px-4 bg-gray-900 hover:bg-gray-800 text-white font-black rounded-xl text-[10px] uppercase tracking-wider active:scale-98 transition-all flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  {isSubmittingComment ? "Saving..." : "Save Log"}
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                    {idx < myIncidents.length - 1 && (
                      <div className="border-b border-slate-200/80 my-6 mx-2" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default IncidentReport;
