import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/shared/api/supabaseClient";

export interface EmployeeProfile {
  id: string;             // database UUID
  badge_id: string;       // e.g., "ZM-4891"
  full_name: string;     // e.g., "Ndabane Anderson M."
  role: string;          // e.g., "ADMIN" or "FIELD_TECH"
  email: string;         
  phone: string;
  clearance_zone: string; // The "site_id" or location clearance
  shift_schedule: string;
  access_level: number;
  status: string;
}

interface AuthContextType {
  user: any;
  employee: EmployeeProfile | null;
  siteId: string;        // clearance_zone / site
  employeeId: string;    // badge_id / staff ID
  isLoading: boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("auth_id", userId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setEmployee(data as EmployeeProfile);
      } else {
        setEmployee(null);
      }
    } catch (err) {
      console.error("Error loading employee profile in AuthContext:", err);
      setEmployee(null);
    }
  };

  const refreshProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      await fetchProfile(session.user.id);
    } else {
      setUser(null);
      setEmployee(null);
    }
  };

  useEffect(() => {
    // Check active session on mount
    const initSession = async () => {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      }
      setIsLoading(false);
    };

    initSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      } else {
        setUser(null);
        setEmployee(null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setEmployee(null);
    setIsLoading(false);
  };

  const siteId = employee?.clearance_zone || "NTC ZM 0874";
  const employeeId = employee?.badge_id || "EMP-UNKNOWN";

  return (
    <AuthContext.Provider
      value={{
        user,
        employee,
        siteId,
        employeeId,
        isLoading,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
