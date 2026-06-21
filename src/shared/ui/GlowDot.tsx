import React from "react";

export function GlowDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: color, boxShadow: `0 0 8px 3px ${color}55` }}
    />
  );
}
