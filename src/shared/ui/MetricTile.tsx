import type { ReactNode } from "react";
import { STATUS_TONE, type ReadingStatus } from "@/domain/readingStatus";
import { StatusPill } from "./StatusPill";

// ─────────────────────────────────────────────────────────────────────────────
// One figure, with what it means beside it.
//
// The executive summary is a wall of these and every screen built its own, so
// the same number could be typeset three ways. The rules the tile enforces:
//
//   · a missing value renders as an em dash, never as 0 — "no reading" and "a
//     reading of zero" are different facts and must not look identical
//   · digits are tabular, so a column of them lines up
//   · the unit is smaller than the number and never wraps away from it
//   · status colours the FIGURE, not the whole card, so a wall of tiles does
//     not become a wall of red
//   · the rail on the left is WAYFINDING, never severity — it says which
//     subject the tile belongs to. Keeping identity at the edge and the
//     verdict on the number is what lets both be coloured at once without
//     either being mistaken for the other. See domain/wayfinding.ts.
// ─────────────────────────────────────────────────────────────────────────────

export interface MetricTileProps {
  label: string;
  /** null renders as an em dash. Pass the number, not a formatted string. */
  value: number | string | null;
  unit?: string | null;
  status?: ReadingStatus | null;
  /** Decimal places. Ignored when value is already a string. */
  decimals?: number;
  /** A second line — a comparison, a count, where the figure came from. */
  footnote?: ReactNode;
  /** A sparkline or trailing detail, rendered under the figure. */
  children?: ReactNode;
  onClick?: () => void;
  /**
   * The domain rail — a `bg-domain-*` class from wayfinding.ts.
   *
   * Omitted, the tile has no rail at all rather than a grey one: a rail that
   * is always present stops being a signal and becomes a border.
   */
  rail?: string;
}

export function MetricTile({
  label, value, unit, status = null, decimals = 1, footnote, children, onClick, rail
}: MetricTileProps) {
  const shown =
    value === null || value === undefined ? "—"
    : typeof value === "number"
      ? (Number.isFinite(value) ? value.toFixed(decimals) : "—")
      : value;

  const missing = shown === "—";
  const tone = status ? STATUS_TONE[status] : null;

  const body = (
    <>
      {rail && (
        <span
          className={`absolute inset-y-0 left-0 w-1 ${rail}`}
          aria-hidden="true"
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
        {status && <StatusPill status={status} />}
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={`font-mono text-[26px] font-black leading-none tabular-nums ${
            missing ? "text-neutral-300" : tone ? tone.text : "text-neutral-900"
          }`}
        >
          {shown}
        </span>
        {unit && !missing && (
          <span className="text-[11px] font-bold text-neutral-400">{unit}</span>
        )}
      </div>

      {footnote && <div className="mt-1.5 text-[11px] text-neutral-500">{footnote}</div>}
      {children && <div className="mt-3">{children}</div>}
    </>
  );

  // A tile that opens the detail behind it should look and behave like a
  // control; one that does not should not pretend to.
  // `relative overflow-hidden` so the rail can sit flush inside the rounded
  // corners rather than squaring them off.
  const shell =
    "relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm" +
    (rail ? " pl-5" : "");

  return onClick ? (
    <button
      onClick={onClick}
      className={`${shell} text-left transition-colors hover:border-neutral-300 focus-visible:outline-2 focus-visible:outline-brand-500`}
    >
      {body}
    </button>
  ) : (
    <div className={shell}>{body}</div>
  );
}
