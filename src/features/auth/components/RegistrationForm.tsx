import React, { useState, useEffect } from "react";
import { DEFAULT_SITE_CODE } from "@/config/sites";
import { createClient } from "@supabase/supabase-js";
import { useAuth } from "@/shared/context/AuthContext";
import { supabase } from "@/shared/api/supabaseClient";
import { BRAND_EMAIL_DOMAIN, siteLabel } from "@/shared/utils/branding";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { 
  User, 
  Mail, 
  Lock, 
  Key, 
  Phone, 
  MapPin, 
  ShieldAlert,
  UserPlus, 
  ShieldCheck,
  Eye,
  EyeOff,
  X
} from "lucide-react";

// Initialize a secondary, non-persistent Supabase client 
// to prevent the active Administrator from being logged out during signup!
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const tempAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: "temp-auth-key"
  }
});

export interface RegistrationFormProps {
  onClose?: () => void;
  onSaveSuccess?: () => void;
}

export function RegistrationForm({ onClose, onSaveSuccess }: RegistrationFormProps = {}) {
  const { employee, isLoading: isAuthLoading } = useAuth();
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [badgeId, setBadgeId] = useState("");
  const [phone, setPhone] = useState("");
  const [site, setSite] = useState("");
  const [role, setRole] = useState<"ADMIN" | "FIELD_TECH">("FIELD_TECH");
  
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSiteUuid, setSelectedSiteUuid] = useState("");

  useEffect(() => {
    const fetchSites = async () => {
      try {
        const { data, error } = await supabase
          .from("sites")
          .select("*")
          .order("site_name", { ascending: true });
        if (!error && data) {
          setSites(data);
          const defaultSite = data.find((s: any) => s.site_code === DEFAULT_SITE_CODE) || data[0];
          if (defaultSite) {
            setSelectedSiteUuid(defaultSite.id);
            setSite(defaultSite.site_code);
          }
        }
      } catch (err) {
        console.error("Error loading sites for registration:", err);
      }
    };
    fetchSites();
  }, []);
  
  const [showPw, setShowPw] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Guard Check: Only authenticated users with ADMIN role can provision
  // accounts. (The old "bootstrap mode" was unreachable dead code — the
  // first ADMIN row for a brand-new database is inserted directly via
  // the SQL Editor / service_role, which bypasses RLS.)
  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[300px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Verifying IAM Clearance...</span>
        </div>
      </div>
    );
  }

  if (!employee || employee.role !== "ADMIN") {

    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white border border-danger-100 rounded-3xl shadow-sm text-center space-y-4">
        <div className="w-16 h-16 bg-danger-50 rounded-full flex items-center justify-center mx-auto text-danger-500 border border-danger-100">
          <ShieldAlert size={32} />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Clearance Rejected</h2>
          <p className="text-xs font-semibold text-gray-400">
            This module requires Layer 5 (NOC Administrator) authorization.
          </p>
        </div>
        <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-semibold text-gray-600 leading-relaxed">
          Your current session is associated with a restricted technician role. If this is an error, please contact the lead security officer.
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);
    setError(null);
    setSuccessMsg(null);

    if (!selectedSiteUuid) {
      setError("A site must be selected before provisioning an account.");
      setIsRegistering(false);
      return;
    }

    try {
      const cleanBadge = badgeId.trim().toUpperCase();

      // Step A: Register User in Supabase Auth via the temporary non-persistent client.
      // The AUTH identity uses the synthesized badge-ID email — this is what the
      // login screen expects when a technician types their Employee/Badge ID.
      // Their real corporate email is stored on the employees row as a contact
      // field only, never as the login credential.
      const loginEmail = `${cleanBadge.toLowerCase()}@dcime.local`;
      const { data: authData, error: authError } = await tempAuthClient.auth.signUp({
        email: loginEmail,
        password: password,
      });

      if (authError) throw authError;
      if (!authData.user) {
        throw new Error("Failed to create user credentials.");
      }

      // Step B: Insert the matching profile via the secure RPC. The direct
      // table INSERT is rejected by RLS (admins can't self-insert rows for
      // other auth users); admin_create_employee() is SECURITY DEFINER and
      // re-verifies the caller is an active ADMIN at the same site.
      const { error: dbError } = await supabase.rpc("admin_create_employee", {
        p_auth_id: authData.user.id,
        p_full_name: name.trim(),
        p_employee_id: cleanBadge,
        p_role: role,
        p_site_uuid: selectedSiteUuid,
        p_site_id: site,
        p_email: email.trim(),
        // Omit rather than pass null — admin_create_employee declares
        // p_phone_number text DEFAULT NULL, so an absent key gets the default.
        p_phone_number: phone.trim() || undefined,
      });

      if (dbError) {
        throw dbError;
      }

      // Reset form states
      setName("");
      setEmail("");
      setPassword("");
      setBadgeId("");
      setPhone("");
      setSuccessMsg(`Account for ${name} provisioned successfully! They can now sign in with Badge ID "${cleanBadge}".`);
      
      setTimeout(() => {
        if (onSaveSuccess) onSaveSuccess();
        if (onClose) onClose();
      }, 1500);
    } catch (err: any) {

      console.error("Error provisioning user:", err);
      setError(err.message || "An unexpected error occurred during account provisioning.");
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto bg-white border border-gray-100 shadow-sm rounded-3xl overflow-hidden">
      
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
            IAM · Identity Access Provisioning
          </div>
          <h2 className="text-[16px] font-black text-gray-900 leading-none">
            Register New Employee
          </h2>

        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        
        {/* Name & Badge ID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <User size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ndabane Anderson M."
                className="w-full pl-9 pr-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
              Employee / Badge ID
            </label>
            <div className="relative">
              <Key size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                required
                value={badgeId}
                onChange={(e) => setBadgeId(e.target.value)}
                placeholder="e.g. ZM-4891"
                className="w-full pl-9 pr-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Email & Password */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`e.g. anderson.m@${BRAND_EMAIL_DOMAIN}`}
                className="w-full pl-9 pr-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
              Secure Password
            </label>
            <div className="relative">
              <Lock size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPw ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-11 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
        </div>

        {/* Phone & Site */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
              Phone Number
            </label>
            <div className="relative">
              <Phone size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +260 97 123 4567"
                className="w-full pl-9 pr-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
              Primary Site Location
            </label>
            <div className="relative">
              <MapPin size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
              <Select 
                value={selectedSiteUuid} 
                onValueChange={(uuid) => {
                  setSelectedSiteUuid(uuid);
                  const matched = sites.find((s) => s.id === uuid);
                  if (matched) {
                    setSite(matched.site_code);
                  }
                }}
              >
                <SelectTrigger className="w-full h-[46px] pl-9 bg-gray-50 border border-gray-200 rounded-xl text-[12px] font-semibold text-gray-900 focus:ring-1 focus:ring-gray-450 focus:border-gray-450">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border border-gray-100 rounded-xl shadow-lg z-[var(--z-menu)]">
                  {sites.map((s) => (
                    <SelectItem 
                      key={s.id} 
                      value={s.id} 
                      className="text-[12px] font-semibold text-gray-900 cursor-pointer"
                    >
                      {siteLabel(s.site_name ?? s.site_code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Role Select */}
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
            System Authorization Role
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setRole("FIELD_TECH")}
              className={`py-3 rounded-xl text-center text-xs font-black uppercase tracking-wider transition-all border cursor-pointer ${
                role === "FIELD_TECH"
                  ? "bg-brand-50 border-brand-500 text-brand-700"
                  : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
              }`}
            >
              Field Tech
            </button>
            <button
              type="button"
              onClick={() => setRole("ADMIN")}
              className={`py-3 rounded-xl text-center text-xs font-black uppercase tracking-wider transition-all border cursor-pointer ${
                role === "ADMIN"
                  ? "bg-purple-50 border-purple-500 text-purple-700"
                  : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
              }`}
            >
              NOC Admin (L5)
            </button>

          </div>
        </div>

        {/* Feedback Banners */}
        {error && (
          <div className="p-3 text-xs font-semibold text-danger-600 bg-danger-50 border border-danger-100 rounded-xl text-center">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 p-3 text-xs font-semibold text-ok-700 bg-ok-50 border border-ok-100 rounded-xl">
            <ShieldCheck size={14} className="text-ok-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-xl text-[11px] font-black text-gray-500 hover:bg-gray-100 transition-all uppercase tracking-wider cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isRegistering || !selectedSiteUuid}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-900 text-white text-[12px] font-black uppercase tracking-wider hover:bg-gray-700 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-gray-900/10"
          >
            <UserPlus size={14} />
            {isRegistering ? "Provisioning..." : "Provision Account"}
          </button>
        </div>

      </form>
    </div>
  );
}

export default RegistrationForm;
