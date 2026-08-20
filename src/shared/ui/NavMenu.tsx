import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { ChevronDown, ChevronRight, LayoutList, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Navigation: a few tabs on the bar, the rest behind "More".
//
// The header held a tab per section. That works at five and breaks at nine —
// the pill grew wider than the space between the logo and the profile controls,
// and every future section makes it worse.
//
// Collapsing ALL of them behind one control fixes the width but taxes the pages
// people live on. So the first few stay inline and the remainder overflow into
// a floating panel, where there is room to describe each destination rather
// than abbreviate it to a word. The bar's width is now fixed no matter how many
// sections the platform grows.
// ─────────────────────────────────────────────────────────────────────────────

export interface NavMenuItem {
  to:     string;
  label:  string;
  icon:   LucideIcon;
  end?:   boolean;
  /** One line on the panel, explaining the destination. */
  hint?:  string;
}

export interface NavMenuProps {
  items: NavMenuItem[];
  /** Shown above the items, e.g. "Admin Portal". */
  title?: string;
  /**
   * How many destinations stay visible on the bar before the rest collapse.
   *
   * Hiding everything behind one control costs a click on the pages people use
   * constantly. Keeping the first few inline and overflowing the remainder is
   * the balance: the bar stops growing, but the common route stays one click.
   */
  inlineCount?: number;
  className?: string;
}

export function NavMenu({
  items, title = "Navigate", inlineCount = 4, className = ""
}: NavMenuProps) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const panelRef  = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Longest matching path wins, so "/admin/analytics/fuel" resolves to
  // Analytics rather than to Overview, whose "/admin" is also a prefix.
  const current =
    items
      .filter(i => (i.end ? pathname === i.to : pathname.startsWith(i.to)))
      .sort((a, b) => b.to.length - a.to.length)[0] ?? items[0];

  // Navigating closes the panel. Without this it stays open over the new page,
  // because the click that navigated never reached the outside-click handler.
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    };
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    // Capture phase: a stopPropagation() deeper in the tree would otherwise
    // leave the panel stuck open.
    document.addEventListener("mousedown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer, true);
    };
  }, [open]);

  const inline   = items.slice(0, inlineCount);
  const overflow = items.slice(inlineCount);
  // The overflow control shows the current page's name when that page lives
  // inside it — otherwise the bar would give no clue where you are.
  const currentInOverflow = overflow.some(i => i.to === current?.to);
  const CurrentIcon = current?.icon;

  return (
    <div className={`relative flex items-center gap-1 rounded-2xl bg-gray-100/80 p-1 ${className}`}>
      {/* The everyday destinations, still one click away. */}
      {inline.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            [
              "flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-wide transition-all select-none",
              isActive
                ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-900/5"
                : "text-gray-400 hover:bg-white/60 hover:text-gray-600"
            ].join(" ")
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={14} className={isActive ? "text-brand-500" : ""} />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}

      {overflow.length > 0 && (
        <>
          <span className="mx-0.5 h-5 w-px bg-gray-300/70" aria-hidden="true" />

          <button
            ref={buttonRef}
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-haspopup="menu"
            className={[
              "flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-wide transition-all select-none",
              open || currentInOverflow
                ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-900/5"
                : "text-gray-400 hover:bg-white/60 hover:text-gray-600"
            ].join(" ")}
          >
            {currentInOverflow && CurrentIcon
              ? <CurrentIcon size={14} className="text-brand-500" />
              : <LayoutList size={14} />}
            <span>{currentInOverflow ? current!.label : "More"}</span>
            <ChevronDown
              size={12}
              className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </button>
        </>
      )}

      {open && (
        <>
          <div
            className="fixed inset-0 z-[var(--z-popover-backdrop)] bg-slate-900/20 backdrop-blur-[3px] pointer-events-none"
            aria-hidden="true"
          />

          <div
            ref={panelRef}
            role="menu"
            aria-label={title}
            className={[
              "absolute right-0 top-full z-[var(--z-popover)] mt-2.5 w-[min(30rem,calc(100vw-2rem))]",
              // The glass. A near-white translucent ground with a saturating
              // blur, a bright top edge and a deep shadow: without the edge and
              // the saturation it reads as a plain grey box with a blur filter.
              "overflow-hidden rounded-3xl border border-white/70",
              "bg-gradient-to-b from-white/90 to-white/70",
              "backdrop-blur-2xl backdrop-saturate-150",
              "shadow-[0_30px_80px_-16px_rgba(15,23,42,0.45)]",
              "ring-1 ring-slate-900/5",
              "origin-top-right animate-[navmenu-in_150ms_cubic-bezier(0.16,1,0.3,1)]"
            ].join(" ")}
          >
            <style>{`
              @keyframes navmenu-in {
                from { opacity: 0; transform: translateY(-8px) scale(0.96); }
                to   { opacity: 1; transform: translateY(0) scale(1); }
              }
              @media (prefers-reduced-motion: reduce) {
                [class*="animate-[navmenu-in"] { animation: none !important; }
              }
            `}</style>

            {/* A specular highlight along the top edge. This is the detail that
                separates glass from a translucent rectangle. */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
              aria-hidden="true"
            />

            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
                {title}
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-900/5 hover:text-slate-700"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex flex-col gap-0.5 p-2.5 pt-1">
              {overflow.map(({ to, label, icon: Icon, end, hint }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  role="menuitem"
                  className={({ isActive }) =>
                    [
                      "group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all",
                      isActive
                        ? "bg-white shadow-sm ring-1 ring-slate-900/5"
                        : "hover:bg-white/80"
                    ].join(" ")
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={[
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                          isActive
                            ? "bg-brand-500 text-white shadow-sm shadow-brand-500/25"
                            : "bg-slate-900/[0.04] text-slate-400 group-hover:bg-slate-900/[0.07] group-hover:text-slate-600"
                        ].join(" ")}
                      >
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={[
                            "block text-[12px] font-black uppercase tracking-wide",
                            isActive ? "text-slate-900" : "text-slate-700"
                          ].join(" ")}
                        >
                          {label}
                        </span>
                        {hint && (
                          <span className="mt-0.5 block truncate text-[10.5px] leading-snug text-slate-400">
                            {hint}
                          </span>
                        )}
                      </span>
                      <ChevronRight
                        size={14}
                        className="shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
