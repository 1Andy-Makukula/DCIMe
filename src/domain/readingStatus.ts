// ─────────────────────────────────────────────────────────────────────────────
// Red, amber, green — decided in one place.
//
// The database owns the decision: public.reading_status(value, min, max,
// warn_min, warn_max) returns exactly these four words, and get_series() and the
// rollups already count against it. This module is the browser's half of the
// same contract — the type, and how each state looks.
//
// It exists because every screen used to decide for itself. ThermalAnalytics
// hardcoded "humidity between 40 and 60 is nominal" and a chart axis of 15-30°C,
// neither from the registry, so two screens could disagree about the same
// reading. Nothing here invents a threshold; it only renders a verdict.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 'unknown' is not a failure and not a pass — it means the parameter has no
 * band configured, so nothing has been checked. Showing it green would claim
 * an all-clear nobody established, which is the whole reason it is separate.
 */
export type ReadingStatus = "ok" | "warn" | "breach" | "unknown";

export interface StatusTone {
  /** Filled chip: background, text, border. */
  chip: string;
  /** Text alone, for a figure that carries its own status. */
  text: string;
  /** A bar or dot — colour only. */
  solid: string;
  /** What the state means, in words, for a tooltip or a screen reader. */
  label: string;
}

export const STATUS_TONE: Record<ReadingStatus, StatusTone> = {
  ok: {
    chip:  "bg-ok-50 text-ok-700 border-ok-200",
    text:  "text-ok-700",
    solid: "bg-ok-500",
    label: "Within its safe range"
  },
  warn: {
    chip:  "bg-warn-50 text-warn-700 border-warn-200",
    text:  "text-warn-700",
    solid: "bg-warn-500",
    label: "Inside the limits but heading the wrong way"
  },
  breach: {
    chip:  "bg-danger-50 text-danger-700 border-danger-200",
    text:  "text-danger-700",
    solid: "bg-danger-500",
    label: "Outside its limits"
  },
  unknown: {
    // Deliberately the same neutral as ordinary text. An unchecked reading
    // should read as unremarkable, not as a fourth kind of alarm.
    chip:  "bg-neutral-50 text-neutral-500 border-neutral-200",
    text:  "text-neutral-500",
    solid: "bg-neutral-300",
    label: "No limits set — this reading is not being checked"
  }
};

/**
 * The same rule as public.reading_status(), for values already in the browser.
 *
 * Kept in step with the SQL by hand, which is a real cost — so prefer the
 * status the database returns wherever a query can carry it, and use this only
 * for a value being typed or held in a form that has not been saved.
 */
export function readingStatus(
  value: number | null,
  min: number | null,
  max: number | null,
  warnMin: number | null,
  warnMax: number | null
): ReadingStatus | null {
  if (value === null) return null;
  if (min === null && max === null && warnMin === null && warnMax === null) return "unknown";
  if ((max !== null && value > max) || (min !== null && value < min)) return "breach";
  if ((warnMax !== null && value > warnMax) || (warnMin !== null && value < warnMin)) return "warn";
  return "ok";
}

/** Worst wins: one breach in a room makes the room a breach. */
export function worstStatus(all: readonly (ReadingStatus | null)[]): ReadingStatus | null {
  const rank: Record<ReadingStatus, number> = { breach: 3, warn: 2, ok: 1, unknown: 0 };
  let out: ReadingStatus | null = null;
  for (const s of all) {
    if (s === null) continue;
    if (out === null || rank[s] > rank[out]) out = s;
  }
  return out;
}
