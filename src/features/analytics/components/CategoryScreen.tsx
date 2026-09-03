// src/features/analytics/components/CategoryScreen.tsx
import { useOutletContext } from "react-router";
import { categoryById } from "@/domain/categories";
import { CategoryFleet } from "./CategoryFleet";
import { DetailLink } from "./DetailLink";
import type { AnalyticsOutletContext } from "./AnalyticsLayout";

// ─────────────────────────────────────────────────────────────────────────────
// A category screen for the categories that never got a bespoke one.
//
// IT Load (10 registered assets) and Fire & Safety (2) have registry entries,
// parameters and captured readings, and had no tab at all — the only two of the
// seven defined categories with nowhere to be seen. They do not need the
// hand-built KPI cards the older screens carry, because those cards are the very
// thing that reads one hardcoded metric key. The fleet band answers the question
// directly, so this screen is the band plus a way through to the detail.
// ─────────────────────────────────────────────────────────────────────────────

export function CategoryScreen({ categoryId }: { categoryId: string }) {
  const { range } = useOutletContext<AnalyticsOutletContext>();
  const category = categoryById(categoryId);

  if (!category) {
    return (
      <div className="p-6">
        <p className="text-xs font-bold text-neutral-500">
          No category is defined for “{categoryId}”.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-6 bg-neutral-50/50 p-6 text-neutral-800">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            {category.blurb}
          </span>
          <h2 className="mt-0.5 text-lg font-black uppercase tracking-tight text-neutral-900">
            {category.label}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-10 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-xs font-black uppercase tracking-wider text-neutral-900">
            {range.label}
          </span>
          <DetailLink categoryId={category.id} />
        </div>
      </div>

      <CategoryFleet categoryId={category.id} range={range} />
    </div>
  );
}
