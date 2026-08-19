import { BRAND_PRODUCT } from "@/shared/utils/branding";

export interface BrandMarkProps {
  className?: string;
  size?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGO HIDDEN.
//
// The mark is commented out rather than deleted, and this component still
// exists and still accepts its props, so every call site compiles untouched.
// Restore by deleting the `return null` and uncommenting the block below.
// ─────────────────────────────────────────────────────────────────────────────
export function BrandMark({ className = "", size }: BrandMarkProps) {
  void className; void size; void BRAND_PRODUCT;
  return null;

  /*
  // Code Miracle: multiply incoming size by 1.4 to compensate for transparent padding in Logo.jpg
  const adjustedSize = size ? size * 1.4 : undefined;
  const style = adjustedSize ? { width: adjustedSize, height: adjustedSize } : undefined;
  return (
    <img
      src="/Logo.jpg"
      alt={`${BRAND_PRODUCT} Logo`}
      style={style}
      className={`${className} ${!size && !className ? "h-11" : ""} object-contain transform hover:scale-105 active:scale-95 transition-all duration-200`}
    />
  );
  */
}
