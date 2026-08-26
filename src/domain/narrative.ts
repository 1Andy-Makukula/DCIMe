import type { SeriesPoint } from "./series";
import type { ReadingStatus } from "./readingStatus";

// ─────────────────────────────────────────────────────────────────────────────
// Saying in words what the chart shows.
//
// Written from the SAME rollup rows the chart is drawn from, so the prose and
// the picture cannot disagree. Nothing here re-reads the database or
// re-averages anything — if a sentence and a line ever contradict each other,
// that is a bug in one function rather than a difference of opinion between two.
//
// WHAT IT WILL NOT DO
// It does not explain WHY a reading moved. It has temperatures, not causes, and
// a sentence like "the rise is due to the failed aircon" would be invention
// dressed as analysis. It reports what happened, how far outside, for how long,
// and who was on shift — and leaves the cause to the person who can walk in and
// look.
// ─────────────────────────────────────────────────────────────────────────────

export interface NarrativeInput {
  /** What is being described — "Server Room temperature". */
  subject: string;
  unit: string | null;
  points: SeriesPoint[];
  /** The same query over the preceding window, when there is one. */
  previous?: SeriesPoint[] | null;
  /** How the period reads in a sentence — "August", "the last 7 days". */
  periodLabel: string;
  /** Readings expected in the window, when the cadence makes that knowable. */
  expected?: number | null;
}

export interface NarrativeParagraph {
  /** Drives the tone of the block on screen. */
  tone: ReadingStatus;
  text: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** Weighted mean across buckets — never the mean of the bucket means. */
function weightedAvg(points: SeriesPoint[]): number | null {
  let sum = 0, n = 0;
  for (const p of points) {
    if (p.avg_num === null || p.n_numeric === 0) continue;
    sum += p.avg_num * p.n_numeric;
    n += p.n_numeric;
  }
  return n > 0 ? sum / n : null;
}

export function buildNarrative(input: NarrativeInput): NarrativeParagraph[] {
  const { subject, unit, points, previous, periodLabel, expected } = input;
  const u = unit ? ` ${unit}` : "";
  const out: NarrativeParagraph[] = [];

  const readings = points.reduce((a, p) => a + p.n_numeric, 0);
  if (readings === 0) {
    // Labels are never lowercased: "UPS Battery Percent" becomes "ups battery
    // percent", which reads as a mistake rather than as a sentence.
    return [{
      tone: "unknown",
      text: `No readings of ${subject} were recorded in ${periodLabel}.`
    }];
  }

  const avg = weightedAvg(points);
  const highs = points.filter((p) => p.max_num !== null);
  const lows  = points.filter((p) => p.min_num !== null);
  const peak  = highs.length ? Math.max(...highs.map((p) => p.max_num as number)) : null;
  const floor = lows.length  ? Math.min(...lows.map((p) => p.min_num as number))  : null;

  const breaches = points.reduce((a, p) => a + p.n_breach, 0);
  const warns    = points.reduce((a, p) => a + p.n_warn, 0);
  const nas      = points.reduce((a, p) => a + p.n_na, 0);
  const zeros    = points.reduce((a, p) => a + (p.n_zero ?? 0), 0);
  const banded   = breaches + warns > 0;

  // ── 1. What it did ────────────────────────────────────────────────────────
  out.push({
    tone: breaches > 0 ? "breach" : warns > 0 ? "warn" : banded ? "ok" : "unknown",
    text:
      `Across ${periodLabel}, ${subject} averaged ${round1(avg ?? 0)}${u} over ` +
      `${plural(readings, "reading")}` +
      (peak !== null && floor !== null
        ? `, ranging from ${round1(floor)}${u} to ${round1(peak)}${u}.`
        : ".")
  });

  // ── 2. Whether it was acceptable ──────────────────────────────────────────
  if (breaches > 0) {
    const worst = points
      .filter((p) => p.n_breach > 0)
      .sort((a, b) => b.n_breach - a.n_breach)[0];
    out.push({
      tone: "breach",
      text:
        `${plural(breaches, "reading")} fell outside the safe range` +
        (worst ? `, the most on ${new Date(worst.bucket).toLocaleDateString(undefined,
          { day: "numeric", month: "long" })} with ${plural(worst.n_breach, "reading")}` : "") +
        `.` + (warns > 0 ? ` A further ${plural(warns, "reading")} sat in the warning band.` : "")
    });
  } else if (warns > 0) {
    out.push({
      tone: "warn",
      text:
        `Nothing breached its limits, but ${plural(warns, "reading")} sat in the warning ` +
        `band — inside the safe range and heading the wrong way.`
    });
  } else if (banded) {
    out.push({ tone: "ok", text: `Every reading stayed within its safe range.` });
  } else {
    // The honest version of "all green" when nothing has been checked.
    out.push({
      tone: "unknown",
      text:
        `No limits are set for ${subject}, so none of these readings has been ` +
        `checked against a safe range. Setting one is what turns this from a ` +
        `record into a warning.`
    });
  }

  // ── 3. Against the period before ──────────────────────────────────────────
  if (previous && previous.length) {
    const prevAvg = weightedAvg(previous);
    if (prevAvg !== null && avg !== null) {
      const delta = avg - prevAvg;
      // A difference smaller than the rounding shown is not a difference worth
      // a sentence — reporting it invites somebody to explain noise.
      if (Math.abs(delta) < 0.05) {
        out.push({ tone: "ok", text: `That is unchanged from the period before.` });
      } else {
        out.push({
          tone: "ok",
          text:
            `That is ${round1(Math.abs(delta))}${u} ` +
            `${delta > 0 ? "higher" : "lower"} than the period before ` +
            `(${round1(prevAvg)}${u}).`
        });
      }
    }
  }

  // ── 4. What was missing ───────────────────────────────────────────────────
  const gaps: string[] = [];
  if (expected && readings < expected) {
    const missed = expected - readings;
    gaps.push(
      `${plural(missed, "reading")} of ${expected} expected were not taken ` +
      `(${Math.round((readings / expected) * 100)}% coverage)`
    );
  }
  if (nas > 0) gaps.push(`${plural(nas, "reading")} were answered "not available"`);
  if (gaps.length) {
    out.push({
      tone: "warn",
      text: gaps.join("; ").replace(/^./, (c) => c.toUpperCase()) + "."
    });
  }

  // ── 5. Zeros, when there are enough of them to matter ─────────────────────
  // Said separately and carefully. A zero can be the truth — a generator that
  // did not run — so this reports the count and the effect, and stops short of
  // calling them wrong.
  if (zeros > 0) {
    const share = zeros / readings;
    const avgWithout = (() => {
      // Recovering the non-zero mean from sums: total ÷ count, less the zeros,
      // which contribute nothing to the total and one each to the count.
      const nonZeroCount = readings - zeros;
      if (nonZeroCount <= 0 || avg === null) return null;
      return (avg * readings) / nonZeroCount;
    })();

    if (share >= 0.05) {
      out.push({
        tone: share >= 0.25 ? "warn" : "ok",
        text:
          `${plural(zeros, "reading")} — ${Math.round(share * 100)}% of the total — ` +
          `were exactly zero` +
          (avgWithout !== null
            ? `. Excluding them the average would be ${round1(avgWithout)}${u}`
            : "") +
          `. Zero is a real value for some readings and an empty box for others; ` +
          `an operating limit is what tells them apart.`
      });
    }
  }

  return out;
}
