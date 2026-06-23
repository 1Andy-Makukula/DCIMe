import React from "react";
import { BrowserRouter, Routes, Route } from "react-router";

// Pages
import LoginPage from "@/pages/LoginPage";

// Tech shell + views
import { TechLayout } from "@/features/field/components/TechLayout";
import { TechDashboard } from "@/features/field/components/TechDashboard";
import { RoutineTasksDashboard } from "@/features/field/components/RoutineTasksDashboard";
import { IncidentReport } from "@/features/field/components/IncidentReport";
import { ShiftHandover } from "@/features/field/components/ShiftHandover";

// Admin shell + views
import { AdminLayout } from "@/features/topology/components/AdminLayout";
import { NocOverview } from "@/features/topology/components/NocOverview";
import { AssetInventory } from "@/features/topology/components/AssetInventory";
import { AlertsLog } from "@/features/topology/components/AlertsLog";
import { ShiftReports } from "@/features/topology/components/ShiftReports";
import { PersonnelManagement } from "@/features/topology/components/PersonnelManagement";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LoginPage />} />

        {/* Tech shell — nested routing */}
        <Route path="/tech" element={<TechLayout />}>
          <Route index element={<TechDashboard />} />
          <Route path="log" element={<RoutineTasksDashboard />} />
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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

