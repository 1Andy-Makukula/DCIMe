import { NocDashboard } from "@/features/topology/components/NocDashboard";

export interface AdminDashboardPageProps {
  onBack: () => void;
  onAudit: () => void;
}

export default function AdminDashboardPage({ onBack, onAudit }: AdminDashboardPageProps) {
  return <NocDashboard onBack={onBack} onAudit={onAudit} />;
}
