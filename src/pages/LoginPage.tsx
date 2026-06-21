import React from "react";
import { LoginForm } from "@/features/auth/components/LoginForm";

export interface LoginPageProps {
  onAdmin: () => void;
  onField: () => void;
}

export default function LoginPage({ onAdmin, onField }: LoginPageProps) {
  return <LoginForm onAdmin={onAdmin} onField={onField} />;
}
