import { NavLink, Outlet, useLocation } from "react-router";
import { FileText, Zap, Fuel, Battery, ThermometerSnowflake, Activity, Gauge, Users, Boxes } from "lucide-react";
import { DateRangePicker } from "@/shared/ui";
import { useDateRange } from "@/shared/utils/useDateRange";

export interface AnalyticsOutletContext {
  range: ReturnType<typeof useDateRange>["range"];
}

const SUB_TABS = [
  { to: "/admin/analytics/summary", label: "Executive Summary", icon: FileText },
  // Second deliberately: the tab somebody reaches for when they do not yet know
  // which of the subject tabs would explain what they are seeing.
  { to: "/admin/analytics/facility", label: "Facility", icon: Boxes },
  { to: "/admin/analytics/grid", label: "Grid & Power", icon: Zap },
  { to: "/admin/analytics/fuel", label: "Generators & Fuel", icon: Fuel },
  { to: "/admin/analytics/ups", label: "UPS & DC Rectifiers", icon: Battery },
  { to: "/admin/analytics/thermal", label: "Thermal & HVAC", icon: ThermometerSnowflake },
  { to: "/admin/analytics/capacity", label: "Capacity & N+1", icon: Gauge },
  { to: "/admin/analytics/incidents", label: "Incident Lifecycle", icon: Activity },
  { to: "/admin/analytics/technicians", label: "Technicians", icon: Users },
] as const;

export function AnalyticsLayout() {
  // Lifted here rather than into each chart page: the period picker must be
  // shared across Grid/Fuel/UPS/Thermal/Incidents, or switching tabs would
  // silently reset "This Month" back to whatever each page's own default was.
  const { range, preset, setPreset, setCustomRange } = useDateRange("30d");
  const location = useLocation();
  // The Executive Summary (brief and full-detail versions) is deliberately
  // always "today vs. yesterday/week/month" — the ad-hoc browse range doesn't
  // apply to it, so showing the picker there would imply a control that
  // silently does nothing.
  const isSummaryTab = location.pathname.includes("/summary");

  return (
    <div className="space-y-6">
      {/* Sub Navigation Bar — real display:none in print (not the
          visibility:hidden trick), so it doesn't leave a blank reserved gap
          at the top of a printed report. */}
      <div className="print:hidden flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-100 pb-4">
        <div>
          <h1 className="text-xl font-black text-neutral-900 tracking-tight">Analytics Workspace</h1>
          <p className="text-xs text-neutral-500 mt-1 font-medium">Cross-domain operations telemetry and reports audit.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex flex-wrap gap-1 bg-neutral-100 rounded-xl p-1 w-fit">
            {SUB_TABS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  [
                    "relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black transition-all select-none border border-transparent",
                    isActive
                      ? "bg-white border-white/40 text-neutral-900 shadow-sm"
                      : "text-neutral-400 hover:text-neutral-700 hover:bg-white/35",
                  ].join(" ")
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={14}
                      className={isActive ? "text-brand-500" : ""}
                    />
                    <span className="uppercase tracking-wide">
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          {!isSummaryTab && (
            <DateRangePicker
              label={range.label}
              preset={preset}
              activeStart={range.start}
              activeEnd={range.end}
              onSelectPreset={setPreset}
              onSelectCustom={setCustomRange}
            />
          )}
        </div>
      </div>

      {/* Nested Route Content — every chart page reads `range` via
          useOutletContext<AnalyticsOutletContext>() so the whole workspace
          stays on one selected period. */}
      <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm min-h-[40vh] overflow-hidden print:overflow-visible print:border-0 print:shadow-none print:rounded-none">
        <Outlet context={{ range } satisfies AnalyticsOutletContext} />
      </div>
    </div>
  );
}

export default AnalyticsLayout;
