import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from "react-router";
import { AuthProvider } from "@/shared/context/AuthContext";
import { SiteProvider } from "@/shared/context/SiteContext";
import { ShiftProvider } from "@/shared/context/ShiftContext";
import { Toaster } from "./components/ui/sonner";

// Pages
import LoginPage from "@/pages/LoginPage";
import AnalyticsPage from "@/pages/AnalyticsPage";

// Tech shell + views
import { TechLayout } from "@/features/field/components/TechLayout";
import { TechDashboard } from "@/features/field/components/TechDashboard";
import { IncidentTracker } from "@/features/field/components/IncidentTracker";
import { IncidentReport } from "@/features/field/components/IncidentReport";
import { ShiftHandover } from "@/features/field/components/ShiftHandover";
import { WorkOrders } from "@/features/topology/components/WorkOrders";
import { WorkQueue } from "@/features/field/components/WorkQueue";
import { ReadingsRound } from "@/features/field/components/ReadingsRound";

// Admin shell + views
import { AdminLayout } from "@/features/topology/components/AdminLayout";
import { NocOverview } from "@/features/topology/components/NocOverview";
import { TopologyView } from "@/features/topology/components/TopologyView";
import { ErrorBoundary } from "@/shared/ui";
import { AssetInventory } from "@/features/topology/components/AssetInventory";
import { AlertsLog } from "@/features/topology/components/AlertsLog";
import { ShiftReports } from "@/features/topology/components/ShiftReports";
import { PersonnelManagement } from "@/features/topology/components/PersonnelManagement";
import { VendorRegister } from "@/features/topology/components/VendorRegister";
import { CommissioningImport } from "@/features/topology/components/CommissioningImport";

// Analytics sub-views
import { ExecutiveSummary } from "@/features/analytics/components/ExecutiveSummary";
import { ExecutiveSummaryDetailed } from "@/features/analytics/components/ExecutiveSummaryDetailed";
import { GridAnalytics } from "@/features/analytics/components/GridAnalytics";
import { FuelAnalytics } from "@/features/analytics/components/FuelAnalytics";
import { UpsAnalytics } from "@/features/analytics/components/UpsAnalytics";
import { ThermalAnalytics } from "@/features/analytics/components/ThermalAnalytics";
import { IncidentAnalytics } from "@/features/analytics/components/IncidentAnalytics";
import { CategoryDetail } from "@/features/analytics/components/CategoryDetail";
import { TechnicianAnalytics } from "@/features/analytics/components/TechnicianAnalytics";
import { CapacityLedger } from "@/features/analytics/components/CapacityLedger";

// Redirect component to handle legacy/typo topology links
function TopologyRedirect() {
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const roleParam = searchParams.get("role") || searchParams.get("ra") || "FIELD_TECH";
    const mappedRole = roleParam.toUpperCase() === "ADMIN" ? "ADMIN" : "FIELD_TECH";
    window.location.replace(`/topology_engine/renderer/index.html?role=${mappedRole}`);
  }, [searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-950 text-neutral-500">
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Redirecting to SCADA Topology...</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <SiteProvider>
      <AuthProvider>
        {/* Inside AuthProvider: a shift session belongs to a signed-in
            employee, so it can only resolve once auth has. */}
        <ShiftProvider>
        <Toaster />
        <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LoginPage />} />

          {/* Failsafe static file redirects */}
          <Route path="/topology_engine/render" element={<TopologyRedirect />} />
          <Route path="/topology_engine/render/index.html" element={<TopologyRedirect />} />
          <Route path="/topology_engine/renderer" element={<TopologyRedirect />} />
          <Route path="/topology_engine/renderer/index.html" element={<TopologyRedirect />} />

          {/* Tech shell — nested routing */}
          <Route path="/tech" element={<TechLayout />}>
            <Route index element={<TechDashboard />} />
            <Route path="readings" element={<ErrorBoundary label="Readings"><ReadingsRound /></ErrorBoundary>} />
            <Route path="jobs" element={<ErrorBoundary label="Jobs"><WorkQueue /></ErrorBoundary>} />
            <Route path="log" element={<ErrorBoundary label="Tracking"><IncidentTracker /></ErrorBoundary>} />
            <Route path="incident" element={<ErrorBoundary label="Report Incident"><IncidentReport /></ErrorBoundary>} />
            <Route path="handover" element={<ErrorBoundary label="Handover"><ShiftHandover /></ErrorBoundary>} />
          </Route>

          {/* Admin shell — nested routing */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<NocOverview />} />
            <Route path="topology"   element={<ErrorBoundary label="Topology"><TopologyView /></ErrorBoundary>} />
            <Route path="inventory"  element={<AssetInventory />} />
            <Route path="alerts"     element={<AlertsLog />} />
            <Route path="jobs"       element={<ErrorBoundary label="Work Orders"><WorkOrders /></ErrorBoundary>} />
            <Route path="reports"    element={<ShiftReports />} />
            <Route path="personnel"  element={<PersonnelManagement />} />
            <Route path="vendors"    element={<ErrorBoundary label="Vendors"><VendorRegister /></ErrorBoundary>} />
            <Route path="import"     element={<ErrorBoundary label="Import"><CommissioningImport /></ErrorBoundary>} />
            <Route path="analytics" element={<AnalyticsPage />}>
              <Route index element={<Navigate to="summary" replace />} />
              <Route path="summary" element={<ExecutiveSummary />} />
              <Route path="summary/full" element={<ExecutiveSummaryDetailed />} />
              <Route path="grid" element={<GridAnalytics />} />
              <Route path="fuel" element={<FuelAnalytics />} />
              <Route path="ups" element={<UpsAnalytics />} />
              <Route path="thermal" element={<ThermalAnalytics />} />
              <Route path="capacity" element={<ErrorBoundary label="Capacity"><CapacityLedger /></ErrorBoundary>} />
              <Route path="incidents" element={<IncidentAnalytics />} />
              <Route path="technicians" element={
                <ErrorBoundary label="Technician activity"><TechnicianAnalytics /></ErrorBoundary>} />
              {/* One route serves every category — the screens differ in which
                  assets they cover, not in what a person wants to know. */}
              <Route path="detail/:categoryId" element={
                <ErrorBoundary label="Category detail"><CategoryDetail /></ErrorBoundary>} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
        </ShiftProvider>
      </AuthProvider>
    </SiteProvider>
  );
}
