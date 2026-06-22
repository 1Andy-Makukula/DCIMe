import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { Home, ClipboardEdit, AlertOctagon, UserCheck, LogOut } from "lucide-react";

export function TechLayout() {
  const navigate = useNavigate();

  return (
    <div className="h-screen w-full flex flex-col bg-gray-50 overflow-hidden relative">
      {/* Top Header */}
      <header className="h-14 bg-white border-b border-gray-100 px-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-lg font-black tracking-tight text-red-500">
            DCIMe<span className="text-gray-900">.</span>
          </span>
          <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full uppercase tracking-wider">
            Field Portal
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Logout Button */}
          <button 
            onClick={() => navigate("/")}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
          {/* User Avatar */}
          <div className="w-8 h-8 rounded-full bg-red-500 text-white font-bold text-xs flex items-center justify-center shadow-sm">
            AM
          </div>
        </div>
      </header>

      {/* Viewport */}
      <main className="flex-1 overflow-y-auto p-4 pb-20">
        <Outlet />
      </main>

      {/* Fixed Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-16 flex items-center justify-around px-2 z-50">
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
          <ClipboardEdit size={20} className="mb-0.5" />
          <span className="text-[9px] tracking-wide">Log</span>
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
