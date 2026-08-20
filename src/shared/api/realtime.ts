import { useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// One way to subscribe to a table.
//
// THE CRASH THIS EXISTS TO PREVENT
//   "cannot add `postgres_changes` callbacks for realtime:<topic> after
//    `subscribe()`"
//
// supabase-js REUSES a channel when you ask for a topic that already exists.
// Sixteen call sites each built their own channel with a deterministic name
// (`incidents_realtime_${siteId}` and friends) and two of them used the SAME
// name. removeChannel() is asynchronous and nothing awaited it, so on a quick
// unmount/remount — or two components mounting together — the second caller
// got back the first one's already-joined channel. Calling .on() on a joined
// channel throws, and the throw happened inside an effect, which unmounted the
// tree to a black screen.
//
// Two things make that impossible here:
//   1. every subscription gets a unique topic, so a channel is never shared
//   2. .on() is always called before .subscribe(), by construction
//
// The callback is held in a ref rather than being an effect dependency. A
// caller passing an inline arrow would otherwise tear down and rebuild the
// subscription on every render — which is the churn that made the collision
// likely in the first place.
// ─────────────────────────────────────────────────────────────────────────────

export interface RealtimePayload {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

export interface RealtimeTableOptions {
  /** Table in the `public` schema, e.g. "incidents". */
  table: string;
  /**
   * PostgREST filter, e.g. `site_uuid=eq.${siteId}`.
   *
   * NOTE: filters on any column other than the primary key need
   * REPLICA IDENTITY FULL on the table, or UPDATE and DELETE events carry only
   * the key and are silently dropped. See 20260828_realtime_publication.sql.
   */
  filter?: string;
  /** Defaults to every event. */
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  /** Skip while false — e.g. before the site is known. */
  enabled?: boolean;
  /**
   * Runs on each change. Identity may change freely between renders.
   *
   * The payload carries `new` / `old` rows; most callers ignore it and just
   * refetch, but some apply the change directly.
   */
  onChange: (payload: RealtimePayload) => void;
}

let seq = 0;

export function useRealtimeTable({
  table,
  filter,
  event = "*",
  enabled = true,
  onChange
}: RealtimeTableOptions): void {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!enabled) return;

    // Unique per subscription instance. A counter plus a random suffix so two
    // components mounting in the same tick cannot land on the same topic.
    const topic = `rt_${table}_${++seq}_${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase.channel(topic);

    channel.on(
      // supabase-js types this as a literal union it cannot infer from a
      // variable; the shape below is correct for postgres_changes.
      "postgres_changes" as never,
      { event, schema: "public", table, ...(filter ? { filter } : {}) } as never,
      ((payload: RealtimePayload) => cb.current(payload)) as never
    );

    channel.subscribe();

    return () => {
      // Fire and forget: the promise only reports the unsubscribe round trip,
      // and the unique topic means a lingering channel can never be handed to
      // the next mount.
      supabase.removeChannel(channel);
    };
  }, [table, filter, event, enabled]);
}
