import { useNavigate } from "react-router";
import { FieldPortal } from "@/features/telemetry/components/FieldPortal";

export default function FieldPortalPage() {
  const navigate = useNavigate();
  return (
    <FieldPortal
      onBack={() => navigate("/")}
      onForm={() => navigate("/tech/report")}
    />
  );
}
