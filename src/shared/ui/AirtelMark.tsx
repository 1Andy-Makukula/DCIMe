import React from "react";

export function AirtelMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="7" fill="#FF0000" />
      <polygon points="14,6 20.5,21 7.5,21" fill="white" />
      <line x1="10" y1="17.5" x2="18" y2="17.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
