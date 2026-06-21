import React, { useState } from "react";
import { Screen } from "@/shared/types";
import { AuditTrailModal } from "@/features/audit/components/AuditTrailModal";
import LoginPage from "@/pages/LoginPage";
import AdminDashboardPage from "@/pages/AdminDashboardPage";
import FieldPortalPage from "@/pages/FieldPortalPage";
import DataIngestionPage from "@/pages/DataIngestionPage";
import { Providers } from "./providers";

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [showAudit, setShowAudit] = useState(false);

  const handleAuditClose = () => {
    setShowAudit(false);
    if (screen === "form") setScreen("field");
  };

  return (
    <Providers>
      <div style={{ fontFamily: "'Inter', sans-serif" }}>
        {showAudit && <AuditTrailModal onClose={handleAuditClose} />}

        {screen === "login" && (
          <LoginPage onAdmin={() => setScreen("dashboard")} onField={() => setScreen("field")} />
        )}
        {screen === "dashboard" && (
          <AdminDashboardPage onBack={() => setScreen("login")} onAudit={() => setShowAudit(true)} />
        )}
        {screen === "field" && (
          <FieldPortalPage onBack={() => setScreen("login")} onForm={() => setScreen("form")} />
        )}
        {screen === "form" && (
          <DataIngestionPage onBack={() => setScreen("field")} onSubmit={() => setShowAudit(true)} />
        )}
      </div>
    </Providers>
  );
}
