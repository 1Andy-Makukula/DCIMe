import { DataIngestionForm } from "@/features/telemetry/components/DataIngestionForm";
import { useTelemetryData } from "@/features/field/hooks/useTelemetryData";

export interface DataIngestionPageProps {
  onBack: () => void;
  onSubmit: () => void;
}

export default function DataIngestionPage({ onBack, onSubmit }: DataIngestionPageProps) {
  const currentHour = new Date().getHours();
  const { formData, handleInputChange, handleSubmit } = useTelemetryData(currentHour, onSubmit);

  return (
    <DataIngestionForm
      onBack={onBack}
      onSubmit={handleSubmit}
      formData={formData}
      handleInputChange={handleInputChange}
    />
  );
}
