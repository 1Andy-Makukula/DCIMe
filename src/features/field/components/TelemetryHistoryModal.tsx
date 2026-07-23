// src/features/field/components/TelemetryHistoryModal.tsx
import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Share2, Trash2, X, ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react';
import { HistoryRecord } from '../utils/whatsappReportFormatter';
import { toast } from 'sonner';

interface TelemetryHistoryModalProps {
  isOpen: boolean;
  history: HistoryRecord[];
  onClose: () => void;
  onUpdateHistory: (updated: HistoryRecord[]) => void;
}

export const TelemetryHistoryModal = ({
  isOpen,
  history,
  onClose,
  onUpdateHistory,
}: TelemetryHistoryModalProps) => {
  // Group records by Date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, HistoryRecord[]> = {};
    history.forEach((record) => {
      const d = record.date || "Unknown Date";
      if (!groups[d]) groups[d] = [];
      groups[d].push(record);
    });
    // Sort records within each date by hour ascending (00:00 → 23:00)
    Object.keys(groups).forEach((d) => {
      groups[d].sort((a, b) => (a.hour || '').localeCompare(b.hour || ''));
    });
    return groups;
  }, [history]);

  // Newest date first
  const uniqueDates = useMemo(() =>
    Object.keys(groupedByDate).sort((a, b) => {
      const da = new Date(a).getTime();
      const db = new Date(b).getTime();
      if (!isNaN(da) && !isNaN(db)) return db - da;
      return b.localeCompare(a); // fallback for non-parseable strings
    }),
  [groupedByDate]);

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedHourIndex, setSelectedHourIndex] = useState<number>(0);
  const [touchStartX, setTouchStartX] = useState(0);

  // Sync selectedDate when history opens or updates
  useEffect(() => {
    if (uniqueDates.length > 0) {
      if (!selectedDate || !uniqueDates.includes(selectedDate)) {
        setSelectedDate(uniqueDates[0]);
        setSelectedHourIndex(0);
      }
    } else {
      setSelectedDate('');
      setSelectedHourIndex(0);
    }
  }, [uniqueDates, selectedDate]);

  if (!isOpen) return null;

  const recordsForSelectedDate = groupedByDate[selectedDate] || [];
  const currentRecord = recordsForSelectedDate[selectedHourIndex] || null;

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedHourIndex(0);
  };

  return createPortal(
    <div className="dcime-modal-overlay" onClick={onClose}>
      <div className="dcime-history-fullscreen-container" onClick={(e) => e.stopPropagation()}>
        {/* Header Bar */}
        <div className="dcime-history-topbar">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 text-cyan-400 flex items-center justify-center font-bold text-xs border border-cyan-500/30">
              {recordsForSelectedDate.length > 0 ? selectedHourIndex + 1 : 0}
            </div>
            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-wider">
                {selectedDate || "Telemetry History"}
              </h4>
              <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5 mt-0.5">
                <Clock size={11} className="text-cyan-400" />
                <span>
                  {recordsForSelectedDate.length > 0
                    ? `Hour ${selectedHourIndex + 1} of ${recordsForSelectedDate.length} logged — Target: ${currentRecord?.hour || ""}`
                    : "No saved logs for this date"}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentRecord && (
              <>
                <button
                  type="button"
                  className="dcime-topbar-action-btn"
                  title="Copy this hour's report"
                  onClick={() => {
                    if (currentRecord?.text) {
                      navigator.clipboard.writeText(currentRecord.text);
                      toast.success("Report copied to clipboard!");
                    }
                  }}
                >
                  <Copy size={14} />
                  <span className="hidden sm:inline">Copy</span>
                </button>
                <button
                  type="button"
                  className="dcime-topbar-action-btn share"
                  title="Send this hour to WhatsApp"
                  onClick={() => {
                    if (currentRecord?.text) {
                      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(currentRecord.text)}`;
                      window.open(waUrl, '_blank');
                    }
                  }}
                >
                  <Share2 size={14} />
                  <span className="hidden sm:inline">WhatsApp</span>
                </button>
                <button
                  type="button"
                  className="dcime-topbar-action-btn delete"
                  title="Delete this hour's log"
                  onClick={() => {
                    const updated = history.filter((r) => r !== currentRecord);
                    onUpdateHistory(updated);
                    toast.success("Hour log deleted.");
                    if (selectedHourIndex >= recordsForSelectedDate.length - 1 && selectedHourIndex > 0) {
                      setSelectedHourIndex((prev) => prev - 1);
                    }
                  }}
                >
                  <Trash2 size={14} />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors outline-none border border-slate-700"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Date Selector Navigation Bar */}
        {uniqueDates.length > 0 && (
          <div className="dcime-date-selector-bar">
            <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1 pr-1 border-r border-slate-800 shrink-0">
                <Calendar size={12} className="text-slate-400" />
                Date:
              </span>
              {uniqueDates.map((date) => {
                const isActive = date === selectedDate;
                const count = groupedByDate[date]?.length || 0;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => handleSelectDate(date)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? "bg-cyan-500 text-slate-950 font-black shadow-lg shadow-cyan-500/20 border border-cyan-400"
                        : "bg-slate-900/90 text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-800"
                    }`}
                  >
                    <span>{date}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-slate-950/20 text-slate-900 font-extrabold' : 'bg-slate-800 text-slate-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Hour Selector Bar for Selected Date */}
        {recordsForSelectedDate.length > 0 && (
          <div className="dcime-hour-selector-bar">
            <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1 pr-1 border-r border-slate-800 shrink-0">
                <Clock size={12} className="text-slate-400" />
                Hours:
              </span>
              {recordsForSelectedDate.map((rec, idx) => {
                const isActive = idx === selectedHourIndex;
                return (
                  <button
                    key={`${rec.hour}_${idx}`}
                    type="button"
                    onClick={() => setSelectedHourIndex(idx)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all shrink-0 cursor-pointer ${
                      isActive
                        ? "bg-cyan-400/20 text-cyan-300 border border-cyan-500/50 shadow-sm"
                        : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800/80"
                    }`}
                  >
                    {rec.hour}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Full Page Viewport */}
        <div
          className="dcime-history-page-viewport"
          onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            const touchEndX = e.changedTouches[0].clientX;
            const diff = touchStartX - touchEndX;
            if (diff > 50 && selectedHourIndex < recordsForSelectedDate.length - 1) {
              // Swipe Left -> Next Hour in current date
              setSelectedHourIndex((prev) => prev + 1);
            } else if (diff < -50 && selectedHourIndex > 0) {
              // Swipe Right -> Prev Hour in current date
              setSelectedHourIndex((prev) => prev - 1);
            }
          }}
        >
          {recordsForSelectedDate.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600">
                <Share2 size={24} />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">No telemetry logs recorded for this date.</p>
            </div>
          ) : (
            <div className="dcime-history-page-card">
              <div className="dcime-history-page-meta">
                <span className="font-mono text-cyan-400 font-bold">
                  TARGET SHIFT: {currentRecord?.hour} | DATE: {currentRecord?.date}
                </span>
                <span className="text-slate-500 font-sans text-[10px]">
                  SAVED: {new Date(currentRecord?.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <pre className="dcime-history-page-text">
                {currentRecord?.text}
              </pre>
            </div>
          )}

          {/* Navigation Side Arrows for hours within selected date */}
          {selectedHourIndex > 0 && (
            <button
              type="button"
              className="dcime-nav-arrow left"
              onClick={() => setSelectedHourIndex((prev) => Math.max(0, prev - 1))}
              title="Previous Hour"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {selectedHourIndex < recordsForSelectedDate.length - 1 && (
            <button
              type="button"
              className="dcime-nav-arrow right"
              onClick={() => setSelectedHourIndex((prev) => Math.min(recordsForSelectedDate.length - 1, prev + 1))}
              title="Next Hour"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
