import React, { useState } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { AirtelMark, TopologyBG } from "@/shared/ui";
import { supabase } from "@/shared/api/supabaseClient";

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

  const loginAttemptRef = React.useRef(0);

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

      authData = (result as any).data;
      authError = (result as any).error;
    } catch (err: any) {
      if (currentAttempt !== loginAttemptRef.current) return;
      setError(err.message || "Login failed. Please try again.");
      setIsLoading(false);
      return;
    }

    if (authError || !authData?.user) {
      setError("Invalid credentials. Please check your Employee ID and password.");
      setIsLoading(false);
      return;
    }

    // 4. Fetch the employee profile to determine role
    try {
      const { data: empData, error: empError } = await supabase
        .from("employees")
        .select("role, full_name, status")
        .eq("auth_id", authData.user.id)
        .maybeSingle();

      if (currentAttempt !== loginAttemptRef.current) return;

      if (empError || !empData) {
        setError("Account profile not found. Please contact your administrator.");
        setIsLoading(false);
        return;
      }

      // 4b. Hard-block revoked accounts: kill the just-created session.
      if ((empData as any).status === "Revoked") {
        await supabase.auth.signOut();
        setError("Access to this account has been revoked. Contact your NOC administrator.");
        setIsLoading(false);
        return;
      }

      // 5. Route based on role

      if (empData.role === "ADMIN") {
        navigate("/admin");
      } else {
        navigate("/tech");
      }
    } catch (err: any) {
      if (currentAttempt !== loginAttemptRef.current) return;
      setError("Failed to load account profile. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#090A0C] relative overflow-hidden font-sans">
      
      {/* Ambient background glow effects (Mobile & Desktop) */}
      <div className="absolute top-[-10%] left-[-10%] w-[350px] h-[350px] rounded-full bg-red-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[350px] h-[350px] rounded-full bg-red-800/15 blur-[120px] pointer-events-none" />

      {/* LEFT SIDE: Hero Graphic (Desktop 'lg' screens) */}
      <div className="hidden lg:flex flex-1 relative flex-col items-center justify-center overflow-hidden" 
           style={{ background: "linear-gradient(145deg, #B30000 0%, #E60000 45%, #770000 100%)" }}>
        <div className="absolute inset-0 opacity-25"><TopologyBG /></div>
        <div className="relative z-10 text-center flex flex-col items-center px-12">
          <div className="bg-white p-7 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.35)] mb-8 transform hover:scale-105 transition-transform">
            <AirtelMark size={90} />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight leading-tight uppercase drop-shadow-sm">
            DATA CENTER INFRASTRUCTURE <br/> MANAGEMENT ENGINE
          </h1>
          <p className="mt-3 text-red-100 text-2xl font-black tracking-widest uppercase">
            DCIMe
          </p>
        </div>
      </div>

      {/* RIGHT SIDE: Content Card Area */}
      <div className="flex-1 flex flex-col justify-center items-center p-5 sm:p-8 lg:p-12 relative z-10 bg-[#090A0C] lg:bg-gray-50">
        
        {/* Mobile-only background pattern overlay */}
        <div className="absolute inset-0 lg:hidden pointer-events-none opacity-20"><TopologyBG /></div>

        {/* Standard Login View Card */}
        <div className="relative w-full max-w-[420px] z-10">
          <form 
            onSubmit={handleLogin} 
            className="bg-slate-900/90 lg:bg-white border border-white/10 lg:border-gray-100 rounded-[32px] p-7 sm:p-10 shadow-[0_30px_90px_rgba(0,0,0,0.85)] lg:shadow-xl backdrop-blur-2xl transition-all"
          >
            {/* Mobile Header: Huge Logo + Modern Badge */}
            <div className="flex flex-col items-center mb-8 lg:hidden">
              <div className="bg-white p-5 rounded-2xl shadow-[0_15px_35px_rgba(230,0,0,0.3)] border border-red-100/20 mb-4 transform hover:scale-105 transition-transform">
                <AirtelMark size={85} />
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-[0.18em]">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                DCIMe Engine
              </div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">
                Data Center Telemetry Access
              </h2>
            </div>

            {/* Desktop Header */}
            <div className="hidden lg:block mb-8">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Authenticate</h2>
              <p className="text-sm font-semibold text-gray-400 mt-1">Enter your secure credentials to proceed.</p>
            </div>

            {/* Inputs Container */}
            <div className="space-y-4 mb-7">
              <div>
                <label className="block text-[10px] font-black text-gray-300 lg:text-gray-400 tracking-[0.14em] uppercase mb-1.5">
                  Employee ID
                </label>
                <input
                  className="w-full px-4 py-3.5 rounded-xl bg-white/5 lg:bg-gray-50 border border-white/10 lg:border-gray-200 text-sm font-semibold text-white lg:text-gray-900 placeholder-gray-500 lg:placeholder-gray-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                  placeholder="e.g. ZM-4891"
                  value={empId}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmpId(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-300 lg:text-gray-400 tracking-[0.14em] uppercase mb-1.5">
                  Secure Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    className="w-full px-4 py-3.5 pr-11 rounded-xl bg-white/5 lg:bg-gray-50 border border-white/10 lg:border-gray-200 text-sm font-semibold text-white lg:text-gray-900 placeholder-gray-500 lg:placeholder-gray-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                    placeholder="••••••••"
                    value={pw}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPw(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 lg:hover:text-gray-700 transition-colors cursor-pointer"
                    onClick={() => setShowPw(!showPw)}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-5 text-xs font-bold text-red-400 lg:text-red-600 bg-red-950/40 lg:bg-red-50 p-3.5 rounded-xl border border-red-800/40 lg:border-red-200 text-center leading-relaxed animate-fade-in">
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 rounded-xl font-black text-white text-[13px] tracking-[0.12em] uppercase transition-all hover:bg-red-600 active:scale-[0.98] shadow-lg shadow-red-600/30 disabled:opacity-50 cursor-pointer bg-red-600"
              >
                {isLoading ? "Authenticating..." : "Sign In"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
