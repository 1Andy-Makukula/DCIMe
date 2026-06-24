import { useNavigate } from "react-router";
import { LoginForm } from "@/features/auth/components/LoginForm";

export default function LoginPage() {
  const navigate = useNavigate();
  return (
    <LoginForm
      onAdmin={() => navigate("/admin")}
      onField={() => navigate("/tech")}
    />
  );
}
