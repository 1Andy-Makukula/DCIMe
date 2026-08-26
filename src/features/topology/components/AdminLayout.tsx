import { useEffect, useState } from "react";
import { Wordmark } from "@/shared/ui";
import { NavLink, Outlet, useNavigate } from "react-router";
import {
  LayoutGrid,
  List,
  AlertTriangle,
  FileText,
  Users,
  LogOut,
  Menu,
  X,
  BarChart2,
  Network,
  Building2,
  Upload,
  Wrench,
} from "lucide-react";
import { BrandMark, NavMenu } from "@/shared/ui";
import { useAuth } from "@/shared/context/AuthContext";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { NotificationBell } from "./NotificationBell";

// ── Nav tab definition ────────────────────────────────────────────────────────
// ORDER IS THE UI. The first INLINE_TABS entries sit on the header bar; the
// rest collapse into the floating panel. So the four an admin opens daily —
// the watching pages — lead, and the managing pages follow.
const INLINE_TABS = 4;

const NAV_TABS = [
  { to: "/admin",            label: "Overview",   icon: LayoutGrid,    end: true,
    hint: "Live site state and data flow" },
  { to: "/admin/topology",   label: "Topology",   icon: Network,       end: false,
    hint: "Power single line and failure simulation" },
  { to: "/admin/alerts",     label: "Alerts",     icon: AlertTriangle, end: false,
    hint: "Incidents and open work" },
  { to: "/admin/jobs",       label: "Jobs",       icon: Wrench,        end: false,
    hint: "Raise, assign and close work orders" },
  // ── overflow ──
  { to: "/admin/analytics",  label: "Analytics",  icon: BarChart2,     end: false,
    hint: "PUE, capacity and service performance" },
  { to: "/admin/inventory",  label: "Inventory",  icon: List,          end: false,
    hint: "Equipment, parameters and maintenance" },
  { to: "/admin/reports",    label: "Reports",    icon: FileText,      end: false,
    hint: "Shift handovers and exports" },
  { to: "/admin/personnel",  label: "Personnel",  icon: Users,         end: false,
    hint: "Technicians, roles and access" },
  { to: "/admin/vendors",    label: "Vendors",    icon: Building2,     end: false,
    hint: "Contractors, visits and findings" },
  { to: "/admin/import",     label: "Import",     icon: Upload,        end: false,
    hint: "Commission a site from a spreadsheet" },
] as const;

// ── AdminLayout ───────────────────────────────────────────────────────────────
export function AdminLayout() {
  const navigate = useNavigate();
  const { employee, logout, isLoading, isOfflineFallback } = useAuth();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { currentSite } = useCurrentSite();

  useEffect(() => {
    if (!isLoading && !isOfflineFallback && (!employee || employee.role !== "ADMIN")) {
      navigate("/");
    }
  }, [employee, isLoading, isOfflineFallback, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  // Hold the loading screen until the role is confirmed against the LIVE
  // database — never render the admin shell (or fire its data loads) for
  // an unverified user, even for a frame.
  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-neutral-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Verifying Admin Clearance...</span>
        </div>
      </div>
    );
  }

  // The profile on screen came from the local cache because the network is
  // down. Cached data is display-only: it must NEVER unlock admin screens
  // (a revoked/demoted user could otherwise ride the cache for days).
  if (isOfflineFallback) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-neutral-50 p-6">
        <div className="max-w-sm text-center flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-warn-50 border border-warn-200 flex items-center justify-center">
            <AlertTriangle size={26} className="text-warn-500" />
          </div>
          <div>
            <h2 className="text-[15px] font-black text-neutral-900 uppercase tracking-tight">You're Offline</h2>
            <p className="text-[12px] font-semibold text-neutral-500 mt-2 leading-relaxed">
              The Admin Portal requires a live connection to verify your clearance.
              Reconnect to the network and try again.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-5 py-2.5 rounded-xl bg-neutral-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-neutral-700 transition-all cursor-pointer"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // Role confirmed non-admin: the effect above is already navigating away.
  // Render nothing rather than flashing the dashboard.
  if (!employee || employee.role !== "ADMIN") {
    return null;
  }


  const name = employee?.full_name || "Admin User";
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.substring(0, 2).toUpperCase();

  return (
    <div className="h-screen print:h-auto flex flex-col bg-white overflow-hidden print:overflow-visible relative">
      {/* print:h-auto/print:overflow-visible above undo the fixed-viewport app
          shell for print — h-screen + overflow-hidden clips anything taller
          than one screen, which silently capped every multi-page print flow
          in the admin area to a single page (Chrome's print dialog reports
          "limit is 1" when this happens: the content genuinely doesn't exist
          beyond the clip, so there's nothing to paginate). Zero effect
          on-screen, since the override only applies inside @media print. */}
      {/* ── Fixed Header ─────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 z-10 border-b border-neutral-100 bg-white print:hidden">
        <div className="flex items-center justify-between px-5 py-2.5">

          {/* Left: Hamburger + Logo */}
          <div className="flex items-center gap-2">
            {/* Hamburger menu for mobile */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-xl text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-all cursor-pointer"
              aria-label="Open Menu"
            >
              <Menu size={20} />
            </button>

            <div className="flex items-center gap-2.5">
              <BrandMark size={32} />
              <div className="flex flex-col">
                <span className="font-black text-[14px] leading-none text-neutral-900 tracking-tight">
                  <Wordmark />
                </span>
                <span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest leading-none mt-1">
                  Admin Portal
                </span>
              </div>
            </div>
          </div>

          {/* Middle: the daily pages inline, the rest behind "More". Nine tabs
              no longer fit between the logo and the profile controls, and every
              new section made it worse — this bar's width is now fixed. */}
          <div className="hidden lg:block">
            <NavMenu
              items={[...NAV_TABS]}
              inlineCount={INLINE_TABS}
              title="Admin Portal"
            />
          </div>

          {/* Right: Bell + Logout (Desktop Only) + Avatar */}
          <div className="flex items-center gap-2">
            {currentSite && (
              <span className="hidden sm:inline-block px-3 py-1 bg-brand-50 text-brand-600 rounded-full text-[10px] font-black uppercase tracking-wider border border-brand-100 mr-2">
                {currentSite.site_name}
              </span>
            )}
            {/* Bell — live activity feed, routes to the relevant page on click */}
            <NotificationBell />

            {/* Logout (Desktop Only) */}
            <button
              onClick={handleLogout}
              className="hidden lg:flex items-center gap-1.5 text-[11px] font-bold text-neutral-400 hover:text-brand-500 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 transition-all cursor-pointer"
              aria-label="Logout"
            >
              <LogOut size={13} />
              <span>Logout</span>
            </button>

            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
              style={{ backgroundColor: "var(--color-brand-600)" }}
              title={name}
            >
              {initials}
            </div>
          </div>
        </div>
      </header>

      {/* ── Mobile Sidebar Drawer (Overlay + Drawer Panel) ────────────────── */}
      {/* Overlay Background */}
      {isDrawerOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden transition-opacity duration-300"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}

      {/* Slide-out Drawer Panel */}
      <div 
        className={`fixed top-0 left-0 bottom-0 z-50 w-64 max-w-[80vw] bg-white/70 backdrop-blur-xl border-r border-white/30 shadow-2xl flex flex-col transition-transform duration-300 ease-out lg:hidden ${
          isDrawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100/50 bg-white/50">
          <div className="flex items-center gap-2.5">
            <BrandMark size={28} />
            <div className="flex flex-col">
              <span className="font-black text-[13px] text-neutral-900 tracking-tight leading-none">
                <Wordmark accentClassName="text-brand-500 font-black" />
              </span>
              {currentSite && (
                <span className="text-[9px] font-bold text-brand-600 mt-1.5 uppercase tracking-wider leading-none">
                  {currentSite.site_name}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Drawer Navigation Links */}
        <nav className="p-4 flex flex-col gap-1.5 overflow-y-auto flex-1 bg-white/30">
          {NAV_TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setIsDrawerOpen(false)}
              className={({ isActive }) =>
                [
                  "relative flex items-center gap-3 px-4 py-3 rounded-xl text-[12px] font-black transition-all select-none border border-transparent",
                  isActive
                    ? "bg-white/60 border-white/40 text-neutral-900 shadow-sm backdrop-blur-md"
                    : "text-neutral-400 hover:text-neutral-700 hover:bg-white/35",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={16}
                    className={isActive ? "text-brand-500" : ""}
                  />
                  <span className="uppercase tracking-wider">
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Drawer Footer with Logout */}
        <div className="p-4 border-t border-neutral-100/50 bg-white/50 mt-auto">
          <div className="flex items-center gap-2.5 mb-4 px-1.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 bg-brand-500">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider leading-none">Session Operator</p>
              <p className="font-bold text-xs text-neutral-800 truncate mt-1 leading-none">{name}</p>
            </div>
          </div>

          <button
            onClick={() => { setIsDrawerOpen(false); handleLogout(); }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-50/70 border border-brand-200/50 text-brand-600 hover:bg-brand-50 text-xs font-black uppercase tracking-wider transition-all active:scale-[0.97] cursor-pointer shadow-xs"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* ── Scrollable Viewport ───────────────────────────────────────────── */}
      {/* print:overflow-visible — same reasoning as the root shell: flex-1's
          height is derived from the (now print:h-auto) parent, but this
          element's own overflow-y-auto would still clip on its own if left
          unset. print:p-0 avoids doubling up padding on top of whatever the
          printed page itself already applies. */}
      <main className="flex-1 overflow-y-auto print:overflow-visible bg-neutral-50/30 p-6 md:p-8 print:p-0">
        <Outlet />
      </main>
    </div>
  );
}
