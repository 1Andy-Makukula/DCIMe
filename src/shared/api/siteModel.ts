import { useEffect, useState } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";

// ─────────────────────────────────────────────────────────────────────────────
// The site's own description of itself — rooms, equipment, readings and the
// order a technician walks them — read from the database.
//
// This replaces SITE_01_blueprint.json as a RUNTIME source. The file described
// 47 assets and 324 readings, and it was the only place any of that existed
// because equipment_parameters, though built for it, was never loaded. It now
// holds 546 parameters, the rooms table holds all 14 rooms, and walking_path
// holds the round — so the file has nothing left to say that the database
// cannot.
//
// The SHAPE is deliberately identical to the blueprint's. Four screens read it
// today and none of their logic needs to change: only where the object comes
// from. Rewriting those screens and moving their source at the same time would
// make any regression impossible to attribute.
//
// The one real difference is that room_id is now a uuid rather than a slug
// ('room_fuel'). Nothing compares against a literal slug any more — the last
// one, a check that kept the generator step permanently on the round, is now
// walking_path.always_visible.
// ─────────────────────────────────────────────────────────────────────────────

export interface SiteMetric {
  id:             string;
  label:          string;
  /**
   * Mirrors equipment_parameters.data_type. Boolean is carried through rather
   * than folded into text: PathRenderer has always had a checkbox branch for
   * compliance checks, and collapsing the type here left it unreachable.
   */
  type:           "number" | "text" | "boolean";
  frequency:      string | null;
  is_constant:    boolean;
  /**
   * ABSENT when there is none, never null.
   *
   * The blueprint JSON simply omitted the key, and two seeding paths in
   * useTelemetryData test `default_value !== undefined` to decide whether a
   * field has something to start from. Returning null instead of omitting would
   * make that test true for every reading and seed all 324 fields with null —
   * which reads on screen as a technician having cleared them.
   */
  default_value?: string;
  carry_forward:  boolean;
  unit:           string | null;
}

export interface SiteEquipment {
  id:         string;
  name:       string;
  category:   string;
  room_id:    string | null;
  sort_order: number | null;
  is_active:  boolean;
  metrics:    SiteMetric[];
}

export interface SiteRoom {
  id:         string;
  name:       string;
  sort_order: number | null;
}

export interface SiteWalkStep {
  step_number:    number;
  name:           string;
  room_id:        string | null;
  equipment_ids:  string[];
  /** Stays on the round even when nothing in it is due — the generator step. */
  always_visible: boolean;
}

export interface SiteModel {
  rooms:        SiteRoom[];
  equipment:    SiteEquipment[];
  walking_path: SiteWalkStep[];
}

const EMPTY: SiteModel = { rooms: [], equipment: [], walking_path: [] };

/** database.types.ts predates walking_path and the loaded registry. */
type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

/**
 * One in-flight request per site, shared by every caller.
 *
 * Three screens ask for this model, and a technician moving between them would
 * otherwise refetch the whole site each time — on a phone, on mobile data, in a
 * plant room. The cache holds the promise rather than the result so concurrent
 * mounts join the same request instead of racing three of them.
 */
const cache = new Map<string, Promise<SiteModel>>();

export function invalidateSiteModel(siteUuid?: string) {
  if (siteUuid) cache.delete(siteUuid);
  else cache.clear();
}

async function loadSiteModel(siteUuid: string): Promise<SiteModel> {
  const [roomRes, equipRes, pathRes] = await Promise.all([
    from("rooms")
      .select("id,room_name,sort_order")
      .eq("site_id", siteUuid)
      .order("sort_order"),
    from("equipment_registry")
      .select(`equipment_id,name,category,room_id,sort_order,is_active,
               equipment_parameters(parameter_name,display_label,data_type,frequency,
                                    is_constant,constant_value,default_value,
                                    carry_forward,capture_mode,unit,display_order)`)
      .eq("site_uuid", siteUuid)
      .order("sort_order"),
    from("walking_path")
      .select("step_number,name,room_id,equipment_ids,always_visible")
      .eq("site_uuid", siteUuid)
      .order("step_number")
  ]);

  const firstError = roomRes.error || equipRes.error || pathRes.error;
  if (firstError) throw new Error(`Could not load the site model: ${firstError.message}`);

  // Decommissioned assets are RETURNED, not filtered. The blueprint listed all
  // 47 and every consumer decides for itself what to do with an inactive one —
  // the walking round hides it, the inventory shows it greyed. Filtering here
  // would silently change three screens at once.
  const equipment: SiteEquipment[] = (equipRes.data ?? [])
    .map((e: any) => ({
      id:         e.equipment_id,
      name:       e.name ?? e.equipment_id,
      category:   e.category,
      room_id:    e.room_id,
      sort_order: e.sort_order,
      is_active:  e.is_active !== false,
      metrics: (e.equipment_parameters ?? [])
        // NOT_APPLICABLE parameters exist so the workbook column prints 'NA'.
        // They are not readings, and a screen that walked them would ask a
        // technician for something this site does not collect.
        .filter((p: any) => p.capture_mode !== "NOT_APPLICABLE")
        .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
        .map((p: any): SiteMetric => {
          // The blueprint carried one value for both jobs; the registry
          // separates the fixed nameplate figure from the suggested starting
          // point. Either can seed a field, so the constant wins where present.
          const seed = p.constant_value ?? p.default_value ?? null;
          const metric: SiteMetric = {
            id:            p.parameter_name,
            label:         p.display_label ?? p.parameter_name,
            type:          p.data_type === "number"  ? "number"
                         : p.data_type === "boolean" ? "boolean"
                         : "text",
            frequency:     p.frequency,
            is_constant:   Boolean(p.is_constant),
            carry_forward: Boolean(p.carry_forward),
            unit:          p.unit ?? null
          };
          if (seed !== null) metric.default_value = String(seed);
          return metric;
        })
    }));

  return {
    rooms: (roomRes.data ?? []).map((r: any): SiteRoom => ({
      id: r.id, name: r.room_name, sort_order: r.sort_order
    })),
    equipment,
    walking_path: (pathRes.data ?? []).map((w: any): SiteWalkStep => ({
      step_number:    w.step_number,
      name:           w.name,
      room_id:        w.room_id,
      equipment_ids:  w.equipment_ids ?? [],
      always_visible: Boolean(w.always_visible)
    }))
  };
}

export function fetchSiteModel(siteUuid: string): Promise<SiteModel> {
  let p = cache.get(siteUuid);
  if (!p) {
    p = loadSiteModel(siteUuid).catch((err) => {
      // A failed load must not be cached, or one bad request on a flaky
      // connection would leave the site permanently unreadable.
      cache.delete(siteUuid);
      throw err;
    });
    cache.set(siteUuid, p);
  }
  return p;
}

export interface UseSiteModelResult {
  model:     SiteModel;
  isLoading: boolean;
  error:     string | null;
  /** Discards the cache and reloads — for after an admin edits the registry. */
  reload:    () => void;
}

export function useSiteModel(): UseSiteModelResult {
  const { currentSite } = useCurrentSite();
  const siteUuid = currentSite?.id ?? null;

  const [model, setModel]   = useState<SiteModel>(EMPTY);
  const [isLoading, setLoad] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [nonce, setNonce]   = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!siteUuid) { setModel(EMPTY); setLoad(true); return; }

    setLoad(true);
    setError(null);
    fetchSiteModel(siteUuid)
      .then((m) => { if (!cancelled) { setModel(m); setLoad(false); } })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Could not load the site model");
        setModel(EMPTY);
        setLoad(false);
      });

    return () => { cancelled = true; };
  }, [siteUuid, nonce]);

  return {
    model,
    isLoading,
    error,
    reload: () => { if (siteUuid) invalidateSiteModel(siteUuid); setNonce((n) => n + 1); }
  };
}
