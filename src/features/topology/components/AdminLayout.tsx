import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import {
  LayoutGrid,
  List,
  AlertTriangle,
  FileText,
  Users,
  Bell,
  LogOut,
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
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* ── Fixed Header ─────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 z-10 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between px-5 py-2.5">

          {/* Left: Logo */}
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

          {/* Middle: Nav tabs */}
          <nav className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
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
                    <span className="hidden sm:inline uppercase tracking-wide">
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Right: Bell + Logout */}
          <div className="flex items-center gap-2">
            {/* Bell */}
            <button
              className="relative p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
              aria-label="Notifications"
            >
              <Bell size={16} />
              {/* Active alert badge */}
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-all"
              aria-label="Logout"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Logout</span>
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

      {/* ── Scrollable Viewport ───────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-gray-50/30 p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
