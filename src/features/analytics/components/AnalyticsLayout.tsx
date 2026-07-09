import { NavLink, Outlet } from "react-router";
import { Zap, Fuel, Battery, ThermometerSnowflake, Activity } from "lucide-react";

const SUB_TABS = [
  { to: "/admin/analytics/grid", label: "Grid & Power", icon: Zap },
  { to: "/admin/analytics/fuel", label: "Generators & Fuel", icon: Fuel },
  { to: "/admin/analytics/ups", label: "UPS & DC Rectifiers", icon: Battery },
  { to: "/admin/analytics/thermal", label: "Thermal & HVAC", icon: ThermometerSnowflake },
  { to: "/admin/analytics/incidents", label: "Incident Lifecycle", icon: Activity },
] as const;

export function AnalyticsLayout() {
  return (
    <div className="space-y-6">
      {/* Sub Navigation Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Analytics Workspace</h1>
          <p className="text-xs text-gray-500 mt-1 font-medium">Cross-domain operations telemetry and reports audit.</p>
        </div>
        <nav className="flex flex-wrap gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {SUB_TABS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  "relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black transition-all select-none border border-transparent",
                  isActive
                    ? "bg-white border-white/40 text-gray-900 shadow-sm"
                    : "text-gray-400 hover:text-gray-700 hover:bg-white/35",
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
      </div>

      {/* Nested Route Content */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm min-h-[40vh] overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

export default AnalyticsLayout;
