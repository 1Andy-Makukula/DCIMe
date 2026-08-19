// src/features/topology/components/NotificationBell.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, CheckCheck } from "lucide-react";
import { useNotifications, notificationMeta, AppNotification } from "../hooks/useNotifications";

const TONE_STYLES: Record<string, string> = {
  red:   "bg-danger-50 text-danger-600 border-danger-100",
  green: "bg-ok-50 text-ok-700 border-ok-100",
  amber: "bg-warn-50 text-warn-700 border-warn-100",
  blue:  "bg-info-50 text-info-700 border-info-100",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};

/** Compact relative time — "now", "14m", "3h", "2d", then a date. */
const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diffMin = Math.floor((Date.now() - then) / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, isRead, markRead, markAllRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — a dropdown pinned open over the
  // whole admin shell is worse than no dropdown.
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (n: AppNotification) => {
    markRead(n.id);
    setIsOpen(false);
    navigate(n.href);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="relative p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all cursor-pointer"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={isOpen}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-brand-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-[min(92vw,22rem)] bg-white border border-gray-200 rounded-2xl shadow-xl z-[9999] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <p className="text-[11px] font-black text-gray-900 uppercase tracking-wider">Activity</p>
              <p className="text-[10px] font-semibold text-gray-400">
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-brand-600 hover:text-brand-700 cursor-pointer"
              >
                <CheckCheck size={12} />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                Loading activity…
              </p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                No recent activity
              </p>
            ) : (
              notifications.map((n) => {
                const meta = notificationMeta(n.kind);
                const unread = !isRead(n.id);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleSelect(n)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer flex gap-3 ${
                      unread ? "bg-brand-50/20" : ""
                    }`}
                  >
                    <span
                      className={`shrink-0 mt-0.5 h-fit text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        TONE_STYLES[meta.tone] || TONE_STYLES.slate
                      }`}
                    >
                      {meta.label}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-black text-gray-900 truncate">{n.title}</span>
                        <span className="text-[9px] font-bold text-gray-400 font-mono shrink-0">
                          {relativeTime(n.timestamp)}
                        </span>
                      </span>
                      <span className="block text-[10px] font-semibold text-gray-500 truncate mt-0.5">
                        {n.detail}
                      </span>
                    </span>
                    {unread && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
