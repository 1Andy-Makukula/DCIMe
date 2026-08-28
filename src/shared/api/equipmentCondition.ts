import { useEffect, useState } from "react";
import { supabase } from "@/shared/api/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Which assets exist in a category, and what state each is in.
//
// WHY THIS IS NOT useSiteEquipment()
// That hook serves the reading FORM: every asset grouped by room, carrying its
// full parameter list, because a technician walking a round needs all of it. A
// picker needs three fields — id, name, condition — and pulling several hundred
// parameter rows to render five chips is the wrong shape.
//
// It also cannot answer the question. equipment_condition carries the CONDITION
// (working, faulty, not working, decommissioned) that useSiteEquipment has no
// notion of, and showing a generator without saying whether it is serviceable
// is most of the point of showing it.
//
// So: a second, deliberately narrow read. Flagged as a new path rather than
// slipped in — the alternative was widening the form's cached fetch to answer
// an unrelated question.
// ─────────────────────────────────────────────────────────────────────────────

export type Condition =
  | "ONLINE" | "DEGRADED" | "OFFLINE" | "COMMISSIONED" | "DECOMMISSIONED";

export interface EquipmentCondition {
  equipment_id: string;
  name: string;
  category: string;
  room_id: string | null;
  is_active: boolean;
  condition: Condition;
  last_comment: string | null;
  last_flagged_at: string | null;
  last_flagged_by: string | null;
}

/** How each condition reads on screen, and which token carries it. */
export const CONDITION_TONE: Record<Condition, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  ONLINE:         { label: "Working",        tone: "ok" },
  COMMISSIONED:   { label: "Working",        tone: "ok" },
  DEGRADED:       { label: "Faulty",         tone: "warn" },
  OFFLINE:        { label: "Not working",    tone: "danger" },
  DECOMMISSIONED: { label: "Decommissioned", tone: "neutral" }
};

type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

export async function fetchEquipmentCondition(
  siteUuid: string,
  categories?: string[]
): Promise<EquipmentCondition[]> {
  let q = from("equipment_condition").select("*").eq("site_uuid", siteUuid);
  if (categories?.length) q = q.in("category", categories);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data as EquipmentCondition[] | null) ?? [])
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function useEquipmentCondition(
  siteUuid: string | null,
  categories?: string[]
) {
  const [items, setItems] = useState<EquipmentCondition[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Joined so the effect does not refire on a fresh array with identical
  // contents, which a caller writing categories={["GENERATOR"]} inline produces
  // on every render.
  const key = categories?.join(",") ?? "";

  useEffect(() => {
    let cancelled = false;
    if (!siteUuid) { setItems([]); setLoading(false); return; }

    setLoading(true);
    setError(null);
    fetchEquipmentCondition(siteUuid, key ? key.split(",") : undefined)
      .then((r) => { if (!cancelled) { setItems(r); setLoading(false); } })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Could not load equipment");
        setItems([]);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [siteUuid, key]);

  return { items, isLoading, error };
}
