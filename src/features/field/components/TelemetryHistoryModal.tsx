// src/features/field/components/TelemetryHistoryModal.tsx
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Share2, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [activeHistoryIndex, setActiveHistoryIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState(0);

  if (!isOpen) return null;

  const currentRecord = history[activeHistoryIndex];

  return createPortal(
    <div className="dcime-modal-overlay" onClick={onClose}>
      <div className="dcime-history-fullscreen-container" onClick={(e) => e.stopPropagation()}>
        {/* Header Bar */}
        <div className="dcime-history-topbar">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 text-cyan-400 flex items-center justify-center font-bold text-xs">
              {history.length > 0 ? activeHistoryIndex + 1 : 0}
            </div>
            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-wider">
                {currentRecord?.date || "Telemetry History"}
              </h4>
              <p className="text-[10px] text-slate-400 font-medium">
                {history.length > 0
                  ? `Hour ${activeHistoryIndex + 1} of ${history.length} — Target: ${currentRecord?.hour || ""}`
                  : "No saved logs"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {history.length > 0 && (
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
                    const updated = history.filter((_, i) => i !== activeHistoryIndex);
                    onUpdateHistory(updated);
                    toast.success("Hour log deleted.");
                    if (activeHistoryIndex >= updated.length && updated.length > 0) {
                      setActiveHistoryIndex(updated.length - 1);
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
              className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors outline-none"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Main Full Page Carousel View */}
        <div
          className="dcime-history-page-viewport"
          onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            const touchEndX = e.changedTouches[0].clientX;
            const diff = touchStartX - touchEndX;
            if (diff > 50 && activeHistoryIndex < history.length - 1) {
              // Swipe Left -> Next Hour
              setActiveHistoryIndex((prev) => prev + 1);
            } else if (diff < -50 && activeHistoryIndex > 0) {
              // Swipe Right -> Prev Hour
              setActiveHistoryIndex((prev) => prev - 1);
            }
          }}
        >
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600">
                <Share2 size={24} />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">No telemetry logs recorded yet.</p>
            </div>
          ) : (
            <div className="dcime-history-page-card">
              <div className="dcime-history-page-meta">
                <span className="font-mono text-cyan-400 font-bold">
                  RECORDED AT: {currentRecord?.hour} | {currentRecord?.date}
                </span>
                <span className="text-slate-500 font-sans text-[10px]">
                  SENT: {new Date(currentRecord?.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <pre className="dcime-history-page-text">
                {currentRecord?.text}
              </pre>
            </div>
          )}

          {/* Navigation Side Arrows */}
          {activeHistoryIndex > 0 && (
            <button
              type="button"
              className="dcime-nav-arrow left"
              onClick={() => setActiveHistoryIndex((prev) => Math.max(0, prev - 1))}
              title="Previous Hour"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {activeHistoryIndex < history.length - 1 && (
            <button
              type="button"
              className="dcime-nav-arrow right"
              onClick={() => setActiveHistoryIndex((prev) => Math.min(history.length - 1, prev + 1))}
              title="Next Hour"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>

        {/* Bottom Dots Navigation Bar */}
        {history.length > 1 && (
          <div className="dcime-history-dots-bar">
            {history.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveHistoryIndex(idx)}
                className={`dcime-dot ${idx === activeHistoryIndex ? 'active' : ''}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
