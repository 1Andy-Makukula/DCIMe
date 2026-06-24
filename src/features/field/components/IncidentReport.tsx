import React, { useState } from "react";
import { useNavigate } from "react-router";
import { 
  Camera, 
  ChevronDown, 
  CheckCircle2, 
  X, 
  AlertOctagon, 
  Image as ImageIcon,
  ArrowLeft,
  FileText,
  MessageSquare,
  PlusCircle,
  History
} from "lucide-react";
import { useIncidents } from "../hooks/useIncidents";

export function IncidentReport() {
  const navigate = useNavigate();
  const { 
    incidents, 
    reportIncident, 
    addIncidentComment 
  } = useIncidents();
  
  // Tab state: "report" or "history"
  const [activeTab, setActiveTab] = useState<"report" | "history">("report");

  // Report Form State
  const [asset, setAsset] = useState("UPS-1");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      alert("Please provide incident notes detailing the fault.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const result = await reportIncident({
        asset_id: asset,
        severity: severity,
        notes: notes,
        photo_url: photo,
        occurred_at: new Date(occurredAt).toISOString(),
        raised_by_name: "Anderson M.",
        raised_by_id: "EMP-0874-AM"
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
      await addIncidentComment(incidentId, {
        comment_text: commentText,
        type: commentType,
        author_name: "Anderson M.",
        author_id: "EMP-0874-AM"
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

  // Filter incidents personally reported by this technician (Anderson M.)
  const myIncidents = incidents.filter(
    (i) => i.raised_by_id === "EMP-0874-AM"
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
      <div className="bg-white border border-gray-100 rounded-2xl p-1.5 flex shadow-sm">
        <button
          onClick={() => { setActiveTab("report"); setSelectedIncidentId(null); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === "report"
              ? "bg-red-500 text-white shadow-sm shadow-red-500/10"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <PlusCircle size={14} />
          <span>Report Alert</span>
        </button>
        <button
          onClick={() => { setActiveTab("history"); setSelectedIncidentId(null); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === "history"
              ? "bg-red-500 text-white shadow-sm shadow-red-500/10"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <History size={14} />
          <span>My Reported Alerts ({myIncidents.length})</span>
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
                className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-850 focus:outline-none focus:border-red-500 transition-colors"
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

      {/* Tab 2: My Reported Incidents & Comments Timeline (Corrections / Additions) */}
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
              {myIncidents.map((incident) => {
                const isOpen = incident.status === "OPEN";
                const isSelected = selectedIncidentId === incident.id;
                return (
                  <div 
                    key={incident.id}
                    className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-4 relative overflow-hidden"
                  >
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
                        {incident.asset_id} Alert
                      </h3>
                      <p className="text-xs text-gray-500 mt-1 font-medium leading-relaxed">
                        <span className="font-bold text-gray-400 block text-[9px] uppercase tracking-wider mb-0.5">Original Report Notes</span>
                        {incident.notes}
                      </p>
                    </div>

                    {/* Appended comments timeline */}
                    <div className="border-t border-gray-50 pt-3.5 space-y-3">
                      <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-wider">
                        Appended Updates ({incident.comments?.length || 0})
                      </h4>

                      {incident.comments && incident.comments.length > 0 ? (
                        <div className="relative pl-3.5 border-l border-gray-100 space-y-3 ml-1">
                          {incident.comments.map((cmt, idx) => (
                            <div key={idx} className="relative space-y-1">
                              {/* Timeline dot */}
                              <div className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-gray-300 border-2 border-white" />
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded ${
                                  cmt.type === "correction"
                                    ? "bg-red-50 text-red-600 border border-red-100"
                                    : "bg-blue-50 text-blue-600 border border-blue-100"
                                }`}>
                                  {cmt.type === "correction" ? "Correction" : "Additional"}
                                </span>
                                <span className="text-[8px] font-mono text-gray-400">{formatDate(cmt.timestamp)}</span>
                              </div>
                              <p className="text-xs text-gray-700 font-medium leading-relaxed">
                                {cmt.comment_text}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-400 italic">No comments or corrections appended yet.</p>
                      )}
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
