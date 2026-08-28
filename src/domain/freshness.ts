// ─────────────────────────────────────────────────────────────────────────────
// How old is this number, and does that matter yet.
//
// WHY THIS EXISTS
// The admin screens show figures with no indication of when they were taken.
// ThermalAnalytics reads telLogs[0] — whatever row happens to be most recent —
// and renders its zone temperatures identically whether the reading landed four
// minutes ago or four hours ago. A technician who missed three rounds and one
// who is mid-round produce the same-looking screen, so a reader assumes current
// and is not told otherwise.
//
// That is not a missing caption. It is a missing STATE: staleness has to be
// visible before the number is read, or the caption gets skipped exactly when
// it matters.
//
// FRESHNESS IS NOT STATUS
// readingStatus answers "is this value acceptable". This answers "is this value
// still true". They are independent — a perfectly in-range temperature from six
// hours ago is green and worthless — so they are separate modules with separate
// tones, and a screen shows both rather than blending them into one verdict.
//
// AGE IS RELATIVE TO CADENCE
// Three hours without a reading is a missed round on an hourly parameter and
// completely normal on a daily one. An absolute clock would flag every daily
// reading as stale by mid-morning, so everything here is measured in EXPECTED
// INTERVALS, taken from the registry's own frequency.
// ─────────────────────────────────────────────────────────────────────────────

/** How often a reading is expected. Mirrors equipment_parameters.frequency. */
export type Cadence = "hourly" | "2-hour" | "4-hour" | "daily";

/**
 * 'live' is deliberately unremarkable rather than green.
 *
 * A permanent "data is fine" badge on every tile trains people to stop seeing
 * that corner of the card, which is the corner the warning has to appear in.
 * So fresh data says nothing and only decay speaks up.
 */
export type Freshness = "live" | "due" | "stale" | "cold" | "never";

const CADENCE_MS: Record<Cadence, number> = {
  hourly: 3_600_000,
  "2-hour": 7_200_000,
  "4-hour": 14_400_000,
  daily: 86_400_000
};

/**
 * Where each state begins, counted in expected intervals.
 *
 * The 1.5 is a grace, not a rounding. A round takes time to walk: the 14:00
 * slot may genuinely be logged at 14:40, and calling that late would put an
 * amber pip on a site where nothing is wrong. Past three intervals a round has
 * been missed outright, and past eight the parameter is not being logged at all
 * rather than logged late — which is a different conversation with a different
 * person, so it gets its own state.
 */
const LIVE_UNTIL  = 1.5;
const DUE_UNTIL   = 3;
const STALE_UNTIL = 8;

export interface FreshnessTone {
  /** Filled chip: background, text, border. */
  chip: string;
  /** Text alone, beside a figure that carries its own age. */
  text: string;
  /** A dot or bar — colour only. */
  solid: string;
  /**
   * Applied to the figure itself as it decays, so a stale tile reads as faded
   * before anything is consciously parsed. Empty for live: current data must
   * render at full strength.
   */
  figure: string;
  /** What the state means, in words, for a tooltip or a screen reader. */
  label: string;
}

export const FRESHNESS_TONE: Record<Freshness, FreshnessTone> = {
  live: {
    chip:   "bg-neutral-50 text-neutral-500 border-neutral-200",
    text:   "text-neutral-500",
    solid:  "bg-ok-500",
    figure: "",
    label:  "Current"
  },
  due: {
    chip:   "bg-warn-50 text-warn-700 border-warn-200",
    text:   "text-warn-700",
    solid:  "bg-warn-400",
    figure: "opacity-90",
    label:  "This round is late"
  },
  stale: {
    chip:   "bg-warn-50 text-warn-800 border-warn-300",
    text:   "text-warn-800",
    solid:  "bg-warn-500",
    figure: "opacity-70",
    label:  "Rounds have been missed — this may no longer be true"
  },
  cold: {
    chip:   "bg-danger-50 text-danger-700 border-danger-200",
    text:   "text-danger-700",
    solid:  "bg-danger-500",
    figure: "opacity-60",
    label:  "Not being logged"
  },
  never: {
    // Neutral, not red. Nothing has failed — this asset has simply never been
    // read, which is a gap in coverage rather than a fault in the equipment.
    chip:   "bg-neutral-50 text-neutral-400 border-dashed border-neutral-300",
    text:   "text-neutral-400",
    solid:  "bg-neutral-300",
    figure: "opacity-50",
    label:  "Never read"
  }
};

/**
 * How stale a reading is, in expected intervals rather than in clock time.
 *
 * `now` is injectable so a screen can render a historical window against the
 * end of that window instead of against the wall clock — a report printed for
 * last March must not mark every reading in it as cold.
 */
export function freshness(
  lastSeen: Date | string | null,
  cadence: Cadence = "hourly",
  now: Date = new Date()
): Freshness {
  if (!lastSeen) return "never";

  const seen = lastSeen instanceof Date ? lastSeen : new Date(lastSeen);
  if (Number.isNaN(seen.getTime())) return "never";

  const intervals = (now.getTime() - seen.getTime()) / CADENCE_MS[cadence];

  // A reading timestamped in the future is a clock problem, not a freshness
  // one. Treated as current: the alternative is an alarming red badge that
  // sends somebody to look at the wrong system.
  if (intervals < LIVE_UNTIL)  return "live";
  if (intervals < DUE_UNTIL)   return "due";
  if (intervals < STALE_UNTIL) return "stale";
  return "cold";
}

/** How many expected readings have been missed. 0 while still inside grace. */
export function roundsMissed(
  lastSeen: Date | string | null,
  cadence: Cadence = "hourly",
  now: Date = new Date()
): number {
  if (!lastSeen) return 0;
  const seen = lastSeen instanceof Date ? lastSeen : new Date(lastSeen);
  if (Number.isNaN(seen.getTime())) return 0;
  const intervals = (now.getTime() - seen.getTime()) / CADENCE_MS[cadence];
  return Math.max(0, Math.floor(intervals));
}

/**
 * "40 min ago", "3 h ago", "2 d ago".
 *
 * Deliberately coarse past the first hour. A reader deciding whether to trust a
 * number needs the order of magnitude, and "3 h 47 min ago" spends precision on
 * a distinction nobody acts on.
 */
export function ago(lastSeen: Date | string | null, now: Date = new Date()): string {
  if (!lastSeen) return "never";
  const seen = lastSeen instanceof Date ? lastSeen : new Date(lastSeen);
  if (Number.isNaN(seen.getTime())) return "never";

  const mins = (now.getTime() - seen.getTime()) / 60_000;
  if (mins < 1)    return "just now";
  if (mins < 90)   return `${Math.round(mins)} min ago`;
  if (mins < 2880) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}

/**
 * The whole sentence, for a tooltip or a banner.
 *
 * Says what was missed as well as how long it has been, because "5 h ago" asks
 * the reader to know the cadence before they can tell whether that is bad.
 */
export function describeFreshness(
  lastSeen: Date | string | null,
  cadence: Cadence = "hourly",
  now: Date = new Date()
): string {
  const state = freshness(lastSeen, cadence, now);
  if (state === "never") return "No reading has ever been recorded for this.";

  const when = ago(lastSeen, now);
  const missed = roundsMissed(lastSeen, cadence, now);

  switch (state) {
    case "live":
      return `Last read ${when}.`;
    case "due":
      return `Last read ${when} — the next ${cadence} round is due.`;
    case "stale":
      return `Last read ${when} — ${missed} ${cadence} round${missed === 1 ? "" : "s"} missed. This figure may no longer be true.`;
    case "cold":
      return `Last read ${when} — ${missed} rounds missed. This is not being logged.`;
  }
}

/** Oldest wins: a room is as stale as its least recently read asset. */
export function worstFreshness(all: readonly Freshness[]): Freshness {
  const rank: Record<Freshness, number> = {
    never: 4, cold: 3, stale: 2, due: 1, live: 0
  };
  let out: Freshness = "live";
  for (const f of all) if (rank[f] > rank[out]) out = f;
  return out;
}

/** The most recent of a set of timestamps, or null when none are valid. */
export function latestOf(all: readonly (Date | string | null)[]): Date | null {
  let out: Date | null = null;
  for (const t of all) {
    if (!t) continue;
    const d = t instanceof Date ? t : new Date(t);
    if (Number.isNaN(d.getTime())) continue;
    if (out === null || d > out) out = d;
  }
  return out;
}
