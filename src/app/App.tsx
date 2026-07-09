import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { AuthProvider } from "@/shared/context/AuthContext";
import { SiteProvider } from "@/shared/context/SiteContext";
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

// Admin shell + views
import { AdminLayout } from "@/features/topology/components/AdminLayout";
import { NocOverview } from "@/features/topology/components/NocOverview";
import { AssetInventory } from "@/features/topology/components/AssetInventory";
import { AlertsLog } from "@/features/topology/components/AlertsLog";
import { ShiftReports } from "@/features/topology/components/ShiftReports";
import { PersonnelManagement } from "@/features/topology/components/PersonnelManagement";

// Analytics sub-views
import { GridAnalytics } from "@/features/analytics/components/GridAnalytics";
import { FuelAnalytics } from "@/features/analytics/components/FuelAnalytics";
import { UpsAnalytics } from "@/features/analytics/components/UpsAnalytics";
import { ThermalAnalytics } from "@/features/analytics/components/ThermalAnalytics";
import { IncidentAnalytics } from "@/features/analytics/components/IncidentAnalytics";

export default function App() {
  return (
    <SiteProvider>
      <AuthProvider>
        <Toaster />
        <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LoginPage />} />

          {/* Tech shell — nested routing */}
          <Route path="/tech" element={<TechLayout />}>
            <Route index element={<TechDashboard />} />
            <Route path="log" element={<IncidentTracker />} />
            <Route path="incident" element={<IncidentReport />} />
            <Route path="handover" element={<ShiftHandover />} />
          </Route>

          {/* Admin shell — nested routing */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<NocOverview />} />
            <Route path="inventory"  element={<AssetInventory />} />
            <Route path="alerts"     element={<AlertsLog />} />
            <Route path="reports"    element={<ShiftReports />} />
            <Route path="personnel"  element={<PersonnelManagement />} />
            <Route path="analytics" element={<AnalyticsPage />}>
              <Route index element={<Navigate to="grid" replace />} />
              <Route path="grid" element={<GridAnalytics />} />
              <Route path="fuel" element={<FuelAnalytics />} />
              <Route path="ups" element={<UpsAnalytics />} />
              <Route path="thermal" element={<ThermalAnalytics />} />
              <Route path="incidents" element={<IncidentAnalytics />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
      </AuthProvider>
    </SiteProvider>
  );
}
