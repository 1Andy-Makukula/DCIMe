import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useReadingsRevision } from "./useReadingsRevision";
import { modelFor, type AssetModel } from "@/domain/assetModels";
import {
  freshness, worstFreshness, latestOf,
  type Cadence, type Freshness
} from "@/domain/freshness";
import type { Condition } from "@/shared/api/equipmentCondition";

// ─────────────────────────────────────────────────────────────────────────────
// The place-major spine: every room, everything in it, and how current it is.
//
// WHY THIS IS NOT useCategoryDetail()
// That hook is MEASURE-major — pick "return air temperature" and see the 27 air
// conditioners that record it. It answers "how is this measure doing across the
// estate", which is the right question when you already know what you are
// looking for.
//
// This is the other axis: the site, then a room, then a machine. It is what
// somebody uses when they do NOT yet know where to look — and it is the axis
// the admin screens never had, which is why a reader had to guess which of
// seven tabs would explain a problem they could not yet name.
//
// WHY ONE RPC RATHER THAN A QUERY PER ROOM
// get_asset_freshness returns one row per asset with its last reading, who took
// it, and how much of a normal round arrived. Assembling that in the browser
// would be one query per asset — 43 round trips on this site — or a single
// unfiltered get_series call, which returns a row per parameter per bucket and
// truncates at PostgREST's cap, silently reporting healthy assets as stale.
// ─────────────────────────────────────────────────────────────────────────────

/** One row of public.get_asset_freshness(). */
interface FreshnessRow {
  equipment_id:        string;
  name:                string;
  category:            string;
  room_id:             string | null;
  room_name:           string | null;
  asset_condition:     Condition;
  last_reading:        string | null;
  last_technician:     string | null;
  readings_24h:        number;
  typical_round:       number | null;
  covered_last_round:  number | null;
}

export interface FreshAsset {
  equipmentId:   string;
  name:          string;
  category:      string;
  roomId:        string | null;
  roomName:      string | null;
  condition:     Condition;
  /** The model that stands for this asset's category, or null where none does. */
  model:         AssetModel | null;
  lastReading:   Date | null;
  lastTechnician: string | null;
  readings24h:   number;
  freshness:     Freshness;
  /** How many readings a normal round collects. Null until it has a history. */
  typicalRound:  number | null;
  coveredLastRound: number | null;
  /**
   * True when the last round collected measurably less than a normal one.
   *
   * Null denominators are NOT partial. An asset with no 30-day history has an
   * unknown expectation, and rendering unknown as a shortfall would put a
   * warning on every newly registered machine.
   */
  isPartial:     boolean;
}

export interface FreshRoom {
  id:        string;
  name:      string;
  assets:    FreshAsset[];
  /** Distinct models the room needs, so a screen preloads each once. */
  models:    AssetModel[];
  /** The room is as current as its least recently read asset. */
  freshness: Freshness;
  lastReading: Date | null;
  partialCount: number;
}

export interface SiteFreshnessSummary {
  assets:       number;
  /** Assets whose last round was short of their own normal. */
  partial:      number;
  /** Assets that have missed enough rounds to be stale or worse. */
  behind:       number;
  /** Assets never read at all. */
  never:        number;
  lastReading:  Date | null;
  freshness:    Freshness;
}

export interface UseSiteFreshnessResult {
  rooms:     FreshRoom[];
  /** Assets with no room — rare, but they must not vanish off the screen. */
  unplaced:  FreshAsset[];
  all:       FreshAsset[];
  summary:   SiteFreshnessSummary;
  isLoading: boolean;
  error:     string | null;
  refresh:   () => void;
}

/** database.types.ts predates get_asset_freshness. */
type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

const NO_ROOMS: FreshRoom[] = [];
const NO_ASSETS: FreshAsset[] = [];

export function useSiteFreshness(
  /** Expected reading cadence. Everything on this site is walked hourly. */
  cadence: Cadence = "hourly",
  siteUuid?: string
): UseSiteFreshnessResult {
  const { currentSite } = useCurrentSite();
  const [rows, setRows]     = useState<FreshnessRow[]>([]);
  const [isLoading, setLoad] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [nonce, setNonce]   = useState(0);

  const targetSite = siteUuid ?? currentSite?.id ?? null;
  const revision = useReadingsRevision(targetSite);

  useEffect(() => {
    let cancelled = false;

    // Site context resolves asynchronously. Querying early lets the RPC fall
    // back to the JWT's site, which is not necessarily the one on screen.
    if (!targetSite) { setLoad(true); return; }

    setLoad(true);
    setError(null);
    rpc("get_asset_freshness", { p_site_uuid: targetSite })
      .then((r) => {
        if (cancelled) return;
        if (r.error) throw new Error(r.error.message);
        setRows((r.data as FreshnessRow[] | null) ?? []);
        setLoad(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Could not read how current this site is");
        setRows([]);
        setLoad(false);
      });

    return () => { cancelled = true; };
  }, [targetSite, nonce, revision]);

  // Freshness is time-dependent, so it is derived on render rather than stored.
  // A tab left open overnight would otherwise keep claiming the data is live.
  const all = useMemo<FreshAsset[]>(() => {
    const now = new Date();
    return rows.map((r) => {
      const lastReading = r.last_reading ? new Date(r.last_reading) : null;
      return {
        equipmentId:      r.equipment_id,
        name:             r.name,
        category:         r.category,
        roomId:           r.room_id,
        roomName:         r.room_name,
        condition:        r.asset_condition,
        model:            modelFor(r.category),
        lastReading,
        lastTechnician:   r.last_technician,
        readings24h:      r.readings_24h ?? 0,
        freshness:        freshness(lastReading, cadence, now),
        typicalRound:     r.typical_round,
        coveredLastRound: r.covered_last_round,
        isPartial:
          r.typical_round !== null &&
          r.covered_last_round !== null &&
          r.covered_last_round < r.typical_round
      };
    });
  }, [rows, cadence]);

  const { rooms, unplaced } = useMemo(() => {
    const byRoom = new Map<string, FreshRoom>();
    const loose: FreshAsset[] = [];

    for (const a of all) {
      if (!a.roomId) { loose.push(a); continue; }
      let room = byRoom.get(a.roomId);
      if (!room) {
        room = {
          id: a.roomId,
          name: a.roomName ?? "Unnamed room",
          assets: [],
          models: [],
          freshness: "live",
          lastReading: null,
          partialCount: 0
        };
        byRoom.set(a.roomId, room);
      }
      room.assets.push(a);
    }

    for (const room of byRoom.values()) {
      room.freshness    = worstFreshness(room.assets.map((a) => a.freshness));
      room.lastReading  = latestOf(room.assets.map((a) => a.lastReading));
      room.partialCount = room.assets.filter((a) => a.isPartial).length;

      // Deduplicated: a room with seven air conditioners loads one CRAC model,
      // not seven copies of the same file.
      const seen = new Map<string, AssetModel>();
      for (const a of room.assets) {
        if (a.model && !seen.has(a.model.url)) seen.set(a.model.url, a.model);
      }
      room.models = [...seen.values()];
    }

    // The RPC already orders by room sort_order; preserve it rather than
    // re-sorting alphabetically and losing the walking order of the site.
    return { rooms: [...byRoom.values()], unplaced: loose };
  }, [all]);

  const summary = useMemo<SiteFreshnessSummary>(() => {
    const lastReading = latestOf(all.map((a) => a.lastReading));
    return {
      assets:      all.length,
      partial:     all.filter((a) => a.isPartial).length,
      behind:      all.filter((a) => a.freshness === "stale" || a.freshness === "cold").length,
      never:       all.filter((a) => a.freshness === "never").length,
      lastReading,
      freshness:   worstFreshness(all.map((a) => a.freshness))
    };
  }, [all]);

  return {
    rooms: rooms.length ? rooms : NO_ROOMS,
    unplaced,
    all: all.length ? all : NO_ASSETS,
    summary,
    isLoading,
    error,
    refresh: useCallback(() => setNonce((n) => n + 1), [])
  };
}
