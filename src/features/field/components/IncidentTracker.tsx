import React, { useState } from "react";
import { useOutletContext } from "react-router";
import { useIncidents, Incident } from "../hooks/useIncidents";
import { TechUser } from "./TechLayout";
import { 
  AlertTriangle,
  CheckCircle2, 
  Clock, 
  User, 
  Calendar, 
  Building2, 
  ShieldAlert, 
  Check, 
  FileText, 
  X, 
  RefreshCw,
  AlertCircle
} from "lucide-react";

export function IncidentTracker() {
  const { user } = useOutletContext<{ user: TechUser | null }>();
  const { 
    incidents, 
    isLoading, 
    error, 
    refresh, 
    resolveIncident 
  } = useIncidents();

  const [activeTab, setActiveTab] = useState<"active" | "resolved">("active");
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [showReceipt, setShowReceipt] = useState<string | null>(null); // receipt_number

  // Resolution Form State
  const [resImpact, setResImpact] = useState("");
  const [resContractor, setResContractor] = useState("");
  const [resDetails, setResDetails] = useState("");
  const [resResolvedAt, setResResolvedAt] = useState("");
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false);

  // Filter incidents
  const activeIncidents = incidents.filter(i => i.status === "OPEN");
  const resolvedIncidents = incidents.filter(i => i.status === "RESOLVED");

  const calculateAging = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - created.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

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

  const handleCardClick = (incident: Incident) => {
    setSelectedIncident(incident);
    setIsResolving(false);
  };

  const handleStartResolution = () => {
    if (!selectedIncident) return;
    setIsResolving(true);
    // Pre-fill resolution form values
    setResImpact("");
    setResContractor("");
    setResDetails("");
    setResResolvedAt(new Date().toISOString().slice(0, 16));
  };

  const handleSubmitResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident) return;
    if (!resImpact.trim()) {
      alert("Please enter facility impact commentary.");
      return;
    }
    if (!resContractor.trim() || !resDetails.trim()) {
      alert("Please fill in contractor and resolution details.");
      return;
    }
    setIsSubmittingResolution(true);
    try {
      const resolved = await resolveIncident(selectedIncident.id, {
        impact: resImpact,
        contractor_engaged: resContractor,
        resolution_details: resDetails,
        resolved_at: new Date(resResolvedAt).toISOString(),
        resolved_by_name: user?.name || "Field Tech",
        resolved_by_id: user?.id || "EMP-UNKNOWN"
      });

      setShowReceipt(resolved.receipt_number);
      setSelectedIncident(null);
      setIsResolving(false);
    } catch (err) {
      alert("Failed to resolve incident. Please try again.");
    } finally {
      setIsSubmittingResolution(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-5 pb-6">
      {/* Header with Title & Refresh */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Status & Tracking</h1>
          <p className="text-xs text-gray-500 mt-0.5">Real-time alerts and resolution dispatch log.</p>
        </div>
        <button 
          onClick={refresh}
          className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-900 active:scale-95 transition-all shadow-sm"
          title="Refresh Log"
          disabled={isLoading}
        >
          <RefreshCw size={15} className={isLoading ? "animate-spin text-red-500" : ""} />
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-gray-100 rounded-2xl p-1.5 flex shadow-sm">
        <button
          onClick={() => { setActiveTab("active"); setShowReceipt(null); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === "active"
              ? "bg-red-500 text-white shadow-sm shadow-red-500/10"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <ShieldAlert size={14} />
          <span>Active Alerts ({activeIncidents.length})</span>
        </button>
        <button
          onClick={() => { setActiveTab("resolved"); setShowReceipt(null); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === "resolved"
              ? "bg-red-500 text-white shadow-sm shadow-red-500/10"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <CheckCircle2 size={14} />
          <span>Resolved ({resolvedIncidents.length})</span>
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-2xl flex items-start gap-3 text-xs">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Error:</span> {error}
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && incidents.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-gray-100 rounded-3xl p-5 space-y-3 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/3" />
              <div className="h-6 bg-gray-100 rounded w-2/3" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Active Tab View */}
          {activeTab === "active" && (
            <div className="space-y-3.5">
              {activeIncidents.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-3xl p-8 text-center space-y-4 shadow-sm">
                  <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto text-green-500 border border-green-100">
                    <CheckCircle2 size={32} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-black text-gray-955 text-sm">No Active Incidents</h3>
                    <p className="text-xs text-gray-400 max-w-[240px] mx-auto">
                      All systems are operating nominally. No hardware faults reported.
                    </p>
                  </div>
                </div>
              ) : (
                activeIncidents.map((incident) => {
                  const days = calculateAging(incident.created_at);
                  const isOld = days >= 2;
                  return (
                    <div
                      key={incident.id}
                      onClick={() => handleCardClick(incident)}
                      className="bg-white border border-gray-100 hover:border-red-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden group"
                    >
                      {/* Left vertical status indicator (Solid fault red for Active Alerts) */}
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500" />

                      <div className="space-y-3 pl-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-black text-gray-400 tracking-wider">
                            {incident.ticket_number}
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border bg-red-50 text-red-600 border-red-100">
                            ACTIVE
                          </span>
                        </div>

                        <div>
                          <h3 className="font-black text-gray-900 text-sm tracking-tight group-hover:text-red-500 transition-colors">
                            {incident.asset_id} Alert
                          </h3>
                          <p className="text-xs text-gray-500 line-clamp-2 mt-1 font-medium">
                            {incident.notes || "No additional logs provided."}
                          </p>
                        </div>

                        <div className="border-t border-gray-50 pt-3 flex items-center justify-between text-[10px] text-gray-400 font-semibold">
                          <div className="flex items-center gap-1">
                            <Clock size={12} />
                            <span>{formatDate(incident.created_at)}</span>
                          </div>
                          
                          {/* Dynamic Aging Counter */}
                          <span className={`px-2.5 py-1 rounded-full border flex items-center gap-1 font-bold ${
                            isOld
                              ? "bg-red-50 text-red-600 border-red-100 animate-pulse"
                              : "bg-amber-50 text-amber-700 border-amber-100"
                          }`}>
                            <AlertTriangle size={10} className="text-amber-500" />
                            <span>
                              {days === 0 ? "Reported Today" : `Unresolved for ${days} ${days === 1 ? 'day' : 'days'}`}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Resolved Tab View */}
          {activeTab === "resolved" && (
            <div className="space-y-3.5">
              {resolvedIncidents.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-3xl p-8 text-center space-y-4 shadow-sm">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-400 border border-gray-100">
                    <FileText size={30} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-black text-gray-955 text-sm">Archive Empty</h3>
                    <p className="text-xs text-gray-400 max-w-[240px] mx-auto">
                      No resolved incidents logged in the database archive.
                    </p>
                  </div>
                </div>
              ) : (
                resolvedIncidents.map((incident) => (
                  <div
                    key={incident.id}
                    onClick={() => handleCardClick(incident)}
                    className="bg-white border border-gray-100 hover:border-gray-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-green-500" />
                    
                    <div className="space-y-3 pl-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-black text-gray-400 tracking-wider">
                          {incident.ticket_number}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-mono font-bold bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-md">
                            {incident.receipt_number}
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-50 border border-gray-100 text-gray-500">
                            RESOLVED
                          </span>
                        </div>
                      </div>

                      <div>
                        <h3 className="font-black text-gray-900 text-sm tracking-tight">
                          {incident.asset_id} Alert
                        </h3>
                        <p className="text-xs text-gray-500 line-clamp-1 mt-1 font-medium">
                          Resolved: {incident.resolution_details}
                        </p>
                      </div>

                      <div className="border-t border-gray-50 pt-3 flex items-center justify-between text-[10px] text-gray-400 font-semibold">
                        <div className="flex items-center gap-1">
                          <User size={12} />
                          <span>By: {incident.resolved_by_name}</span>
                        </div>
                        <div className="flex items-center gap-1 text-green-600 font-bold">
                          <Check size={12} />
                          <span>{incident.resolved_at ? formatDate(incident.resolved_at) : ""}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Receipt Success Overlay Screen */}
      {showReceipt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[32px] border border-gray-100 shadow-2xl p-6 text-center space-y-6 animate-fade-in relative overflow-hidden">
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-green-500 rounded-full blur-3xl opacity-10 pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-red-500 rounded-full blur-3xl opacity-10 pointer-events-none" />

            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto text-green-600 border border-green-100">
              <CheckCircle2 size={36} className="animate-bounce" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-gray-905 tracking-tight">Incident Cleared</h2>
              <p className="text-xs text-gray-500 px-2 leading-relaxed">
                The incident has been resolved and logged. A digital receipt has been dispatched to the NOC audit trail.
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 text-left border border-gray-100 font-mono text-[11px] space-y-2.5 relative">
              <div className="border-b border-dashed border-gray-200 pb-2 flex justify-between items-center">
                <span className="font-black text-gray-400">RECEIPT NUMBER</span>
                <span className="font-black text-green-600 text-xs">{showReceipt}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Site Name:</span>
                <span className="font-bold text-gray-800">NTC ZM 0874</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Resolved By:</span>
                <span className="font-bold text-gray-800">{user?.name || "Field Tech"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Employee ID:</span>
                <span className="font-bold text-gray-800">{user?.id || "EMP-UNKNOWN"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Timestamp:</span>
                <span className="font-bold text-gray-800">{formatDate(new Date().toISOString())}</span>
              </div>
            </div>

            <button
              onClick={() => { setShowReceipt(null); refresh(); }}
              className="w-full py-4 bg-gray-900 hover:bg-gray-850 text-white font-black rounded-2xl text-xs uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer shadow-lg"
            >
              Done & Close
            </button>
          </div>
        </div>
      )}

      {/* Main Full Details Modal & Editing/Resolution Flow */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-[32px] sm:rounded-[32px] border-t sm:border border-gray-100 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-slide-up">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <span className="text-[10px] font-mono font-black text-gray-400 tracking-wider">
                  {selectedIncident.ticket_number}
                </span>
                <h2 className="text-base font-black text-gray-900 tracking-tight mt-0.5">
                  {selectedIncident.asset_id} Details
                </h2>
              </div>
              <button 
                onClick={() => setSelectedIncident(null)}
                className="p-2 rounded-full bg-gray-50 text-gray-400 hover:text-gray-800 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Scrollable Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 pb-8">
              
              {/* Show different interfaces based on mode */}
              {!isResolving && (
                <>
                  {/* Status Badge Strip */}
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex flex-col justify-between">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Operational Status</span>
                    <span className={`text-xs font-black uppercase mt-1.5 inline-block ${
                      selectedIncident.status === "OPEN" ? "text-red-500 font-black" : "text-green-600"
                    }`}>
                      ● {selectedIncident.status === "OPEN" ? "ACTIVE OUTAGE / ALERT" : "RESOLVED & CLEARED"}
                    </span>
                  </div>

                  {/* Incident Details Checklist */}
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <Building2 size={16} className="text-gray-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Site Location</p>
                        <p className="text-xs font-bold text-gray-800">{selectedIncident.site_name}</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Calendar size={16} className="text-gray-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Occurrence Date & Time</p>
                        <p className="text-xs font-bold text-gray-800">{formatDate(selectedIncident.occurred_at)}</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <User size={16} className="text-gray-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Reported By</p>
                        <p className="text-xs font-bold text-gray-800">
                          {selectedIncident.raised_by_name} <span className="text-gray-400">({selectedIncident.raised_by_id})</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Notes Block */}
                  <div className="space-y-2">
                    <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Original Observations</h4>
                    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-xs font-medium text-gray-700 leading-relaxed">
                      {selectedIncident.notes || "No notes supplied by the reporter."}
                    </div>
                  </div>

                  {/* Comments Timeline (Corrections & Adds - Read Only in Tracking Portal) */}
                  <div className="space-y-3">
                    <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Appended Logs & Comments ({selectedIncident.comments?.length || 0})</h4>
                    
                    {selectedIncident.comments && selectedIncident.comments.length > 0 ? (
                      <div className="relative pl-4 border-l border-gray-100 space-y-4 ml-1.5">
                        {selectedIncident.comments.map((cmt, idx) => (
                          <div key={idx} className="relative space-y-1.5">
                            {/* Timeline dot */}
                            <div className="absolute -left-[21.5px] top-1 w-2.5 h-2.5 rounded-full bg-gray-300 border-2 border-white" />
                            
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                cmt.type === "correction"
                                  ? "bg-red-50 text-red-600 border border-red-100"
                                  : "bg-blue-50 text-blue-600 border border-blue-100"
                              }`}>
                                {cmt.type === "correction" ? "Correction" : "Additional"}
                              </span>
                              <span className="text-[9px] font-mono text-gray-400">{formatDate(cmt.timestamp)}</span>
                            </div>

                            <p className="text-xs text-gray-700 font-medium leading-relaxed">
                              {cmt.comment_text}
                            </p>
                            
                            <div className="text-[9px] text-gray-400 font-semibold">
                              — {cmt.author_name} ({cmt.author_id})
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-400 italic bg-gray-50/50 p-3 rounded-xl border border-dashed border-gray-100 text-center">
                        No corrections or addition logs attached yet.
                      </div>
                    )}
                  </div>

                  {/* Resolved Archive Details */}
                  {selectedIncident.status === "RESOLVED" && (
                    <div className="border-t border-gray-100 pt-5 space-y-4">
                      <div className="bg-green-50/50 border border-green-100 rounded-2xl p-4 space-y-3">
                        <h4 className="text-xs font-black text-green-850 flex items-center gap-1.5">
                          <CheckCircle2 size={14} className="text-green-600" />
                          <span>Resolution Summary</span>
                        </h4>
                        
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                          <div>
                            <span className="text-gray-400 block">RECEIPT</span>
                            <span className="font-bold text-green-700">{selectedIncident.receipt_number}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block">RESOLVER</span>
                            <span className="font-bold text-gray-800">{selectedIncident.resolved_by_name} ({selectedIncident.resolved_by_id})</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block">CONTRACTOR</span>
                            <span className="font-bold text-gray-800">{selectedIncident.contractor_engaged}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block">IMPACT</span>
                            <span className="font-bold text-gray-800">{selectedIncident.impact}</span>
                          </div>
                        </div>

                        <div className="border-t border-green-100/60 pt-2 text-xs font-medium text-gray-700 leading-relaxed">
                          <span className="font-bold text-gray-500 block text-[9px] uppercase tracking-wider mb-0.5">Contractor Details</span>
                          {selectedIncident.resolution_details}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions (Only for Open Tickets - Sole Action is "Resolve Alert" in Tracking Portal) */}
                  {selectedIncident.status === "OPEN" && (
                    <div className="pt-2 shrink-0">
                      <button
                        onClick={handleStartResolution}
                        className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl text-xs uppercase tracking-wider shadow-md shadow-red-600/10 active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Check size={14} />
                        <span>Resolve Alert</span>
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Resolution Flow Overlay Form */}
              {isResolving && (
                <form onSubmit={handleSubmitResolution} className="space-y-5">
                  
                  {/* Soothing High-Contrast Gray Container */}
                  <div className="bg-gray-50 border border-gray-250 rounded-2xl p-4 space-y-1 shadow-sm">
                    <h3 className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                      <ShieldAlert size={14} className="text-red-500" />
                      <span>Resolution Clearance File</span>
                    </h3>
                    <p className="text-[10px] text-gray-600 font-medium leading-normal">
                      Provide strict contracting notes and metrics. This logs a permanent legal clearance receipt.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {/* Site Name (Read-only default) */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Site Name</label>
                      <input
                        type="text"
                        value="NTC ZM 0874"
                        disabled
                        className="w-full p-3.5 rounded-xl bg-gray-100 border border-gray-200 text-xs font-bold text-gray-500 cursor-not-allowed"
                      />
                    </div>

                    {/* Original Notes (Read-only reference) */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Original Report Context</label>
                      <div className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-[10px] font-semibold text-gray-500 max-h-20 overflow-y-auto leading-relaxed">
                        {selectedIncident.notes || "No original notes supplied."}
                      </div>
                    </div>

                    {/* Facility Impact (Textarea for free-text comments instead of dropdown options) */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Facility Operational Impact</label>
                      <textarea
                        rows={2.5}
                        value={resImpact}
                        onChange={(e) => setResImpact(e.target.value)}
                        placeholder="Type operational impact comments (e.g., NONE, NETWORK LOSS, DEGRADED REDUNDANCY)"
                        className="w-full p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-red-500 resize-none"
                        required
                      />
                    </div>

                    {/* Resolution Date/Time */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Resolution Datetime</label>
                      <input
                        type="datetime-local"
                        value={resResolvedAt}
                        onChange={(e) => setResResolvedAt(e.target.value)}
                        className="w-full p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-800 focus:outline-none focus:border-red-500"
                      />
                    </div>

                    {/* Contractor Engaged */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Contractor Engaged</label>
                      <input
                        type="text"
                        value={resContractor}
                        onChange={(e) => setResContractor(e.target.value)}
                        placeholder="e.g. Huawei Power Support, Cummins Engineers"
                        className="w-full p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-800 focus:outline-none focus:border-red-500"
                        required
                      />
                    </div>

                    {/* Resolution Details */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Resolution Actions Details</label>
                      <textarea
                        rows={4}
                        value={resDetails}
                        onChange={(e) => setResDetails(e.target.value)}
                        placeholder="Detail exact work done (e.g. Swapped phase contactor, refilled coolant, re-calibrated float valves)"
                        className="w-full p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-800 focus:outline-none focus:border-red-500 resize-none"
                        required
                      />
                    </div>
                  </div>

                  {/* Form Submission Actions */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsResolving(false)}
                      className="py-3.5 border border-gray-200 text-gray-600 font-bold rounded-2xl text-xs uppercase tracking-wider active:scale-98 transition-all cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingResolution}
                      className="py-3.5 bg-green-600 hover:bg-green-700 text-white font-black rounded-2xl text-xs uppercase tracking-wider active:scale-98 transition-all flex items-center justify-center gap-1 cursor-pointer shadow-md shadow-green-600/10"
                    >
                      {isSubmittingResolution ? "Dispatching..." : "Submit Resolution"}
                    </button>
                  </div>
                </form>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default IncidentTracker;
