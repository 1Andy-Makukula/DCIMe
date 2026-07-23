import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff, ShieldAlert, UserPlus } from "lucide-react";
import { AirtelMark, TopologyBG } from "@/shared/ui";
import { supabase } from "@/shared/api/supabaseClient";
import { RegistrationForm } from "./RegistrationForm";

export interface LoginFormProps {
  onAdmin: () => void;
  onField: () => void;
}

export function LoginForm() {
  const navigate = useNavigate();
  
  const [showPw, setShowPw] = useState(false);
  const [empId, setEmpId] = useState("");
  const [pw, setPw] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bootstrapping states
  const [hasAdmins, setHasAdmins] = useState<boolean | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const loginAttemptRef = React.useRef(0);

  // Check if any ADMIN accounts exist in the database
  const checkAdmins = async () => {
    try {
      const { count, error: countError } = await supabase
        .from("employees")
        .select("*", { count: "exact", head: true })
        .eq("role", "ADMIN");

      if (!countError) {
        setHasAdmins((count || 0) > 0);
      } else {
        setHasAdmins(true); // default to secure if database fails
      }
    } catch (err) {
      setHasAdmins(true);
    }
  };

  useEffect(() => {
    checkAdmins();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const currentAttempt = ++loginAttemptRef.current;

    // 1. Clean the input (e.g., "PETER-01")
    const rawId = empId.trim().toLowerCase();

    // 2. The Interceptor: Fake the email if they just typed an ID
    const supabaseEmail = rawId.includes('@') 
      ? rawId 
      : `${rawId}@dcime.local`;

    // 3. Authenticate with Supabase with a Timeout Race to prevent freezing on stale sessions
    let authData = null;
    let authError = null;

    try {
      const loginPromise = supabase.auth.signInWithPassword({
        email: supabaseEmail,
        password: pw,
      });

      const timeoutPromise = new Promise<{ data: any; error: any }>((_, reject) =>
        setTimeout(() => reject(new Error("Login timed out. Re-initializing session client... Please try again.")), 12000)
      );

      const result = await Promise.race([loginPromise, timeoutPromise]);
      
      if (currentAttempt !== loginAttemptRef.current) return;

      authData = result.data;
      authError = result.error;
    } catch (err: any) {
      if (currentAttempt !== loginAttemptRef.current) return;

      console.error("[DCIMe] Login timed out or encountered an error:", err);
      // Clean up local auth storage and client state asynchronously
      supabase.auth.signOut().catch(() => {});
      setError(err.message || "Login timed out. Please refresh and try again.");
      setIsLoading(false);
      return;
    }

    if (authError || !authData?.user) {
      setError(authError?.message || "Invalid ID or Password.");
      setIsLoading(false);
      return;
    }

    // 4. Schema-Aware Role & Status Check with Self-Healing Link
    let empData = null;

    // A. Query standard auth_id matching first
    const { data: directData } = await supabase
      .from('employees')
      .select('id, role, employee_id, site_id, site_uuid, sites ( id, site_code, site_name )')
      .eq('auth_id', authData.user.id)
      .maybeSingle();

    empData = directData;

    // B. Fallback: If no auth_id is linked yet, look up by employee_id or email to dynamically link it
    if (!empData) {
      const { data: linkData } = await supabase
        .from('employees')
        .select('id, role, employee_id, site_id, site_uuid, sites ( id, site_code, site_name )')
        .or(`employee_id.ieq.${rawId},email.ieq.${rawId}`)
        .maybeSingle();

      if (linkData) {
        // Link the auth_id in the database
        const { error: updateError } = await supabase
          .from('employees')
          .update({ auth_id: authData.user.id })
          .eq('id', linkData.id);

        if (!updateError) {
          empData = { ...linkData, auth_id: authData.user.id };
        } else {
          console.error("Failed to dynamically link employee auth_id:", updateError);
          empData = linkData;
        }
      }
    }

    if (!empData) {
      console.warn("Employee record missing, defaulting to Field Tech routing.");
      navigate("/tech");
      return;
    }

    // 5. Intelligent Routing based on schema enums
    if (empData.role === 'ADMIN') {
      navigate("/admin"); // Navigate to NOC/Admin dashboard
    } else {
      navigate("/tech");
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#0C0D0D]">
      
      {/* LEFT SIDE: Hero Graphic (Only visible on Desktop 'lg' screens) */}
      <div className="hidden lg:flex flex-1 relative flex-col items-center justify-center overflow-hidden" 
           style={{ background: "linear-gradient(145deg, #CC0000 0%, #FF0000 45%, #880000 100%)" }}>
        <div className="absolute inset-0 opacity-30"><TopologyBG /></div>
        <div className="relative z-10 text-center flex flex-col items-center px-12">
          <div className="bg-white p-6 rounded-3xl shadow-2xl mb-8">
            <AirtelMark size={70} />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight leading-tight uppercase">
            DATA CENTER INFRASTRUCTURE <br/> MANAGEMENT ENGINE
          </h1>
          <p className="mt-4 text-red-100 text-2xl font-black tracking-widest uppercase">
            DCIMe
          </p>
        </div>
      </div>

      {/* RIGHT SIDE: Content Card Area */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 lg:p-12 relative bg-[#0C0D0D] lg:bg-gray-50">
        
        {/* Mobile-only background gradient */}
        <div className="absolute inset-0 lg:hidden pointer-events-none" 
             style={{ background: "linear-gradient(145deg, #CC0000 0%, #FF0000 45%, #CC0000 70%, #880000 100%)" }} />

        {isBootstrapping ? (
          /* System Bootstrapping View */
          <div className="relative bg-white rounded-[28px] p-6 sm:p-8 w-full max-w-[500px] z-10 shadow-[0_40px_100px_rgba(0,0,0,0.55)] lg:shadow-xl lg:border lg:border-gray-100 animate-fade-in">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-gray-900 leading-none">Bootstrap System</h2>
                <p className="text-xs font-semibold text-gray-400 mt-1">Create the primary administrator account.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsBootstrapping(false)}
                className="px-3 py-1.5 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-wider text-gray-500 hover:bg-gray-50 cursor-pointer transition-all active:scale-[0.97]"
              >
                Back to Login
              </button>
            </div>
            <RegistrationForm
              onClose={() => setIsBootstrapping(false)}
              onSaveSuccess={async () => {
                await checkAdmins(); // Refetch admin status
                setIsBootstrapping(false);
              }}
            />
          </div>
        ) : (
          /* Standard Login View */
          <div className="relative w-full max-w-[420px] z-10">
            <form onSubmit={handleLogin} className="bg-white rounded-[28px] p-8 sm:p-10 shadow-[0_40px_100px_rgba(0,0,0,0.55)] lg:shadow-xl lg:border lg:border-gray-100">
              <div className="flex flex-col items-center mb-8 lg:hidden">
                <AirtelMark size={38} />
                <h2 className="text-[17px] font-black uppercase text-center text-gray-900 leading-snug tracking-wider mt-3">
                  DCIMe
                </h2>
              </div>

              <div className="hidden lg:block mb-8">
                <h2 className="text-2xl font-black text-gray-900">Authenticate</h2>
                <p className="text-sm font-semibold text-gray-400 mt-1">Enter your secure credentials to proceed.</p>
              </div>

              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 tracking-[0.12em] uppercase mb-1.5">Employee ID</label>
                  <input
                    className="w-full px-4 py-3.5 rounded-xl bg-gray-50 border-2 border-gray-100 text-sm font-semibold text-gray-900 outline-none focus:border-red-500 transition-all"
                    placeholder="e.g. ZM-4891"
                    value={empId}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmpId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 tracking-[0.12em] uppercase mb-1.5">Secure Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      className="w-full px-4 py-3.5 pr-11 rounded-xl bg-gray-50 border-2 border-gray-100 text-sm font-semibold text-gray-900 outline-none focus:border-red-500 transition-all"
                      placeholder="••••••••"
                      value={pw}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPw(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                      onClick={() => setShowPw(!showPw)}
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mb-4 text-xs font-bold text-red-500 bg-red-50 p-3 rounded-xl border border-red-100 text-center">
                  {error}
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 rounded-xl font-black text-white text-[13px] tracking-[0.08em] uppercase transition-all hover:opacity-90 active:scale-[0.98] shadow-lg shadow-red-500/30 disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: "#FF0000" }}
                >
                  {isLoading ? "Authenticating..." : "Sign In"}
                </button>
              </div>

              {/* Secure Bootstrapping Trigger — Hidden behind ?setup=true query parameter */}
              {hasAdmins === false && new URLSearchParams(window.location.search).get("setup") === "true" && (
                <div className="mt-6 p-4 rounded-2xl border border-dashed border-red-200 bg-red-50/30 text-center space-y-3 animate-pulse">
                  <div className="flex items-center gap-2 justify-center text-red-600">
                    <ShieldAlert size={16} />
                    <span className="text-[10px] font-black uppercase tracking-wider">Setup Mode Active</span>
                  </div>
                  <p className="text-[11px] font-semibold text-gray-600 leading-normal">
                    No administrator accounts detected. Bootstrap the first NOC Admin account to initialize system security.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsBootstrapping(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <UserPlus size={12} />
                    Bootstrap Admin Account
                  </button>
                </div>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
