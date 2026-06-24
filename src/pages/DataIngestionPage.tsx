import { DataIngestionForm } from "@/features/telemetry/components/DataIngestionForm";

export interface DataIngestionPageProps {
  onBack: () => void;
  onSubmit: () => void;
}

export default function DataIngestionPage({ onBack, onSubmit }: DataIngestionPageProps) {
  return <DataIngestionForm onBack={onBack} onSubmit={onSubmit} />;
}
