import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { AirtelMark, TopologyBG } from "@/shared/ui";

export interface LoginFormProps {
  onAdmin: () => void;
  onField: () => void;
}

export function LoginForm({ onAdmin, onField }: LoginFormProps) {
  const [showPw, setShowPw] = useState(false);
  const [empId, setEmpId] = useState("");
  const [pw, setPw] = useState("");

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
          <h1 className="text-5xl font-black text-white tracking-tight leading-tight">
            NTC Infrastructure <br/> Management
          </h1>
          <p className="mt-6 text-red-100 text-lg max-w-lg font-medium">
            The Master Topology & Telemetry Ingestion Engine for Airtel NTC ZM-0874.
          </p>
        </div>
      </div>

      {/* RIGHT SIDE: The Login Form (Centered on mobile, right-aligned on PC) */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 lg:p-12 relative bg-[#0C0D0D] lg:bg-gray-50">
        
        {/* Mobile-only background gradient */}
        <div className="absolute inset-0 lg:hidden pointer-events-none" 
             style={{ background: "linear-gradient(145deg, #CC0000 0%, #FF0000 45%, #CC0000 70%, #880000 100%)" }} />

        <div className="relative bg-white rounded-[28px] p-8 sm:p-10 w-full max-w-[420px] z-10 shadow-[0_40px_100px_rgba(0,0,0,0.55)] lg:shadow-xl lg:border lg:border-gray-100">
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <AirtelMark size={38} />
            <h2 className="text-[17px] font-bold text-center text-gray-900 leading-snug mt-3">
              NTC Management
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
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
                  onClick={() => setShowPw(!showPw)}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={onAdmin}
              className="w-full py-4 rounded-xl font-black text-white text-[13px] tracking-[0.08em] uppercase transition-all hover:opacity-90 active:scale-[0.98] shadow-lg shadow-red-500/30"
              style={{ backgroundColor: "#FF0000" }}
            >
              Log In · Admin NOC
            </button>
            <button
              onClick={onField}
              className="w-full py-4 rounded-xl font-black text-[13px] tracking-[0.08em] uppercase border-2 transition-all hover:bg-red-50 active:scale-[0.98]"
              style={{ borderColor: "#FF0000", color: "#FF0000" }}
            >
              Log In · Field Tech
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
