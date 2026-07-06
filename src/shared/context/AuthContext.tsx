import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/shared/api/supabaseClient";

export interface EmployeeProfile {
  id: string;             // database UUID
  auth_id: string;       // auth UUID
  full_name: string;     // full name
  email: string;         // unique email
  employee_id: string;   // unique badge/staff ID (e.g. ZM-4891)
  phone_number: string;  // phone number
  site_id: string;       // primary site location (e.g. NTC ZM 0874)
  role: "ADMIN" | "FIELD_TECH";
  created_at: string;
}

interface AuthContextType {
  user: any;
  employee: EmployeeProfile | null;
  siteId: string;        // mapped from employee.site_id
  employeeId: string;    // mapped from employee.employee_id
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
        .select("id, auth_id, full_name, email, employee_id, phone_number, site_id, role, created_at")
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
    const initSession = async () => {
      setIsLoading(true);
      try {
        const getSessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null }; error: any }>((_, reject) =>
          setTimeout(() => reject(new Error("Session initialization timed out")), 10000)
        );

        const result = await Promise.race([getSessionPromise, timeoutPromise]);
        const session = result.data?.session;

        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        }
      } catch (err) {
        console.error("[DCIMe] Error or timeout during initial session fetch:", err);
        // Clear stuck/stale local state
        await supabase.auth.signOut().catch(() => {});
      } finally {
        setIsLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
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

  const siteId = employee?.site_id || "NTC ZM 0874";
  const employeeId = employee?.employee_id || "EMP-UNKNOWN";

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
