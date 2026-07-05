import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { Home, Activity, AlertOctagon, UserCheck, LogOut } from "lucide-react";
import { AirtelMark } from "@/shared/ui";
import { useAuth } from "@/shared/context/AuthContext";

export interface TechUser {
  id: string;       // e.g., "ZM-4891"
  name: string;     // e.g., "Peter M."
  initials: string; // e.g., "PM"
}

export function TechLayout() {
  const navigate = useNavigate();
  const { employee, logout, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !employee) {
      navigate("/");
    }
  }, [employee, isLoading, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Loading Field Session...</span>
        </div>
      </div>
    );
  }

  const name = employee?.full_name || "Field Tech";
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.substring(0, 2).toUpperCase();

  const user = {
    id: employee?.employee_id || "EMP-UNKNOWN",
    name,
    initials,
  };

  return (
    <div className="h-screen w-full flex flex-col bg-gray-50 overflow-hidden relative">
      {/* Top Header */}
      <header className="h-14 bg-white border-b border-gray-100 px-4 flex items-center justify-between shrink-0 z-10 print:hidden">
        <div className="flex items-center gap-2.5">
          <AirtelMark size={28} />
          <div className="flex flex-col">
            <span className="text-[13px] font-black tracking-tight text-gray-900 leading-none">
              DCIMe<span className="text-red-500">_Engine</span>
            </span>
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mt-1">
              Field Portal
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Logout Button */}
          <button 
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
          {/* User Avatar */}
          <div 
            className="w-8 h-8 rounded-full bg-red-500 text-white font-bold text-xs flex items-center justify-center shadow-sm"
            title={user?.name || "Loading..."}
          >
            {user ? user.initials : "..."}
          </div>
        </div>
      </header>

      {/* Viewport */}
      <main className="flex-1 overflow-y-auto p-4 pb-20">
        <Outlet context={{ user }} />
      </main>

      {/* Fixed Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-16 flex items-center justify-around px-2 z-[9999] print:hidden">
        <NavLink
          to="/tech"
          end
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-2 text-center transition-all ${
              isActive ? "text-red-500 font-bold scale-105" : "text-gray-400 hover:text-gray-600"
            }`
          }
        >
          <Home size={20} className="mb-0.5" />
          <span className="text-[9px] tracking-wide">Home</span>
        </NavLink>

        <NavLink
          to="/tech/log"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-2 text-center transition-all ${
              isActive ? "text-red-500 font-bold scale-105" : "text-gray-400 hover:text-gray-600"
            }`
          }
        >
          <Activity size={20} className="mb-0.5" />
          <span className="text-[9px] tracking-wide">Tracking</span>
        </NavLink>

        <NavLink
          to="/tech/incident"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-2 text-center transition-all ${
              isActive ? "text-red-500 font-bold scale-105" : "text-gray-400 hover:text-gray-600"
            }`
          }
        >
          <AlertOctagon size={20} className="mb-0.5" />
          <span className="text-[9px] tracking-wide">Incident</span>
        </NavLink>

        <NavLink
          to="/tech/handover"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-2 text-center transition-all ${
              isActive ? "text-red-500 font-bold scale-105" : "text-gray-400 hover:text-gray-600"
            }`
          }
        >
          <UserCheck size={20} className="mb-0.5" />
          <span className="text-[9px] tracking-wide">Handover</span>
        </NavLink>
      </nav>
    </div>
  );
}
