import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceArea, ReferenceLine, Legend
} from "recharts";
import { SERIES, color } from "@/shared/theme/palette";

// ─────────────────────────────────────────────────────────────────────────────
// One series over time, drawn the same way everywhere.
//
// Six chart components each set their own axis colour, grid colour, tick size
// and margins — which is why #94A3B8 appeared twenty-six times. Every value
// here comes from a token, so an axis and a border can never drift apart again.
//
// THE BAND IS DRAWN, NOT DESCRIBED
// When a parameter has limits, they are shaded behind the line: green between
// the warning bounds, amber out to the hard bounds, and a red rule at each hard
// limit. A reader then sees whether a value is acceptable without consulting a
// legend or remembering a number — which is the thing a table cannot do.
// ─────────────────────────────────────────────────────────────────────────────

export interface TrendSeries {
  key: string;
  name: string;
  /** Omit to take the next categorical colour. */
  color?: string;
}

export interface TrendBand {
  min?: number | null;
  warnMin?: number | null;
  warnMax?: number | null;
  max?: number | null;
}

export interface TrendChartProps {
  data: Record<string, unknown>[];
  /** The x key. Values should already be formatted for display. */
  xKey: string;
  series: TrendSeries[];
  band?: TrendBand | null;
  unit?: string | null;
  height?: number;
  /**
   * Floor on horizontal space per point, in pixels.
   *
   * Three months at daily grain is 85 points. Squeezed into a container width
   * that is roughly 9px each — the line becomes a hairball, the axis labels
   * collapse to every fifth date, and a reader cannot follow a single day.
   * Below this width the chart grows past its container and SCROLLS instead,
   * which keeps every point legible at the cost of a sideways drag.
   *
   * Set to 0 to force the old fit-to-width behaviour.
   */
  minPointWidth?: number;
  /** Shown in place of the chart when there is nothing to draw. */
  emptyMessage?: string;
  /**
   * Draw one series at full strength and fade the rest.
   *
   * Twenty-seven air conditioners on one axis is a plaid: the shape of any
   * single unit is unreadable, and the one that is drifting is exactly the one
   * a reader is trying to find. Emphasis keeps the others on screen — the point
   * is comparison, so removing them would answer a different question — while
   * making one of them followable.
   */
  emphasis?: string | null;
  /**
   * Suppress the built-in legend.
   *
   * A caller listing more series than the chart draws needs its own legend, and
   * two legends disagreeing about what is on screen is worse than none.
   */
  legend?: boolean;
}

const AXIS = "var(--color-neutral-400)";
const GRID = "var(--color-neutral-100)";

export function TrendChart({
  data, xKey, series, band, unit, height = 320, minPointWidth = 26,
  emptyMessage = "No readings in this period.",
  emphasis = null, legend = true
}: TrendChartProps) {
  const hasPoints = data.some((row) =>
    series.some((s) => row[s.key] !== null && row[s.key] !== undefined));

  if (!hasPoints) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-xl border border-dashed border-neutral-200 text-[12px] font-semibold text-neutral-400"
      >
        {emptyMessage}
      </div>
    );
  }

  // Only draw a band when there is one to draw. A chart with no limits should
  // look plain, not as though everything is inside an invisible range.
  const hasBand = Boolean(band && (band.min != null || band.max != null ||
                                   band.warnMin != null || band.warnMax != null));

  // Enough room for every point, or the container's width — whichever is more.
  // The scroll only appears once the data genuinely outgrows the space.
  const needed = minPointWidth > 0 ? data.length * minPointWidth : 0;

  const chart = (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
        {hasBand && band?.warnMin != null && band?.warnMax != null && (
          <ReferenceArea
            y1={band.warnMin} y2={band.warnMax}
            fill={color.ok(500)} fillOpacity={0.06} strokeOpacity={0}
          />
        )}
        {hasBand && band?.min != null && band?.warnMin != null && (
          <ReferenceArea y1={band.min} y2={band.warnMin}
            fill={color.warn(500)} fillOpacity={0.07} strokeOpacity={0} />
        )}
        {hasBand && band?.warnMax != null && band?.max != null && (
          <ReferenceArea y1={band.warnMax} y2={band.max}
            fill={color.warn(500)} fillOpacity={0.07} strokeOpacity={0} />
        )}

        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey={xKey} stroke={AXIS} tickLine={false} axisLine={false}
          tick={{ fontSize: 10, fontWeight: 700, fill: AXIS }} minTickGap={24}
        />
        <YAxis
          stroke={AXIS} tickLine={false} axisLine={false} width={48}
          tick={{ fontSize: 10, fontWeight: 700, fill: AXIS }}
          label={unit ? {
            value: unit, angle: -90, position: "insideLeft",
            offset: 16, fill: AXIS, fontSize: 10, fontWeight: 700
          } : undefined}
        />

        {/* The hard limits, as rules rather than shading: crossing one is an
            event, and an event deserves a line. */}
        {band?.max != null && (
          <ReferenceLine y={band.max} stroke={color.danger(500)} strokeDasharray="4 4" />
        )}
        {band?.min != null && (
          <ReferenceLine y={band.min} stroke={color.danger(500)} strokeDasharray="4 4" />
        )}

        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: "1px solid var(--color-neutral-200)",
            fontSize: 11, fontWeight: 600
          }}
          labelStyle={{ fontWeight: 800, color: "var(--color-neutral-900)" }}
          formatter={(v: unknown) =>
            [typeof v === "number" ? `${v}${unit ? ` ${unit}` : ""}` : "—"]}
        />
        {legend && series.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} iconType="plainline" />
        )}

        {series.map((s, i) => {
          const faded = emphasis !== null && s.key !== emphasis;
          return (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color ?? SERIES[i % SERIES.length]}
              strokeWidth={faded ? 1 : emphasis === s.key ? 2.75 : 2}
              strokeOpacity={faded ? 0.22 : 1}
              // A gap is a round nobody logged. Joining across it would draw a
              // straight line through hours that were never read.
              connectNulls={false}
              // Dots on a faded line are still fully opaque and read as the
              // emphasised series' points, which defeats the emphasis.
              dot={!faded && data.length <= 48 ? { r: 2.5 } : false}
              activeDot={faded ? false : { r: 4 }}
              // The emphasised line is drawn last so it sits above the rest.
              style={{ zIndex: faded ? 0 : 1 }}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );

  // The scroll lives on this container, never on the page body. Printing
  // overrides it back to full width, because a printed page cannot be dragged.
  return (
    <div className="w-full overflow-x-auto print:overflow-visible">
      <div style={{ minWidth: needed ? `${needed}px` : undefined }}
           className="print:!min-w-0">
        {chart}
      </div>
      {needed > 0 && data.length > 40 && (
        <p className="mt-2 text-[10px] font-semibold text-neutral-400 print:hidden">
          {data.length} points — scroll sideways to follow the whole period.
        </p>
      )}
    </div>
  );
}
