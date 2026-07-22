import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "./SiteContext";

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
  site_uuid?: string | null;
  sites?: {
    id: string;
    site_code: string;
    site_name: string;
  }[] | null;
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
  const { setCurrentSite } = useCurrentSite();

  const getCachedProfile = (): EmployeeProfile | null => {
    try {
      const cached = localStorage.getItem('dcime_cached_profile');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  };

  const getCachedSite = (): any => {
    try {
      const cached = localStorage.getItem('dcime_cached_site');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("id, auth_id, full_name, email, employee_id, phone_number, site_id, role, created_at, site_uuid, sites ( id, site_code, site_name )")
        .eq("auth_id", userId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setEmployee(data as EmployeeProfile);
        localStorage.setItem('dcime_cached_profile', JSON.stringify(data));

        const joinedSites = data.sites;
        const siteData = Array.isArray(joinedSites) ? joinedSites[0] : joinedSites;
        if (siteData) {
          setCurrentSite(siteData as any);
          localStorage.setItem('dcime_cached_site', JSON.stringify(siteData));
        } else {
          setCurrentSite(null);
        }
      } else {
        // Fallback to cached profile if present
        const cachedEmp = getCachedProfile();
        const cachedSite = getCachedSite();
        if (cachedEmp) setEmployee(cachedEmp);
        if (cachedSite) setCurrentSite(cachedSite);
      }
    } catch (err) {
      console.warn("Network error loading profile in AuthContext, using offline cache:", err);
      const cachedEmp = getCachedProfile();
      const cachedSite = getCachedSite();
      if (cachedEmp) {
        setEmployee(cachedEmp);
      }
      if (cachedSite) {
        setCurrentSite(cachedSite);
      }
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
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);

          // Try loading fresh profile over network with timeout
          try {
            const profilePromise = supabase
              .from("employees")
              .select("id, auth_id, full_name, email, employee_id, phone_number, site_id, role, created_at, site_uuid, sites ( id, site_code, site_name )")
              .eq("auth_id", session.user.id)
              .maybeSingle();

            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Profile query network timeout")), 4000)
            );

            const res: any = await Promise.race([profilePromise, timeoutPromise]);
            if (res?.data) {
              const empData = res.data as EmployeeProfile;
              setEmployee(empData);
              localStorage.setItem('dcime_cached_profile', JSON.stringify(empData));

              const joinedSites = empData.sites;
              const siteData = Array.isArray(joinedSites) ? joinedSites[0] : joinedSites;
              if (siteData) {
                setCurrentSite(siteData);
                localStorage.setItem('dcime_cached_site', JSON.stringify(siteData));
              }
            } else {
              // Use offline cache
              const cachedEmp = getCachedProfile();
              const cachedSite = getCachedSite();
              if (cachedEmp) setEmployee(cachedEmp);
              if (cachedSite) setCurrentSite(cachedSite);
            }
          } catch (netErr) {
            console.warn("[DCIMe] Network offline/timeout during profile fetch. Using cached session & profile.", netErr);
            const cachedEmp = getCachedProfile();
            const cachedSite = getCachedSite();
            if (cachedEmp) setEmployee(cachedEmp);
            if (cachedSite) setCurrentSite(cachedSite);
          }
        }
      } catch (err) {
        console.error("[DCIMe] Error checking local auth session:", err);
      } finally {
        setIsLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setEmployee(null);
        setCurrentSite(null);
        localStorage.removeItem('dcime_cached_profile');
        localStorage.removeItem('dcime_cached_site');
        setIsLoading(false);
        return;
      }

      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      } else if (!session) {
        // Fallback to offline session if token exists
        const cachedEmp = getCachedProfile();
        if (!cachedEmp) {
          setUser(null);
          setEmployee(null);
          setCurrentSite(null);
        }
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
    setCurrentSite(null);
    localStorage.removeItem('dcime_cached_profile');
    localStorage.removeItem('dcime_cached_site');
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
