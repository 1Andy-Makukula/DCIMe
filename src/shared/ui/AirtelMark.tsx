
export interface AirtelMarkProps {
  className?: string;
  size?: number;
}

export function AirtelMark({ className = "", size }: AirtelMarkProps) {
  // Code Miracle: multiply incoming size by 1.4 to compensate for transparent padding in Logo.png
  const adjustedSize = size ? size * 1.4 : undefined;
  const style = adjustedSize ? { width: adjustedSize, height: adjustedSize } : undefined;
  return (
    <img 
      src="/Logo.png" 
      alt="Airtel DCIMe Logo" 
      style={style}
      className={`${className} ${!size && !className ? "h-11" : ""} object-contain transform hover:scale-105 active:scale-95 transition-all duration-200`} 
    />
  );
}
