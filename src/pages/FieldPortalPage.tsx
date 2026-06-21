import React from "react";
import { FieldPortal } from "@/features/telemetry/components/FieldPortal";

export interface FieldPortalPageProps {
  onBack: () => void;
  onForm: () => void;
}

export default function FieldPortalPage({ onBack, onForm }: FieldPortalPageProps) {
  return <FieldPortal onBack={onBack} onForm={onForm} />;
}
