import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { categoryById } from "@/domain/categories";

// ─────────────────────────────────────────────────────────────────────────────
// The way through from an overview to the full record.
//
// Each analytics page shows a handful of headline figures. This is the door to
// everything behind them: every reading, the technician who took it, the
// per-room breakdown and the written summary. A summary with no route back to
// its evidence is where arguments about numbers start.
// ─────────────────────────────────────────────────────────────────────────────

export function DetailLink({ categoryId, label, variant = "solid", className = "" }: {
  categoryId: string;
  /** Defaults to "See full detail". Name the category where a page links to
      more than one, or both buttons read identically. */
  label?: string;
  variant?: "solid" | "quiet";
  className?: string;
}) {
  const category = categoryById(categoryId);
  if (!category) return null;

  const skin = variant === "solid"
    ? "bg-neutral-900 text-white hover:bg-neutral-700"
    : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50";

  return (
    <Link
      to={`/admin/analytics/detail/${categoryId}`}
      title={`Every ${category.label} reading, with technician attribution`}
      className={`print:hidden flex h-10 items-center gap-1.5 rounded-xl px-4 text-[11px] font-black uppercase tracking-wider transition-colors ${skin} ${className}`}
    >
      {label ?? "See full detail"}
      <ArrowUpRight size={14} />
    </Link>
  );
}

export default DetailLink;
