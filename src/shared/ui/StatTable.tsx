import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// A table of figures.
//
// The rules it exists to enforce, each of which was being got wrong somewhere:
//
//   · numeric columns are tabular and right-aligned, so a column of figures can
//     be compared by eye rather than read one at a time
//   · the table scrolls inside its own container — a wide table must never make
//     the whole page scroll sideways
//   · a null renders as an em dash, never as a blank cell or a zero
//   · the header stays put while the body scrolls, because a reading nine rows
//     down is meaningless once its column heading is off screen
// ─────────────────────────────────────────────────────────────────────────────

export interface StatColumn<T> {
  key: string;
  header: string;
  /** Right-aligned and tabular. Set for anything the reader compares. */
  numeric?: boolean;
  /** Narrow columns keep the important ones wide. */
  width?: string;
  render: (row: T) => ReactNode;
}

export interface StatTableProps<T> {
  columns: StatColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Marks a row as needing attention, without recolouring every cell. */
  rowTone?: (row: T) => "none" | "warn" | "breach";
  emptyMessage?: string;
  /** Caps the body height and scrolls, keeping the header visible. */
  maxHeight?: number;
}

const TONE_ROW: Record<string, string> = {
  none:   "",
  warn:   "bg-warn-50/40",
  breach: "bg-danger-50/40"
};

export function StatTable<T>({
  columns, rows, rowKey, rowTone, maxHeight,
  emptyMessage = "Nothing to show for this period."
}: StatTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 py-10 text-center text-[12px] font-semibold text-neutral-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className="overflow-auto rounded-xl border border-neutral-200 bg-white"
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className="w-full border-collapse text-[12px]">
        <thead className="sticky top-0 z-10">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={`whitespace-nowrap border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-400 ${
                  c.numeric ? "text-right" : "text-left"
                }`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={`border-b border-neutral-100 last:border-b-0 ${
                TONE_ROW[rowTone?.(row) ?? "none"]
              }`}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-2 align-top text-neutral-700 ${
                    c.numeric ? "text-right font-mono tabular-nums" : ""
                  }`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A figure for a StatTable cell: em dash when absent, never a blank or a zero. */
export function Num({ value, decimals = 1, unit }: {
  value: number | null | undefined;
  decimals?: number;
  unit?: string | null;
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="text-neutral-300">—</span>;
  }
  return (
    <>
      {value.toFixed(decimals)}
      {unit && <span className="ml-0.5 text-[10px] font-bold text-neutral-400">{unit}</span>}
    </>
  );
}
