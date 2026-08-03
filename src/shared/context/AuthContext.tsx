import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "./SiteContext";

interface SiteRef {
  id: string;
  site_code: string;
  site_name: string;
}

export interface EmployeeProfile {
  id: string;             // database UUID
  auth_id: string;       // auth UUID
  full_name: string;     // full name
  email: string;         // unique email
  employee_id: string;   // unique badge/staff ID (e.g. ZM-4891)
  phone_number: string;  // phone number
  site_id: string;       // primary site location (e.g. NTC ZM 0874)
  role: "ADMIN" | "FIELD_TECH";
  status: "Active" | "Revoked";
  created_at: string;
  site_uuid?: string | null;
  // PostgREST returns a single object for this to-one embed, but has returned
  // a one-element array in the past. applyProfileAndSite() normalises both,
  // so the type admits both rather than claiming only one is possible.
  sites?: SiteRef | SiteRef[] | null;
}

interface AuthContextType {
  user: any;
  employee: EmployeeProfile | null;
  siteId: string;        // mapped from employee.site_id
  employeeId: string;    // mapped from employee.employee_id
  isLoading: boolean;
  /**
   * True ONLY when the live profile fetch failed due to a genuine
   * network outage and we are showing the locally cached profile.
   * Cached data must NEVER be used to authorize privileged screens —
   * consumers should treat this as "read-only offline mode".
   */
  isOfflineFallback: boolean;
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
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);
  const { setCurrentSite } = useCurrentSite();

  // Monotonic sequence counter. Every auth event (initial session check,
  // SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT, manual refresh) bumps this.
  // Async continuations capture the value at start and bail out if it has
  // moved on — guaranteeing the LAST auth event wins, eliminating the
  // startup race between initSession() and onAuthStateChange().
  const authSeqRef = useRef(0);

  const applyProfileAndSite = (empData: EmployeeProfile | null, opts?: { offline?: boolean }) => {
    if (empData) {
      setEmployee(empData);
      setIsOfflineFallback(opts?.offline === true);
      // Only cache FRESH, server-verified profiles. Never re-cache a
      // cache-restored profile (that would extend the TTL indefinitely).
      if (opts?.offline !== true) {
        setCachedData('dcime_cached_profile', empData);
      }

      const joinedSites = empData.sites;
      const siteData = Array.isArray(joinedSites) ? joinedSites[0] : joinedSites;
      if (siteData) {
        setCurrentSite(siteData as any);
        if (opts?.offline !== true) {
          setCachedData('dcime_cached_site', siteData);
        }
      } else {
        setCurrentSite(null);
      }
    } else {
      setEmployee(null);
      setIsOfflineFallback(false);
      setCurrentSite(null);
      clearCachedAuthData();
    }
  };

  const restoreFromCache = (): boolean => {
    const cachedEmp = getCachedData<EmployeeProfile>('dcime_cached_profile');
    const cachedSite = getCachedData<any>('dcime_cached_site');
    if (cachedEmp) {
      applyProfileAndSite(cachedEmp, { offline: true });
      if (cachedSite) setCurrentSite(cachedSite);
      return true;
    }
    return false;
  };

  const queryEmployeeProfile = async (userId: string) => {
    return supabase
      .from("employees")
      .select("id, auth_id, full_name, email, employee_id, phone_number, site_id, role, status, created_at, site_uuid, sites ( id, site_code, site_name )")
      .eq("auth_id", userId)
      .maybeSingle();
  };

  // Returns true if the profile was applied (or explicitly cleared),
  // false if the attempt was superseded by a newer auth event.
  const handleProfileResult = async (
    data: EmployeeProfile | null,
    seq: number
  ): Promise<void> => {
    if (seq !== authSeqRef.current) return;

    if (!data) {
      // No row found: Employee record was deleted or not assigned
      applyProfileAndSite(null);
      return;
    }

    if (data.status === "Revoked") {
      // Access was revoked server-side. Kill the session immediately —
      // never let a cached or in-flight profile keep this user in.
      applyProfileAndSite(null);
      setUser(null);
      await supabase.auth.signOut();
      return;
    }

    applyProfileAndSite(data);
  };

  const fetchProfile = async (userId: string, seq: number) => {
    try {
      const { data, error } = await queryEmployeeProfile(userId);

      if (seq !== authSeqRef.current) return;
      if (error) throw error;

      await handleProfileResult((data as EmployeeProfile) || null, seq);
    } catch (err: any) {
      if (seq !== authSeqRef.current) return;
      console.warn("Profile query error in AuthContext:", err);
      if (isNetworkError(err)) {
        // Offline: show cached profile as READ-ONLY fallback only.
        // isOfflineFallback=true tells privileged screens to lock down.
        restoreFromCache();
      } else {
        applyProfileAndSite(null);
      }
    }
  };

  const refreshProfile = async () => {
    const seq = ++authSeqRef.current;
    const { data: { session } } = await supabase.auth.getSession();
    if (seq !== authSeqRef.current) return;
    if (session?.user) {
      setUser(session.user);
      await fetchProfile(session.user.id, seq);
    } else {
      setUser(null);
      applyProfileAndSite(null);
    }
  };

  useEffect(() => {
    const initSession = async () => {
      const seq = ++authSeqRef.current;
      setIsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (seq !== authSeqRef.current) return;

        if (session?.user) {
          setUser(session.user);

          try {
            const profilePromise = queryEmployeeProfile(session.user.id);
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Profile query network timeout")), 4000)
            );

            const res: any = await Promise.race([profilePromise, timeoutPromise]);
            if (seq !== authSeqRef.current) return;

            if (res?.error) {
              throw res.error;
            }
            await handleProfileResult((res?.data as EmployeeProfile) || null, seq);
          } catch (netErr: any) {
            if (seq !== authSeqRef.current) return;
            console.warn("[DCIMe] Profile fetch issue. Checking offline cache.", netErr);
            if (isNetworkError(netErr)) {
              restoreFromCache();
            } else {
              applyProfileAndSite(null);
            }
          }
        } else {
          // No session in browser — logged out. Never restore from cache:
          // a missing session means signed out, not "maybe offline".
          applyProfileAndSite(null);
        }
      } catch (err) {
        console.error("[DCIMe] Error checking local auth session:", err);
      } finally {
        if (seq === authSeqRef.current) {
          setIsLoading(false);
        }
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const seq = ++authSeqRef.current;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        applyProfileAndSite(null);
        setIsLoading(false);
        return;
      }

      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id, seq);
      } else {
        // Missing session = logged out. Do NOT fall back to the cached
        // profile here — that path was what let revoked/demoted users
        // keep privileged access for up to a week.
        setUser(null);
        applyProfileAndSite(null);
      }
      if (seq === authSeqRef.current) {
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    const seq = ++authSeqRef.current;
    setIsLoading(true);
    await supabase.auth.signOut();
    if (seq !== authSeqRef.current) return;
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
        isOfflineFallback,
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
