// src/features/analytics/hooks/useReadingsRevision.ts
import { useState } from "react";
import { useRealtimeTable } from "@/shared/api/realtime";

/**
 * A counter that advances whenever this site's readings change.
 *
 * WHY THIS EXISTS
 * The admin portal has two data layers. The dashboards, NOC overview and
 * notifications read `telemetry_logs` and subscribe to it, so they update on
 * their own. The facility hierarchy — reading freshness, asset, room and
 * category detail, technician activity, the capacity ledger — reads the
 * normalised `readings` table instead, and had no live channel of any kind.
 * Those hooks refetch only when the site, the date range or the selected id
 * changes, so a technician could log three rounds while an admin sat on
 * Facility Overview and nothing on screen would move until a reload.
 *
 * WHY IT LISTENS TO telemetry_logs AND NOT readings
 * `readings` is not in the supabase_realtime publication, and adding it would
 * be the wrong fix: one hourly round writes about 270 reading rows, so a
 * subscription there would fire 270 times for a single save and stampede the
 * refetch. fan_out_readings() runs inside the same transaction as the
 * telemetry_logs write, so by the time that row's event arrives the readings
 * are already committed. One event per round, and it is the event we want.
 *
 * Include the returned number in an effect's dependency list to have it re-run
 * on each save.
 */
export function useReadingsRevision(siteUuid: string | null | undefined): number {
  const [revision, setRevision] = useState(0);

  useRealtimeTable({
    table: "telemetry_logs",
    // Scoped to the site on screen. RLS already limits a session to its own
    // site, but an unfiltered subscription would still wake every hook on any
    // site's write once that changes.
    filter: siteUuid ? `site_uuid=eq.${siteUuid}` : undefined,
    enabled: Boolean(siteUuid),
    onChange: () => setRevision((n) => n + 1)
  });

  return revision;
}
