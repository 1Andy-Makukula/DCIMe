import React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export interface AccordionSectionProps {
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function AccordionSection({
  title,
  icon,
  isOpen,
  onToggle,
  children,
}: AccordionSectionProps) {
  return (
    <div className="border-b border-gray-100">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
            style={{ backgroundColor: isOpen ? "#FF0000" : "#F3F4F6" }}
          >
            <span style={{ color: isOpen ? "white" : "#888" }}>{icon}</span>
          </div>
          <span className="font-bold text-[14px] text-gray-800">{title}</span>
        </div>
        {isOpen ? <ChevronUp size={15} color="#bbb" /> : <ChevronDown size={15} color="#bbb" />}
      </button>
      {isOpen && (
        <div className="px-5 pb-5 pt-1" style={{ backgroundColor: "#FAFAFA" }}>
          {children}
        </div>
      )}
    </div>
  );
}
