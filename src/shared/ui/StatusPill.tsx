import { STATUS_TONE, type ReadingStatus } from "@/domain/readingStatus";

// ─────────────────────────────────────────────────────────────────────────────
// A reading's verdict, as a chip.
//
// Colour is never the only signal: every pill carries a word as well, because
// red and amber are the same chip to a colour-blind reader and the whole point
// is that the state can be read at a glance.
// ─────────────────────────────────────────────────────────────────────────────

const WORD: Record<ReadingStatus, string> = {
  ok:      "OK",
  warn:    "Watch",
  breach:  "Breach",
  unknown: "Unchecked"
};

export function StatusPill({ status, className = "" }: {
  status: ReadingStatus | null;
  className?: string;
}) {
  // No reading at all is not a state to label — an empty cell says it better
  // than a chip claiming to know something.
  if (status === null) return null;
  const tone = STATUS_TONE[status];

  return (
    <span
      title={tone.label}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${tone.chip} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.solid}`} aria-hidden="true" />
      {WORD[status]}
    </span>
  );
}

/** The same verdict as a bare dot, where a chip would crowd the row. */
export function StatusDot({ status, className = "" }: {
  status: ReadingStatus | null;
  className?: string;
}) {
  if (status === null) return null;
  const tone = STATUS_TONE[status];
  return (
    <span
      role="img"
      aria-label={tone.label}
      title={tone.label}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone.solid} ${className}`}
    />
  );
}
