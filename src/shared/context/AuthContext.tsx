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

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedEnvelope<T> {
  timestamp: number;
  version: number;
  data: T;
}

const getCachedData = <T,>(key: string): T | null => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    const parsed: CachedEnvelope<T> = JSON.parse(item);
    if (parsed && parsed.version === 1 && parsed.timestamp) {
      const age = Date.now() - parsed.timestamp;
      if (age < CACHE_TTL_MS) {
        return parsed.data;
      }
    }
    return null;
  } catch {
    return null;
  }
};

const setCachedData = <T,>(key: string, data: T) => {
  try {
    const envelope: CachedEnvelope<T> = {
      timestamp: Date.now(),
      version: 1,
      data
    };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Ignore storage write errors
  }
};

const clearCachedAuthData = () => {
  localStorage.removeItem('dcime_cached_profile');
  localStorage.removeItem('dcime_cached_site');
};

const isNetworkError = (err: any): boolean => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch') ||
    err.name === 'AbortError'
  );
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { setCurrentSite } = useCurrentSite();

  const applyProfileAndSite = (empData: EmployeeProfile | null) => {
    if (empData) {
      setEmployee(empData);
      setCachedData('dcime_cached_profile', empData);

      const joinedSites = empData.sites;
      const siteData = Array.isArray(joinedSites) ? joinedSites[0] : joinedSites;
      if (siteData) {
        setCurrentSite(siteData as any);
        setCachedData('dcime_cached_site', siteData);
      } else {
        setCurrentSite(null);
      }
    } else {
      setEmployee(null);
      setCurrentSite(null);
      clearCachedAuthData();
    }
  };

  const restoreFromCache = (): boolean => {
    const cachedEmp = getCachedData<EmployeeProfile>('dcime_cached_profile');
    const cachedSite = getCachedData<any>('dcime_cached_site');
    if (cachedEmp) {
      setEmployee(cachedEmp);
      if (cachedSite) setCurrentSite(cachedSite);
      return true;
    }
    return false;
  };

  const queryEmployeeProfile = async (userId: string) => {
    return supabase
      .from("employees")
      .select("id, auth_id, full_name, email, employee_id, phone_number, site_id, role, created_at, site_uuid, sites ( id, site_code, site_name )")
      .eq("auth_id", userId)
      .maybeSingle();
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await queryEmployeeProfile(userId);

      if (error) throw error;

      if (data) {
        applyProfileAndSite(data as EmployeeProfile);
      } else {
        // No row found: Employee record was deleted or not assigned
        applyProfileAndSite(null);
      }
    } catch (err: any) {
      console.warn("Profile query error in AuthContext:", err);
      if (isNetworkError(err)) {
        restoreFromCache();
      } else {
        applyProfileAndSite(null);
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
      applyProfileAndSite(null);
    }
  };

  useEffect(() => {
    const initSession = async () => {
      setIsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);

          try {
            const profilePromise = queryEmployeeProfile(session.user.id);
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Profile query network timeout")), 4000)
            );

            const res: any = await Promise.race([profilePromise, timeoutPromise]);
            if (res?.data) {
              applyProfileAndSite(res.data as EmployeeProfile);
            } else if (res?.error) {
              throw res.error;
            } else {
              // Row explicitly missing in DB
              applyProfileAndSite(null);
            }
          } catch (netErr: any) {
            console.warn("[DCIMe] Profile fetch issue. Checking offline cache.", netErr);
            if (isNetworkError(netErr)) {
              restoreFromCache();
            } else {
              applyProfileAndSite(null);
            }
          }
        } else {
          // No session in browser
          applyProfileAndSite(null);
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
        applyProfileAndSite(null);
        setIsLoading(false);
        return;
      }

      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      } else if (!session) {
        const restored = restoreFromCache();
        if (!restored) {
          setUser(null);
          applyProfileAndSite(null);
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
    applyProfileAndSite(null);
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
