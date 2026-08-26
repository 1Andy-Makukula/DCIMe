// ─────────────────────────────────────────────────────────────────────────────
// The arithmetic every screen was doing for itself.
//
// avg was defined in four files, min in seven, max in four, numOrNull in two —
// each analytics screen re-deriving the same statistics from the same JSONB
// blob, with its own idea of what counts as a number and what to do about a
// gap. That is the duplication the V2.1 audit found, and it is why two screens
// could disagree about the same month.
//
// Nothing here fetches. The database aggregates now (get_series), and these are
// for the values that arrive already in the browser — a form being filled, a
// payload being assembled, a figure being formatted for print.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A stored reading as a number, or null.
 *
 * Mirrors public.to_number_or_null() exactly, because the same string has to
 * mean the same thing on both sides of the wire. 'NA' — which 5,999 stored
 * readings are — is not a number and not a zero; it is a technician saying the
 * value was not available, and averaging it as 0 would drag every mean down.
 */
export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Every parseable number in a list, gaps and 'NA' dropped. */
export function numbers(values: readonly unknown[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    const n = numOrNull(v);
    if (n !== null) out.push(n);
  }
  return out;
}

// Null, not 0, when there is nothing to measure. Zero is a reading; "no
// readings" is not, and the two must not render the same.
export const avg = (values: readonly unknown[]): number | null => {
  const n = numbers(values);
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
};

export const min = (values: readonly unknown[]): number | null => {
  const n = numbers(values);
  return n.length ? Math.min(...n) : null;
};

export const max = (values: readonly unknown[]): number | null => {
  const n = numbers(values);
  return n.length ? Math.max(...n) : null;
};

export const sum = (values: readonly unknown[]): number | null => {
  const n = numbers(values);
  return n.length ? n.reduce((a, b) => a + b, 0) : null;
};

/** Rounded, or null — so a caller never has to guard before formatting. */
export const round = (v: number | null, dp = 1): number | null =>
  v === null ? null : parseFloat(v.toFixed(dp));

// ─────────────────────────────────────────────────────────────────────────────
// PUE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IT load in kW, as the workbook defines it.
 *
 * The application has been computing this as UPS output alone. The daily canvas
 * computes it as rectifier DC power PLUS UPS output:
 *
 *   day sheet BH32 = BF31 * BG31          rectifier 1 volts x amps  (W)
 *   day sheet BL32 = BJ31 * BK31          rectifier 2 volts x amps  (W)
 *   PUE Trend B4   = (BH32 + BL32)/1000 + UPS avg kW
 *
 * Omitting the rectifiers shrinks the denominator, which INFLATES PUE — and the
 * two figures get quoted side by side in the same meeting. The rectifiers carry
 * the DC telecom load; leaving them out says the site is less efficient than it
 * is.
 */
export function itLoadKw(m: Record<string, unknown>): number | null {
  const dcWatts = (v: unknown, a: unknown): number | null => {
    const volts = numOrNull(v);
    const amps = numOrNull(a);
    return volts !== null && amps !== null ? volts * amps : null;
  };

  const parts = [
    dcWatts(m.rectifier_1_dc_voltage, m.rectifier_1_amps),
    dcWatts(m.rectifier_2_dc_voltage, m.rectifier_2_amps)
  ].filter((w): w is number => w !== null);

  const rectifierKw = parts.length ? parts.reduce((a, b) => a + b, 0) / 1000 : null;

  const upsParts = [numOrNull(m.ups_1_output_load_kw), numOrNull(m.ups_2_output_load_kw)]
    .filter((k): k is number => k !== null);
  const upsKw = upsParts.length ? upsParts.reduce((a, b) => a + b, 0) : null;

  // Null only when NEITHER contributor reported. One of the two is still a
  // usable figure — a site running on UPS alone has a real IT load.
  if (rectifierKw === null && upsKw === null) return null;
  return (rectifierKw ?? 0) + (upsKw ?? 0);
}

/**
 * Facility load ÷ IT load.
 *
 * Null rather than Infinity when IT load is zero or missing: a PUE of Infinity
 * renders as a number and looks like a catastrophe, when it only means nobody
 * recorded the load.
 */
export function pue(facilityKw: number | null, itKw: number | null): number | null {
  if (facilityKw === null || itKw === null || itKw <= 0) return null;
  return facilityKw / itKw;
}
