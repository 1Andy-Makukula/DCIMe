import { PRODUCT_STEM, PRODUCT_SUFFIX } from "@/shared/utils/branding";

export interface WordmarkProps {
  className?: string;
  /** Class applied to the accented suffix. Defaults to the brand colour. */
  accentClassName?: string;
}

// The product name as it is drawn: stem in the inherited colour, suffix in the
// brand. Previously hand-written as JSX in four layouts, which meant a rename
// had to find all four and a brand-colour change had to edit each one.
export function Wordmark({
  className = "",
  accentClassName = "text-brand-500"
}: WordmarkProps) {
  return (
    <span className={className}>
      {PRODUCT_STEM}
      <span className={accentClassName}>{PRODUCT_SUFFIX}</span>
    </span>
  );
}
