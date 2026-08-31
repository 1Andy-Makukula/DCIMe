import React, { useState, useRef, useEffect } from "react";
import { ContractorFindingsEditor, useSubmitFindings, type DraftFinding } from "./ContractorFindings";
import { siteLabel } from "@/shared/utils/branding";
import { SignatureField, SignaturePad } from "@/shared/ui";
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
  History,
  Search,
  Wrench,
  HardHat,
  Building2,
  Boxes,
  ClipboardList,
  Ticket
} from "lucide-react";
import { useIncidents, Incident, ResolverType } from "../hooks/useIncidents";
import {
  useContractorVisits,
  PURPOSE_SUGGESTIONS,
  VisitTargetType
} from "../hooks/useContractorVisits";
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
    resolveIncident,
    refresh
  } = useIncidents();
  const { visits, logVisit } = useContractorVisits();
  // Findings are staged while the visit is written up, then submitted once the
  // visit row exists to reference.
  const [findings, setFindings] = useState<DraftFinding[]>([]);
  const { submit: submitFindings } = useSubmitFindings();
  const { currentSite } = useCurrentSite();

  // Tab state: "report" | "contractor" | "history"
  const [activeTab, setActiveTab] = useState<"report" | "contractor" | "history">("report");

  // Refs for hidden camera/file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const actionFileInputRef = useRef<HTMLInputElement>(null);

  // Contractor & Visit logging states
  const [activeAction, setActiveAction] = useState<{ incidentId: string; type: "visit" | "resolve" } | null>(null);
  const [contractorName, setContractorName] = useState("");
  // The contractor's own mark, taken on this device before they leave site.
  const [contractorSig, setContractorSig]     = useState<string | null>(null);
  const [contractorSigAt, setContractorSigAt] = useState<string | null>(null);
  const [sigPadOpen, setSigPadOpen]           = useState(false);
  const [actionNotes, setActionNotes] = useState("");
  const [actionPhoto, setActionPhoto] = useState<string | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [selectedFaultId, setSelectedFaultId] = useState<string>("");

  // Contractor tab splits into two explicit workflows. Inspections record that
  // a contractor was on site and never alter ticket status; resolutions are the
  // only path that closes a fault. Conflating them was what produced tickets
  // marked RESOLVED merely because someone turned up.
  const [contractorMode, setContractorMode] = useState<"inspection" | "resolve">("inspection");
  const [visitPurpose, setVisitPurpose] = useState<string>("");
  const [visitTargetType, setVisitTargetType] = useState<VisitTargetType>("SITE");
  const [visitTargetAsset, setVisitTargetAsset] = useState<string>("");

  // Who fixed the fault. Defaults to internal: most faults are handled in-house,
  // and defaulting to "contractor" is what produced the false attribution.
  const [resolverType, setResolverType] = useState<ResolverType>("INTERNAL_TECH");
  // The closer's mark on the incident. An incident close-out is a formal
  // document — it is what gets produced when a client asks why a room ran hot
  // — so, like the checklist and the handover, it cannot be filed unsigned.
  const [resolutionSig, setResolutionSig] = useState<string | null>(null);
  const [resolutionSigAt, setResolutionSigAt] = useState<string | null>(null);
  const [resolutionPadOpen, setResolutionPadOpen] = useState(false);

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
        site_name: siteLabel(currentSite?.site_name),
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

  /**
   * Records a contractor inspection in the visit logbook.
   *
   * This never writes to `incidents`. If the inspection targets a fault ticket
   * it is noted against that ticket, but the ticket stays OPEN — a contractor
   * looking at a fault is not the same as a contractor fixing it. Closing a
   * ticket happens only through the Resolve workflow.
   */
  const handleLogInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractorName.trim()) {
      alert("Please specify the Contractor name.");
      return;
    }
    if (!visitPurpose.trim()) {
      alert("Please describe the purpose of the visit.");
      return;
    }
    if (!actionNotes.trim()) {
      alert("Please describe what was inspected or carried out.");
      return;
    }
    if (visitTargetType === "ASSET" && !visitTargetAsset) {
      alert("Please select which equipment was inspected.");
      return;
    }
    if (visitTargetType === "TICKET" && !selectedFaultId) {
      alert("Please select the fault ticket that was inspected.");
      return;
    }

    setIsSubmittingAction(true);
    try {
      const firstName = (user?.name || "Field Tech").trim().split(/\s+/)[0];
      const targetRef =
        visitTargetType === "ASSET" ? visitTargetAsset
        : visitTargetType === "TICKET" ? selectedFaultId
        : null;

      const createdVisit = await logVisit({
        purpose: visitPurpose.trim(),
        target_type: visitTargetType,
        target_ref: targetRef,
        contractor: contractorName,
        notes: actionNotes,
        photo_url: actionPhoto,
        logged_by_name: firstName,
        logged_by_id: user?.id || "EMP-UNKNOWN",
        contractor_signature:   contractorSig,
        contractor_signed_at:   contractorSigAt,
        contractor_signed_name: contractorSig ? contractorName.trim() : null
      });

      // Each finding becomes a tracked item. Failures are reported per finding
      // rather than discarding the whole set.
      if (createdVisit?.id && findings.length > 0) {
        const written = await submitFindings(createdVisit.id, findings);
        if (written > 0) {
          alert(`${written} finding${written === 1 ? "" : "s"} recorded and raised as work.`);
          setFindings([]);
        }
      }

      // Mirror the entry onto the ticket timeline so a NOC operator reading the
      // fault can see it was inspected, without the status implying a fix.
      if (visitTargetType === "TICKET" && selectedFaultId) {
        try {
          await addIncidentComment(selectedFaultId, {
            comment_text: `[Contractor: ${contractorName}] Inspected — ${visitPurpose.trim()}. Notes: ${actionNotes}`,
            type: "contractor_visit",
            photo_url: actionPhoto,
            author_name: firstName,
            author_id: user?.id || "EMP-UNKNOWN"
          });
          await supabase
            .from("incidents")
            .update({ contractor_engaged: contractorName })
            .eq("id", selectedFaultId);
          refresh();
        } catch (linkErr) {
          // The visit itself is already recorded; a failed mirror must not
          // present as a failed log.
          console.warn("Visit logged, but annotating the fault ticket failed:", linkErr);
        }
      }

      alert(
        visitTargetType === "TICKET"
          ? "Inspection logged. The fault ticket remains OPEN."
          : "Contractor inspection logged to the site logbook."
      );

      setContractorName("");
      setActionNotes("");
      setActionPhoto(null);
      setSelectedFaultId("");
      setVisitTargetAsset("");
      setVisitPurpose("");
    } catch (err: any) {
      console.error("Error logging contractor visit:", err);
      alert(err?.message || "Failed to log contractor visit. Please try again.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleSubmitResolution = async (incidentId: string) => {
    const isExternal = resolverType === "EXTERNAL_CONTRACTOR";

    // A contractor name is required only when a contractor actually did the
    // work. An in-house repair must not be forced to name one.
    if (isExternal && !contractorName.trim()) {
      alert("Please specify the Contractor company/name.");
      return;
    }
    if (!actionNotes.trim()) {
      alert("Please provide resolution details.");
      return;
    }
    if (!resolutionSig) {
      alert("Sign the resolution before closing this incident.");
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
        resolved_by_type: resolverType,
        // Null for internal repairs, so the ledger doesn't imply a contractor
        // was involved when none was.
        contractor_engaged: isExternal ? contractorName : null,
        resolution_details: actionNotes,
        impact: "NONE",
        resolved_by_name: firstName,
        resolved_by_id: user?.id || "EMP-UNKNOWN",
        resolution_signature: resolutionSig,
        resolution_signed_at: resolutionSigAt ?? new Date().toISOString()
      });

      // 3. Append final resolution comment
      await addIncidentComment(incidentId, {
        comment_text: isExternal
          ? `[Resolved by contractor] ${contractorName}, logged by ${firstName}. Details: ${actionNotes}`
          : `[Resolved in-house] Site technician ${firstName}. Details: ${actionNotes}`,
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
      setResolutionSig(null);
      setResolutionSigAt(null);
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
      return <p className="text-[10px] text-neutral-400 italic pl-1">No comments or visit logs recorded yet.</p>;
    }

    return (
      <div className="pl-1 space-y-4">
        {/* Contractor Visits Section */}
        {hasVisits && (
          <div className="space-y-2">
            <h4 className="text-[9px] font-black text-ok-600 uppercase tracking-widest flex items-center gap-1.5 bg-ok-50/50 w-fit px-2 py-0.5 rounded-md border border-ok-100">
              <HardHat size={11} aria-hidden="true" />
              <span>Contractor Visits ({visits.length})</span>
            </h4>
            <div className="relative pl-3.5 border-l border-ok-200/60 space-y-3.5 ml-1.5">
              {visits.map((cmt: any, idx: number) => (
                <div key={idx} className="relative space-y-1">
                  <div className="absolute -left-[22px] top-1.5 w-2.5 h-2.5 rounded-full bg-ok-500 border-2 border-white" />
                  <div className="flex items-center justify-between text-[8px] font-bold text-ok-650">
                    <span className="uppercase tracking-wider">Site Visit</span>
                    <span className="font-mono">{formatDate(cmt.timestamp)}</span>
                  </div>
                  <p className="text-xs text-neutral-700 font-semibold leading-relaxed">{cmt.comment_text}</p>
                  {cmt.photo_url && (
                    <div className="mt-1.5 max-w-[140px] rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
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
            <h4 className="text-[9px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1.5 bg-neutral-50 w-fit px-2 py-0.5 rounded-md border border-neutral-200">
              <MessageSquare size={11} aria-hidden="true" />
              <span>Shift Remarks &amp; Fixes ({remarks.length})</span>
            </h4>
            <div className="relative pl-3.5 border-l border-neutral-200/60 space-y-3.5 ml-1.5">
              {remarks.map((cmt: any, idx: number) => (
                <div key={idx} className="relative space-y-1">
                  <div className="absolute -left-[22px] top-1.5 w-2.5 h-2.5 rounded-full bg-neutral-350 border-2 border-white" />
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded ${cmt.type === "correction"
                        ? "bg-danger-50 text-danger-600 border border-danger-100"
                        : cmt.type === "resolution"
                          ? "bg-ok-50 text-ok-700 border border-ok-100"
                          : "bg-info-50 text-info-600 border border-info-100"
                      }`}>
                      {cmt.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[8px] font-mono text-neutral-400">{formatDate(cmt.timestamp)}</span>
                  </div>
                  <p className="text-xs text-neutral-700 font-semibold leading-relaxed">{cmt.comment_text}</p>
                  {cmt.photo_url && (
                    <div className="mt-1.5 max-w-[140px] rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
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
      <div className="max-w-md mx-auto bg-white rounded-3xl border border-neutral-100 shadow-sm p-6 text-center space-y-6 animate-fade-in">
        <div className="w-20 h-20 bg-ok-50 rounded-full flex items-center justify-center mx-auto text-ok-500 border border-ok-100">
          <CheckCircle2 size={40} className="animate-bounce" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-black text-neutral-900">Incident Dispatched</h1>
          <p className="text-sm text-neutral-500 px-4">
            The NOC has been alerted. Ticket #{ticketNumber} has been created and logged in the tracking system.
          </p>
        </div>

        <div className="bg-neutral-50 rounded-2xl p-4 text-left border border-neutral-100 font-mono text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-neutral-400">Asset:</span>
            <span className="font-bold text-neutral-800">{asset}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Severity:</span>
            <span className="font-bold text-danger-600 capitalize">{severity}</span>
          </div>
          {photo && (
            <div className="flex justify-between">
              <span className="text-neutral-400">Evidence:</span>
              <span className="text-ok-600 font-bold">Attached</span>
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
          className="w-full py-4 bg-neutral-900 text-white font-bold rounded-2xl text-sm uppercase tracking-wide active:scale-[0.98] transition-all"
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
          className="inline-flex items-center gap-2 py-3 px-4 rounded-xl bg-neutral-50 border border-neutral-200 text-xs font-bold text-neutral-600 hover:text-brand-600 active:scale-[0.98] transition-all cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span>← Back</span>
        </button>
      </div>

      {/* Segmented Tab Controls */}
      <div className="bg-white border border-neutral-100 rounded-2xl p-1.5 flex shadow-sm gap-1">
        <button
          onClick={() => { setActiveTab("report"); setSelectedIncidentId(null); setActiveAction(null); }}
          className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${activeTab === "report"
              ? "bg-danger-500 text-white shadow-sm shadow-danger-500/10"
              : "text-neutral-400 hover:text-neutral-600"
            }`}
        >
          <PlusCircle size={12} />
          <span>Report Alert</span>
        </button>
        <button
          onClick={() => { setActiveTab("contractor"); setSelectedIncidentId(null); setActiveAction(null); }}
          className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${activeTab === "contractor"
              ? "bg-danger-500 text-white shadow-sm shadow-danger-500/10"
              : "text-neutral-400 hover:text-neutral-600"
            }`}
        >
          <FileText size={12} />
          <span>Contractors</span>
        </button>
        <button
          onClick={() => { setActiveTab("history"); setSelectedIncidentId(null); setActiveAction(null); }}
          className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${activeTab === "history"
              ? "bg-danger-500 text-white shadow-sm shadow-danger-500/10"
              : "text-neutral-400 hover:text-neutral-600"
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
            <h1 className="text-xl font-black text-neutral-900 tracking-tight">Report Incident</h1>
            <p className="text-xs text-neutral-500 mt-0.5">Instantly notify the NOC of a hardware fault.</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-neutral-100 shadow-sm p-5 flex flex-col gap-6">
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
              <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">
                Affected Asset
              </label>
              <Select value={asset} onValueChange={setAsset}>
                <SelectTrigger className="w-full h-12 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-semibold text-neutral-800 focus:ring-1 focus:ring-brand-500/20 focus:border-brand-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border border-neutral-100 rounded-2xl shadow-lg z-[var(--z-menu)]">
                  {isLoadingEquip ? (
                    <SelectItem value="loading" disabled className="text-xs font-semibold text-neutral-400">
                      Loading equipment...
                    </SelectItem>
                  ) : equipmentList.length === 0 ? (
                    <SelectItem value="empty" disabled className="text-xs font-semibold text-neutral-400">
                      No active equipment found
                    </SelectItem>
                  ) : (
                    equipmentList.map((a) => (
                      <SelectItem key={a.value} value={a.value} className="text-xs font-semibold text-neutral-800 cursor-pointer">
                        {a.label}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Field 2: Severity Toggle */}
            <div className="space-y-2">
              <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">
                Incident Severity
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {["low", "medium", "critical"].map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverity(sev as any)}
                    className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 ${severity === sev
                        ? sev === "critical"
                          ? "bg-danger-50 border-danger-200 text-danger-700 font-bold shadow-sm"
                          : sev === "medium"
                            ? "bg-warn-50 border-warn-200 text-warn-700 font-bold shadow-sm"
                            : "bg-info-50 border-info-200 text-info-700 font-bold shadow-sm"
                        : "bg-white border-neutral-200 text-neutral-400 font-semibold"
                      }`}
                  >
                    <span className="text-xs uppercase tracking-wider">{sev}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Field 2.5: Occurrence Datetime */}
            <div className="space-y-2">
              <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">
                Date & Time of Occurrence
              </label>
              <input
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="w-full p-4 rounded-2xl bg-neutral-50 border border-neutral-200 text-sm font-semibold text-neutral-900 focus:outline-none focus:border-danger-500 transition-colors"
                required
              />
            </div>

            {/* Field 3: Photo Evidence */}
            <div className="space-y-2">
              <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">
                Photo Evidence
              </label>
              <div
                onClick={handlePhotoUpload}
                className={`h-32 bg-neutral-50 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-neutral-500 cursor-pointer active:bg-neutral-100 transition-colors p-0 relative overflow-hidden ${photo ? "border-ok-400" : "border-neutral-200"
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
                    <Camera size={24} className="text-neutral-400" />
                    <div>
                      <span className="text-xs font-bold text-neutral-700 block">Tap to take photo</span>
                      <span className="text-[10px] text-neutral-400">or upload from device</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Field 4: Incident Notes */}
            <div className="space-y-2">
              <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">
                Incident Notes
              </label>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Type observations (e.g. leaking coolant, strange hum, indicator red, etc.)"
                className="w-full p-4 rounded-2xl bg-neutral-50 border border-neutral-200 text-sm font-semibold text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 resize-none transition-colors"
              />
            </div>

            {/* Sticky/Fixed Bottom Action Container */}
            <div className="fixed bottom-16 left-0 right-0 p-4 bg-white/85 backdrop-blur-lg border-t border-neutral-100 z-40 max-w-md mx-auto flex justify-center shadow-lg rounded-t-3xl">
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-4 rounded-2xl text-white font-black text-sm tracking-widest uppercase transition-all shadow-lg flex items-center justify-center gap-2 ${isSubmitting
                    ? "bg-neutral-400 shadow-none cursor-not-allowed"
                    : severity === "critical"
                      ? "bg-danger-600 hover:bg-danger-700 shadow-danger-600/10 active:scale-[0.98]"
                      : severity === "medium"
                        ? "bg-warn-600 hover:bg-warn-700 shadow-warn-600/10 active:scale-[0.98]"
                        : "bg-info-600 hover:bg-info-700 shadow-info-600/10 active:scale-[0.98]"
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
        <div className="space-y-6">
          <div className="px-1">
            <h1 className="text-xl font-black text-neutral-900 tracking-tight">Contractor Visits</h1>
            <p className="text-xs text-neutral-500 mt-0.5">Log an inspection, or formally close a fault after a repair.</p>
          </div>

          {/* Workflow selector — inspections and repairs are separate actions.
              Logging that a contractor was on site must never imply a fix. */}
          <div className="grid grid-cols-2 gap-2 bg-neutral-100 p-1 rounded-2xl border border-neutral-200/70">
            <button
              type="button"
              onClick={() => setContractorMode("inspection")}
              className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center gap-1 ${contractorMode === "inspection"
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
                }`}
            >
              <Search size={14} />
              <span>Log Inspection</span>
            </button>
            <button
              type="button"
              onClick={() => setContractorMode("resolve")}
              className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center gap-1 ${contractorMode === "resolve"
                  ? "bg-white text-ok-700 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
                }`}
            >
              <Wrench size={14} />
              <span>Resolve Fault</span>
            </button>
          </div>

          {contractorMode === "inspection" && (
          <form
            onSubmit={handleLogInspection}
            className="bg-white rounded-3xl border border-neutral-100 shadow-sm p-5 flex flex-col gap-6 animate-fade-in"
          >
            <div className="flex items-center gap-2 border-b border-neutral-50 pb-3">
              <span className="w-1.5 h-6 bg-neutral-900 rounded-full" />
              <span className="text-xs font-black text-neutral-800 uppercase tracking-wider">Log Contractor Inspection</span>
            </div>

            <div className="bg-info-50/70 border border-info-100 rounded-2xl px-3.5 py-2.5 text-[10px] font-semibold text-info-900 leading-relaxed">
              This records that a contractor attended site. It does <span className="font-black">not</span> change any fault ticket status — use <span className="font-black">Resolve Fault</span> once repairs are complete.
            </div>

            {/* Purpose of visit — freeform. Contractors do an open-ended range
                of work, so this is a text field with optional shortcuts rather
                than a closed list that would force visits into wrong buckets. */}
            <div className="space-y-2">
              <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">
                Purpose of Visit / Description of Work
              </label>
              <input
                type="text"
                value={visitPurpose}
                onChange={(e) => setVisitPurpose(e.target.value)}
                placeholder="e.g. Replaced DG-2 fuel filter and bled the line"
                className="w-full px-4 h-12 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-semibold text-neutral-800 focus:outline-none focus:border-neutral-800 focus:ring-1 focus:ring-neutral-800/10 transition-colors"
                required
              />
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {PURPOSE_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setVisitPurpose(s)}
                    className="px-2.5 py-1 rounded-lg bg-neutral-50 border border-neutral-200 text-[9px] font-bold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-[9px] font-semibold text-neutral-400">
                Shortcuts are suggestions — type anything that describes the visit.
              </p>
            </div>

            {/* What the visit was aimed at */}
            <div className="space-y-2">
              <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">
                What Was Inspected
              </label>
              <div className="grid grid-cols-3 gap-2 bg-neutral-50 p-1 rounded-2xl border border-neutral-100">
                {([
                  { value: "SITE"   as VisitTargetType, icon: <Building2 size={13} />, label: "Whole Site" },
                  { value: "ASSET"  as VisitTargetType, icon: <Boxes size={13} />,     label: "Equipment" },
                  { value: "TICKET" as VisitTargetType, icon: <Ticket size={13} />,    label: "Fault Ticket" },
                ]).map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      setVisitTargetType(t.value);
                      setSelectedFaultId("");
                      setVisitTargetAsset("");
                    }}
                    className={`py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center gap-1 ${visitTargetType === t.value
                        ? "bg-white text-neutral-900 shadow-sm"
                        : "text-neutral-400 hover:text-neutral-600"
                      }`}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Contractor Name */}
            <div className="space-y-2">
              <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">
                Contractor Company/Name
              </label>
              <input
                type="text"
                value={contractorName}
                onChange={(e) => setContractorName(e.target.value)}
                placeholder="e.g. Cummins Services, Vertiv Team"
                className="w-full px-4 h-12 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-semibold text-neutral-800 focus:outline-none focus:border-neutral-800 focus:ring-1 focus:ring-neutral-800/10 transition-colors"
                required
              />
            </div>

            {/* The contractor signs for their own work, on this device, before
                leaving. Recording only the name the technician typed is the
                technician's word that someone attended — not the contractor's
                acknowledgement of what they did, which is the record that
                matters when a finding or an invoice is disputed. */}
            <div className="space-y-2">
              <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">
                Contractor Signature
                <span className="ml-1 font-bold normal-case tracking-normal text-neutral-300">
                  optional
                </span>
              </label>
              <SignatureField
                value={contractorSig}
                signedAt={contractorSigAt}
                onClick={() => setSigPadOpen(true)}
                label={contractorName.trim() || "Contractor"}
              />
              <p className="text-[10px] font-semibold text-neutral-400">
                Hand the device to the contractor. Witnessed by you as the
                technician on site.
              </p>
            </div>

            {/* Target: specific asset */}
            {visitTargetType === "ASSET" && (
              <div className="space-y-2 animate-fade-in">
                <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">
                  Select Equipment
                </label>
                <Select value={visitTargetAsset} onValueChange={setVisitTargetAsset}>
                  <SelectTrigger className="w-full h-12 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-semibold text-neutral-800 focus:ring-1 focus:ring-neutral-800/10 focus:border-neutral-800">
                    <SelectValue placeholder={isLoadingEquip ? "Loading equipment…" : "-- Choose equipment --"} />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-neutral-100 rounded-2xl shadow-lg z-[var(--z-menu)]">
                    {equipmentList.length === 0 ? (
                      <SelectItem value="empty" disabled className="text-xs font-semibold text-neutral-400">
                        No active equipment registered
                      </SelectItem>
                    ) : (
                      equipmentList.map((eq) => (
                        <SelectItem key={eq.value} value={eq.value} className="text-xs font-semibold text-neutral-800 cursor-pointer">
                          {eq.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Target: existing fault ticket (inspected, not resolved) */}
            {visitTargetType === "TICKET" && (
              <div className="space-y-2 animate-fade-in">
                <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">
                  Select Fault Ticket
                </label>
                <Select value={selectedFaultId} onValueChange={setSelectedFaultId}>
                  <SelectTrigger className="w-full h-12 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-semibold text-neutral-800 focus:ring-1 focus:ring-neutral-800/10 focus:border-neutral-800">
                    <SelectValue placeholder="-- Choose an open fault ticket --" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-neutral-100 rounded-2xl shadow-lg z-[var(--z-menu)]">
                    {incidents.filter((i) => i.status === "OPEN").length === 0 ? (
                      <SelectItem value="empty" disabled className="text-xs font-semibold text-neutral-400">
                        No open fault tickets available
                      </SelectItem>
                    ) : (
                      incidents
                        .filter((i) => i.status === "OPEN")
                        .map((inc) => (
                          <SelectItem
                            key={inc.id}
                            value={inc.id}
                            className="text-xs font-semibold text-neutral-800 cursor-pointer"
                          >
                            {inc.ticket_number} - {inc.asset_id.toUpperCase().replace(/_/g, " ")}
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-[9px] font-bold text-warn-700 bg-warn-50 border border-warn-100 rounded-lg px-2.5 py-1.5">
                  This ticket will stay OPEN after logging.
                </p>
              </div>
            )}

            {/* Tasks / Work details */}
            <div className="space-y-2">
              <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">
                Findings / Work Carried Out
              </label>
              <textarea
                rows={4}
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder={
                  visitTargetType === "TICKET"
                    ? "What did the contractor observe about this fault?"
                    : "Detail what was inspected, serviced, refuelled or checked…"
                }
                className="w-full p-4 rounded-2xl bg-neutral-50 border border-neutral-200 text-sm font-semibold text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-neutral-800 focus:ring-1 focus:ring-neutral-800/10 resize-none transition-colors"
                required
              />
            </div>

            {/* Trackable defects, separate from the narrative above. The notes
                box describes the visit; these become jobs somebody owns. */}
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4">
              <ContractorFindingsEditor findings={findings} onChange={setFindings} />
            </div>

            {/* Photo upload */}
            <div className="space-y-2">
              <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">
                Visit Photo / Evidence
              </label>
              <div
                onClick={handleActionPhotoUpload}
                className={`h-32 bg-neutral-50 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-neutral-500 cursor-pointer active:bg-neutral-100 transition-colors p-0 relative overflow-hidden ${actionPhoto ? "border-ok-400" : "border-neutral-200"
                  }`}
              >
                {actionPhoto ? (
                  <div className="w-full h-full flex flex-col items-center justify-center relative p-0">
                    <img
                      src={actionPhoto}
                      alt="Visit evidence preview"
                      className="w-full h-full object-cover rounded-2xl"
                    />
                    <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center text-white opacity-0 hover:opacity-100 transition-opacity rounded-2xl">
                      <Camera size={20} />
                      <span className="text-[10px] font-bold mt-1 uppercase tracking-wider">Tap to retake</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveActionPhoto}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors z-10"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-1.5 text-center px-4">
                    <Camera size={24} className="text-neutral-400" />
                    <div>
                      <span className="text-xs font-bold text-neutral-700 block">Tap to take photo</span>
                      <span className="text-[10px] text-neutral-400">capture visit proof</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Hidden Input for Action Camera Capture */}
            <input
              type="file"
              ref={actionFileInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleActionFileChange}
              className="hidden"
            />

            <button
              type="submit"
              disabled={isSubmittingAction}
              className="w-full py-4 bg-neutral-900 hover:bg-neutral-950 text-white font-black text-sm tracking-widest uppercase rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
            >
              {isSubmittingAction ? (
                <span>Logging Inspection...</span>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Log Inspection</span>
                </>
              )}
            </button>
          </form>
          )}

          {/* Recent inspections — the site logbook, distinct from fault tickets */}
          {contractorMode === "inspection" && (
            <div className="space-y-3 pt-2">
              <div className="px-1 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-neutral-900 uppercase tracking-wider">Recent Inspections</h2>
                  <p className="text-[11px] text-neutral-400 font-semibold">Contractor attendance logbook.</p>
                </div>
                <span className="bg-neutral-100 text-neutral-600 font-extrabold text-[10px] px-2.5 py-1 rounded-full border border-neutral-200">
                  {visits.length} Logged
                </span>
              </div>

              {visits.length === 0 ? (
                <div className="bg-white border border-neutral-100 rounded-3xl p-6 text-center shadow-sm">
                  <p className="text-xs font-bold text-neutral-800">No inspections logged yet</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Contractor site checks will appear here.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {visits.slice(0, 10).map((v) => {
                    const linkedTicket = v.target_type === "TICKET"
                      ? incidents.find((i) => i.id === v.target_ref)
                      : null;
                    return (
                      <div key={v.id} className="bg-white border border-neutral-100 rounded-2xl p-4 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-black text-neutral-400 tracking-wider">
                            {v.visit_number}
                          </span>
                          <span className="text-[9px] font-bold text-neutral-400 font-mono">
                            {formatDate(v.occurred_at)}
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <ClipboardList size={15} className="shrink-0 text-neutral-400" aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="text-xs font-black text-neutral-900 leading-tight">{v.purpose}</p>
                            <p className="text-[10px] font-bold text-neutral-500 mt-0.5">
                              {v.target_type === "SITE" && "Whole site"}
                              {v.target_type === "ASSET" && (v.target_ref || "").toUpperCase().replace(/_/g, " ")}
                              {v.target_type === "TICKET" && (linkedTicket
                                ? `Ticket ${linkedTicket.ticket_number} — still ${linkedTicket.status}`
                                : "Fault ticket")}
                            </p>
                          </div>
                        </div>
                        <p className="text-[11px] text-neutral-600 font-medium leading-relaxed border-t border-neutral-50 pt-2">
                          <span className="font-black text-neutral-700">{v.contractor}</span> — {v.notes}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Section: Active Open Faults for Resolution */}
          {contractorMode === "resolve" && (
          <div className="space-y-4 pt-4">
            <div className="px-1 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-neutral-900 uppercase tracking-wider">Active Fault Tickets</h2>
                <p className="text-[11px] text-neutral-400 font-semibold">Selecting one closes it and issues a clearance receipt.</p>
              </div>
              <span className="bg-danger-50 text-danger-600 font-extrabold text-[10px] px-2.5 py-1 rounded-full border border-danger-100">
                {incidents.filter((i) => i.status === "OPEN").length} Open
              </span>
            </div>

            {incidents.filter((i) => i.status === "OPEN").length === 0 ? (
              <div className="bg-white border border-neutral-100 rounded-3xl p-6 text-center shadow-sm">
                <CheckCircle2 size={24} className="text-ok-500 mx-auto mb-2" />
                <p className="text-xs font-bold text-neutral-800">All Systems Nominal</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">There are no open faults to resolve.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {incidents
                  .filter((i) => i.status === "OPEN")
                  .map((incident) => {
                    const isResolving = activeAction?.incidentId === incident.id && activeAction.type === "resolve";

                    return (
                      <div
                        key={incident.id}
                        className="bg-white border border-neutral-100 rounded-3xl p-5 shadow-sm space-y-4 relative overflow-hidden"
                      >
                        {/* Left border indicator */}
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-danger-500" />

                        <div className="flex items-center justify-between pl-1">
                          <span className="text-[10px] font-mono font-black text-neutral-400 tracking-wider">
                            {incident.ticket_number}
                          </span>
                          <span className="bg-danger-50 border border-danger-100 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded text-danger-600">
                            {incident.severity}
                          </span>
                        </div>

                        <div className="pl-1">
                          <h3 className="font-black text-neutral-900 text-sm tracking-tight">
                            {incident.asset_id.toUpperCase().replace(/_/g, " ")}
                          </h3>
                          <p className="text-xs text-neutral-500 mt-1 font-medium leading-relaxed">
                            <span className="font-bold text-neutral-400 block text-[9px] uppercase tracking-wider mb-0.5">Fault Details</span>
                            {incident.notes}
                          </p>

                          {incident.contractor_engaged && (
                            <div className="mt-2.5 inline-flex items-center gap-1.5 bg-neutral-50 border border-neutral-200/60 rounded-lg px-2 py-1 text-[10px] font-bold text-neutral-600">
                              <span>Assigned Contractor:</span>
                              <span className="text-neutral-800 font-extrabold">{incident.contractor_engaged}</span>
                            </div>
                          )}
                        </div>

                        {/* Display comments/visits log timeline */}
                        <div className="border-t border-neutral-50 pt-3.5">
                          {renderIncidentTimeline(incident)}
                        </div>

                        {/* Resolution Button/Form */}
                        {!isResolving ? (
                          <div className="pl-1 pt-3 border-t border-neutral-50 flex justify-end">
                            <button
                              onClick={() => {
                                setActiveAction({ incidentId: incident.id, type: "resolve" });
                                setContractorName(incident.contractor_engaged || "");
                                setActionNotes("");
                                setActionPhoto(null);
                              }}
                              className="py-2.5 px-4 bg-ok-600 hover:bg-ok-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shadow-ok-600/10"
                            >
                              <CheckCircle2 size={13} />
                              <span>Resolve Fault</span>
                            </button>
                          </div>
                        ) : (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleSubmitResolution(incident.id);
                            }}
                            className="space-y-4 bg-neutral-50/60 p-4 border border-neutral-200/50 rounded-2xl animate-fade-in pl-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-neutral-800 uppercase tracking-wider">
                                Resolve Fault Ticket
                              </span>
                              <button
                                type="button"
                                onClick={() => setActiveAction(null)}
                                className="text-neutral-400 hover:text-neutral-600"
                              >
                                <X size={14} />
                              </button>
                            </div>

                            {/* Who actually fixed it */}
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block">
                                Resolved By
                              </label>
                              <div className="grid grid-cols-2 gap-2 bg-white p-1 rounded-xl border border-neutral-200">
                                <button
                                  type="button"
                                  onClick={() => setResolverType("INTERNAL_TECH")}
                                  className={`py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center gap-1 ${resolverType === "INTERNAL_TECH"
                                      ? "bg-neutral-900 text-white shadow-sm"
                                      : "text-neutral-400 hover:text-neutral-600"
                                    }`}
                                >
                                  <HardHat size={13} />
                                  <span>Site Technician</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setResolverType("EXTERNAL_CONTRACTOR")}
                                  className={`py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center gap-1 ${resolverType === "EXTERNAL_CONTRACTOR"
                                      ? "bg-neutral-900 text-white shadow-sm"
                                      : "text-neutral-400 hover:text-neutral-600"
                                    }`}
                                >
                                  <Wrench size={13} />
                                  <span>External Contractor</span>
                                </button>
                              </div>
                            </div>

                            {resolverType === "INTERNAL_TECH" ? (
                              <div className="bg-neutral-50 border border-neutral-200/70 rounded-xl px-3 py-2 text-[10px] font-bold text-neutral-600">
                                Recorded against you — <span className="font-black text-neutral-800">{user?.name || "Field Tech"}</span>. No contractor will be attached to this ticket.
                              </div>
                            ) : (
                              <div className="space-y-1.5 animate-fade-in">
                                <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block">
                                  Contractor Name/Company
                                </label>
                                <input
                                  type="text"
                                  value={contractorName}
                                  onChange={(e) => setContractorName(e.target.value)}
                                  placeholder="e.g. Vertiv Services"
                                  className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-semibold text-neutral-800 focus:outline-none focus:border-danger-500"
                                  required
                                />
                              </div>
                            )}

                            {/* Resolution Details */}
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block">
                                Resolution / Solution Provided
                              </label>
                              <textarea
                                rows={3}
                                value={actionNotes}
                                onChange={(e) => setActionNotes(e.target.value)}
                                placeholder="Explain how the fault was resolved..."
                                className="w-full p-3 bg-white border border-neutral-250 rounded-xl text-xs font-semibold text-neutral-800 focus:outline-none focus:border-danger-500 resize-none"
                                required
                              />
                            </div>

                            {/* Capture/Upload resolution photo */}
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block">
                                Resolution Photo (Optional)
                              </label>
                              <div
                                onClick={handleActionPhotoUpload}
                                className={`h-24 bg-white border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-neutral-500 cursor-pointer active:bg-neutral-50 transition-colors relative overflow-hidden p-0 ${actionPhoto ? "border-ok-400" : "border-neutral-200"
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
                                    <Camera size={18} className="text-neutral-400" />
                                    <span className="text-[10px] font-bold text-neutral-700">Upload Resolution Photo</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Signature — required. Everything above is a
                                claim typed into a form; this is the person
                                putting their name to it. */}
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block">
                                Signature
                                <span className="ml-1 text-danger-500">required</span>
                              </label>
                              <SignatureField
                                value={resolutionSig}
                                signedAt={resolutionSigAt}
                                onClick={() => setResolutionPadOpen(true)}
                                label={user?.name || "Technician"}
                              />
                              <p className="text-[10px] font-semibold text-neutral-400">
                                You are signing that this fault is resolved as described above.
                              </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => setActiveAction(null)}
                                className="py-2 px-3.5 border border-neutral-200 text-neutral-600 font-bold rounded-xl text-[10px] uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer bg-white"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={isSubmittingAction}
                                className="py-2 px-4 text-white bg-ok-600 hover:bg-ok-700 font-black rounded-xl text-[10px] uppercase tracking-wider active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                {isSubmittingAction ? (
                                  <span>Resolving...</span>
                                ) : (
                                  <>
                                    <CheckCircle2 size={12} />
                                    <span>Confirm Resolution</span>
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
        </div>
      )}

      {/* Tab 3: My Reported Incidents & Comments Timeline (Corrections / Additions) */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="px-1">
            <h1 className="text-xl font-black text-neutral-900 tracking-tight">My Reported Alerts</h1>
            <p className="text-xs text-neutral-500 mt-0.5">Attach corrections or add logs to your reports.</p>
          </div>

          {myIncidents.length === 0 ? (
            <div className="bg-white border border-neutral-100 rounded-3xl p-8 text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto text-neutral-400 border border-neutral-100">
                <FileText size={30} />
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-neutral-950 text-sm">No Incidents Reported</h3>
                <p className="text-xs text-neutral-400 max-w-[240px] mx-auto">
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
                    <div className="bg-white border border-neutral-100 rounded-3xl p-5 shadow-sm space-y-4 relative overflow-hidden">
                      {/* Left border indicator */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isOpen ? "bg-danger-500" : "bg-ok-500"}`} />

                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-black text-neutral-400 tracking-wider">
                          {incident.ticket_number}
                        </span>
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md border ${isOpen
                            ? "bg-danger-50 text-danger-600 border-danger-100"
                            : "bg-ok-50 text-ok-600 border-ok-100"
                          }`}>
                          {incident.status}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-black text-neutral-900 text-sm tracking-tight">
                          {incident.asset_id.toUpperCase().replace(/_/g, " ")} Alert
                        </h3>
                        <p className="text-xs text-neutral-500 mt-1 font-medium leading-relaxed">
                          <span className="font-bold text-neutral-400 block text-[9px] uppercase tracking-wider mb-0.5">Original Report Notes</span>
                          {incident.notes}
                        </p>
                      </div>

                      {/* Display Main Incident Photo if uploaded */}
                      {incident.photo_url && (
                        <div className="max-w-[200px] rounded-2xl overflow-hidden border border-neutral-100">
                          <img src={incident.photo_url} alt="Incident Evidence" className="w-full h-auto object-cover" />
                        </div>
                      )}

                      {/* Appended comments timeline */}
                      <div className="border-t border-neutral-50 pt-3.5">
                        {renderIncidentTimeline(incident)}
                      </div>

                      {/* Interactive Form Trigger (Only for open incidents) */}
                      {isOpen && (
                        <div className="border-t border-neutral-50 pt-3.5">
                          {!isSelected ? (
                            <button
                              onClick={() => setSelectedIncidentId(incident.id)}
                              className="w-full py-2.5 border border-neutral-200 hover:border-neutral-300 hover:text-danger-600 text-neutral-600 font-bold rounded-2xl text-xs uppercase tracking-wider active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <MessageSquare size={13} />
                              <span>Append Correction or Add Log</span>
                            </button>
                          ) : (
                            <form
                              onSubmit={(e) => handleAddComment(e, incident.id)}
                              className="space-y-3 bg-neutral-50/70 p-4 border border-neutral-200/50 rounded-2xl animate-fade-in"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-neutral-800">New Log Entry</span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedIncidentId(null)}
                                  className="text-neutral-400 hover:text-neutral-700"
                                >
                                  <X size={14} />
                                </button>
                              </div>

                              {/* Comment Type */}
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setCommentType("addition")}
                                  className={`py-2 text-[10px] rounded-xl border font-bold transition-all text-center ${commentType === "addition"
                                      ? "bg-info-50 border-info-200 text-info-700"
                                      : "bg-white border-neutral-200 text-neutral-400"
                                    }`}
                                >
                                  Additional Details
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCommentType("correction")}
                                  className={`py-2 text-[10px] rounded-xl border font-bold transition-all text-center ${commentType === "correction"
                                      ? "bg-danger-50 border-danger-200 text-danger-700"
                                      : "bg-white border-neutral-200 text-neutral-400"
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
                                className="w-full p-3 rounded-xl bg-white border border-neutral-200 text-xs font-semibold text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-danger-500 resize-none"
                                required
                              />

                              {/* Actions */}
                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={() => setSelectedIncidentId(null)}
                                  className="py-2 px-4 border border-neutral-200 text-neutral-600 font-bold rounded-xl text-[10px] uppercase tracking-wider active:scale-98 transition-all cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  disabled={isSubmittingComment}
                                  className="py-2 px-4 bg-neutral-900 hover:bg-neutral-800 text-white font-black rounded-xl text-[10px] uppercase tracking-wider active:scale-98 transition-all flex items-center justify-center gap-1 cursor-pointer"
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
                      <div className="border-b border-neutral-200/80 my-6 mx-2" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Same pad as the shift handover — one way of signing across the whole
          platform, whether the signer is staff or a visiting contractor. */}
      <SignaturePad
        open={resolutionPadOpen}
        onClose={() => setResolutionPadOpen(false)}
        signerName={user?.name || undefined}
        context="Incident resolution"
        confirmLabel="Sign this resolution"
        onConfirm={(sig) => {
          setResolutionSig(sig.dataUrl);
          setResolutionSigAt(sig.signedAt);
          setResolutionPadOpen(false);
        }}
      />

      <SignaturePad
        open={sigPadOpen}
        onClose={() => setSigPadOpen(false)}
        signerName={contractorName.trim() || "Contractor"}
        context={visitPurpose.trim() ? `Contractor visit · ${visitPurpose.trim()}` : "Contractor visit"}
        confirmLabel="Sign for this work"
        onConfirm={(sig) => {
          setContractorSig(sig.dataUrl);
          setContractorSigAt(sig.signedAt);
          setSigPadOpen(false);
        }}
      />
    </div>
  );
}

export default IncidentReport;
