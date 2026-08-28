import { FRESHNESS_TONE, ago, describeFreshness, type Cadence, type Freshness } from "@/domain/freshness";

// ─────────────────────────────────────────────────────────────────────────────
// How old a figure is, as a chip.
//
// Deliberately NOT the same component as StatusPill. That one answers "is this
// value acceptable"; this answers "is this value still true". Merging them into
// one chip would force a screen to choose which question to show, and the
// dangerous case is precisely the one where the answers disagree — a reading
// comfortably inside its limits that nobody has taken since yesterday.
//
// A live reading renders NOTHING. The chip is an exception report: if every
// current figure carried a green "up to date" badge, the badge would become
// part of the furniture and the stale one would be read as furniture too.
// ─────────────────────────────────────────────────────────────────────────────

const WORD: Record<Freshness, string> = {
  live:  "Live",
  due:   "Due",
  stale: "Stale",
  cold:  "Not logging",
  never: "Never read"
};

export interface FreshnessPillProps {
  freshness: Freshness;
  /** Drives the tooltip's "40 min ago" and the count of missed rounds. */
  lastReading?: Date | string | null;
  cadence?: Cadence;
  /**
   * Show the chip even when the data is current.
   *
   * For the one place per screen that states the site's overall position, where
   * "Live" is the actual answer somebody came for rather than noise.
   */
  showWhenLive?: boolean;
  /** Append "· 3 h ago" to the chip itself. */
  withAge?: boolean;
  className?: string;
}

export function FreshnessPill({
  freshness, lastReading = null, cadence = "hourly",
  showWhenLive = false, withAge = false, className = ""
}: FreshnessPillProps) {
  if (freshness === "live" && !showWhenLive) return null;

  const tone = FRESHNESS_TONE[freshness];
  const title = lastReading !== null || freshness === "never"
    ? describeFreshness(lastReading, cadence)
    : tone.label;

  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${tone.chip} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.solid}`} aria-hidden="true" />
      {WORD[freshness]}
      {withAge && freshness !== "never" && lastReading && (
        <span className="font-mono font-bold normal-case opacity-80">· {ago(lastReading)}</span>
      )}
    </span>
  );
}

/** The same reading, as a bare dot, where a chip would crowd the row. */
export function FreshnessDot({
  freshness, lastReading = null, cadence = "hourly", className = ""
}: {
  freshness: Freshness;
  lastReading?: Date | string | null;
  cadence?: Cadence;
  className?: string;
}) {
  const tone = FRESHNESS_TONE[freshness];
  return (
    <span
      role="img"
      aria-label={describeFreshness(lastReading, cadence)}
      title={describeFreshness(lastReading, cadence)}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone.solid} ${className}`}
    />
  );
}
