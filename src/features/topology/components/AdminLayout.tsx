import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import {
  LayoutGrid,
  List,
  AlertTriangle,
  FileText,
  Users,
  Bell,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { AirtelMark } from "@/shared/ui";
import { useAuth } from "@/shared/context/AuthContext";

// ── Nav tab definition ────────────────────────────────────────────────────────
const NAV_TABS = [
  { to: "/admin",            label: "Overview",   icon: LayoutGrid,    end: true  },
  { to: "/admin/inventory",  label: "Inventory",  icon: List,          end: false },
  { to: "/admin/alerts",     label: "Alerts",     icon: AlertTriangle, end: false },
  { to: "/admin/reports",    label: "Reports",    icon: FileText,      end: false },
  { to: "/admin/personnel",  label: "Personnel",  icon: Users,         end: false },
] as const;

// ── AdminLayout ───────────────────────────────────────────────────────────────
export function AdminLayout() {
  const navigate = useNavigate();
  const { employee, logout, isLoading } = useAuth();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && (!employee || employee.role !== "ADMIN")) {
      navigate("/");
    }
  }, [employee, isLoading, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Loading Admin Session...</span>
        </div>
      </div>
    );
  }

  const name = employee?.full_name || "Admin User";
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.substring(0, 2).toUpperCase();

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden relative">
      {/* ── Fixed Header ─────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 z-10 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between px-5 py-2.5">

          {/* Left: Hamburger + Logo */}
          <div className="flex items-center gap-2">
            {/* Hamburger menu for mobile */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all cursor-pointer"
              aria-label="Open Menu"
            >
              <Menu size={20} />
            </button>

            <div className="flex items-center gap-2.5">
              <AirtelMark size={32} />
              <div className="flex flex-col">
                <span className="font-black text-[14px] leading-none text-gray-900 tracking-tight">
                  DCIMe<span className="text-red-500">_Engine</span>
                </span>
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mt-1">
                  Admin Portal
                </span>
              </div>
            </div>
          </div>

          {/* Middle: Nav tabs (Desktop Only) */}
          <nav className="hidden lg:flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {NAV_TABS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    "relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black transition-all select-none",
                    isActive
                      ? "bg-white border border-gray-200 text-gray-900 shadow-sm"
                      : "text-gray-400 hover:text-gray-600 hover:bg-white/50",
                  ].join(" ")
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={14}
                      className={isActive ? "text-red-500" : ""}
                    />
                    <span className="uppercase tracking-wide">
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Right: Bell + Logout (Desktop Only) + Avatar */}
          <div className="flex items-center gap-2">
            {/* Bell */}
            <button
              className="relative p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all cursor-pointer"
              aria-label="Notifications"
            >
              <Bell size={16} />
              {/* Active alert badge */}
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>

            {/* Logout (Desktop Only) */}
            <button
              onClick={handleLogout}
              className="hidden lg:flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-all cursor-pointer"
              aria-label="Logout"
            >
              <LogOut size={13} />
              <span>Logout</span>
            </button>

            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
              style={{ backgroundColor: "#FF0000" }}
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100/50 bg-white/50">
          <div className="flex items-center gap-2.5">
            <AirtelMark size={28} />
            <span className="font-black text-[13px] text-gray-900 tracking-tight">
              DCIMe<span className="text-red-505 font-black">_Engine</span>
            </span>
          </div>
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="p-1.5 rounded-xl text-gray-400 hover:text-gray-800 hover:bg-gray-100 transition-all cursor-pointer"
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
                    ? "bg-white/60 border-white/40 text-gray-900 shadow-sm backdrop-blur-md"
                    : "text-gray-400 hover:text-gray-700 hover:bg-white/35",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={16}
                    className={isActive ? "text-red-500" : ""}
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
        <div className="p-4 border-t border-gray-100/50 bg-white/50 mt-auto">
          <div className="flex items-center gap-2.5 mb-4 px-1.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 bg-red-500">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider leading-none">Session Operator</p>
              <p className="font-bold text-xs text-gray-800 truncate mt-1 leading-none">{name}</p>
            </div>
          </div>

          <button
            onClick={() => { setIsDrawerOpen(false); handleLogout(); }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50/70 border border-red-200/50 text-red-600 hover:bg-red-50 text-xs font-black uppercase tracking-wider transition-all active:scale-[0.97] cursor-pointer shadow-xs"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* ── Scrollable Viewport ───────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-gray-50/30 p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
