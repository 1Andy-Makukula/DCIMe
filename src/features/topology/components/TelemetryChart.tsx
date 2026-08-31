import { useState, useEffect, useCallback } from "react";
import { SERIES } from "@/shared/theme/palette";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useReadingsRevision } from "@/shared/api/readingsRevision";
import { humanise } from "@/domain/categories";
import { Loader2, TrendingUp, AlertCircle } from "lucide-react";

// database.types.ts predates the `readings` table, so the query below goes
// through an untyped binding — the same escape hatch the analytics hooks use.
type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphableParam {
  id: string;          // equipment_parameters.id (UUID)
  parameter_name: string;
  /** What a person calls it — display_label, or the name made readable. */
  label: string;
  unit: string | null;
  /** The series key on the chart. The parameter name IS the key. */
  metricKey: string;
}

interface ChartDataPoint {
  /** Formatted hour label, e.g. "14:00" */
  hour: string;
  /** Raw ISO timestamp — used for sorting */
  ts: string;
  /** Dynamic keys — one per graphable parameter, value is a number or null */
  [key: string]: number | null | string;
}

interface TelemetryChartProps {
  equipmentId: string;
}

// ── Colour palette for up to 8 lines ─────────────────────────────────────────
// Categorical: position means "a different metric", not "a worse one".
// Status colours would imply severity that these lines do not carry.
const LINE_COLORS = SERIES;

// ── Helpers ───────────────────────────────────────────────────────────────────

function toHourLabel(isoString: string): string {
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
  paramMeta,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  paramMeta: GraphableParam[];
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl px-4 py-3 min-w-[150px]">
      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">
        {label}
      </p>
      {payload.map((entry: any) => {
        const meta = paramMeta.find((p) => p.metricKey === entry.dataKey);
        const unit = meta?.unit ?? "";
        const name = meta?.label ?? entry.dataKey;
        return (
          <div key={entry.dataKey} className="flex items-center gap-2 mb-1 last:mb-0">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-[11px] font-semibold text-neutral-600 truncate max-w-[120px]">
              {name}:
            </span>
            <span className="text-[11px] font-black text-neutral-900 tabular-nums ml-auto pl-2">
              {entry.value !== null && entry.value !== undefined
                ? `${entry.value}${unit ? " " + unit : ""}`
                : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function TelemetryChart({ equipmentId }: TelemetryChartProps) {
  const { currentSite } = useCurrentSite();
  const siteUuid = currentSite?.id ?? null;
  const [graphableParams, setGraphableParams] = useState<GraphableParam[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // fan_out_readings() runs in the same transaction as the technician's write,
  // so a telemetry_logs event means this asset's readings are already in.
  const revision = useReadingsRevision(siteUuid);

  const fetchData = useCallback(async () => {
    if (!equipmentId || !siteUuid) return;
    setIsLoading(true);
    setError(null);

    try {
      // ── Step 1: Fetch graphable parameters for this equipment ─────────────
      const { data: paramRows, error: paramError } = await supabase
        .from("equipment_parameters")
        .select("id, parameter_name, display_label, unit")
        .eq("equipment_id", equipmentId)
        .eq("is_graphable", true);

      if (paramError) throw paramError;

      const params: GraphableParam[] = (paramRows || []).map((p: any) => ({
        id: p.id,
        parameter_name: p.parameter_name,
        label: p.display_label || humanise(p.parameter_name),
        unit: p.unit,
        // THE BUG THIS REPLACES
        // This used to look for `param_<uuid>` inside telemetry_logs.metrics.
        // Nothing has ever written a key of that shape — the technician's
        // payload is keyed by parameter_name, which is what fan_out_readings()
        // matches on too. So every point resolved to null and the panel drew
        // an empty grid on a machine that had a full day of readings behind
        // it. The parameter name is the key.
        metricKey: p.parameter_name
      }));

      setGraphableParams(params);

      if (params.length === 0) {
        setChartData([]);
        return;
      }

      // ── Step 2: Fetch this asset's readings for the last 24 hours ─────────
      // Read from `readings` rather than re-deriving from the telemetry_logs
      // JSON: it is already one numeric row per asset, parameter and hour, and
      // it is scoped to the asset, so a facility with 46 machines no longer
      // pulls the whole site's payload down to plot one of them.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: readingRows, error: readingError } = await from("readings")
        .select("target_hour, parameter_name, value_num")
        .eq("site_uuid", siteUuid)
        .eq("equipment_id", equipmentId)
        .in("parameter_name", params.map((p) => p.parameter_name))
        .gte("target_hour", since)
        .order("target_hour", { ascending: true });

      if (readingError) throw readingError;

      // ── Step 3: Pivot to one point per hour ───────────────────────────────
      const byHour = new Map<string, ChartDataPoint>();

      (readingRows || []).forEach((row: any) => {
        const ts = row.target_hour as string;
        let point = byHour.get(ts);
        if (!point) {
          point = { hour: toHourLabel(ts), ts };
          // A parameter with no reading this hour stays null, so the line
          // gaps there instead of joining across an hour nobody logged.
          params.forEach((p) => { point![p.metricKey] = null; });
          byHour.set(ts, point);
        }
        point[row.parameter_name] =
          row.value_num === null || row.value_num === undefined
            ? null
            : Number(row.value_num);
      });

      const points = [...byHour.values()].sort((a, b) => a.ts.localeCompare(b.ts));

      setChartData(points);
    } catch (err: any) {
      console.error("[TelemetryChart] fetch error:", err);
      setError(err.message || "Failed to load telemetry history.");
    } finally {
      setIsLoading(false);
    }
  }, [equipmentId, siteUuid]);

  useEffect(() => {
    fetchData();
  }, [fetchData, revision]);

  // ── Render states ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-neutral-400">
        <Loader2 size={22} className="animate-spin text-brand-500" />
        <span className="text-[10px] font-black uppercase tracking-widest">
          Loading Telemetry History…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-danger-50 border border-danger-100 rounded-2xl text-danger-700">
        <AlertCircle size={16} className="shrink-0" />
        <span className="text-[11px] font-bold">{error}</span>
      </div>
    );
  }

  if (graphableParams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-neutral-300 border-2 border-dashed border-neutral-100 rounded-2xl">
        <TrendingUp size={28} />
        <p className="text-[11px] font-bold text-neutral-400 text-center">
          No graphable parameters configured.
        </p>
        <p className="text-[10px] text-neutral-400 text-center max-w-[220px]">
          Mark a parameter as <strong>Graphable</strong> in the parameter editor to see trend lines here.
        </p>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-neutral-300 border-2 border-dashed border-neutral-100 rounded-2xl">
        <TrendingUp size={28} />
        <p className="text-[11px] font-bold text-neutral-400 text-center">
          No data logged in the last 24 hours.
        </p>
        <p className="text-[10px] text-neutral-400 text-center max-w-[220px]">
          Telemetry will appear here once technicians submit the hourly checklist.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Legend strip */}
      <div className="flex flex-wrap gap-2">
        {graphableParams.map((p, i) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1.5 text-[10px] font-black text-neutral-600 uppercase tracking-wider bg-neutral-50 border border-neutral-100 px-2.5 py-1 rounded-full"
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}
            />
            {p.label}
            {p.unit && (
              <span className="text-neutral-400 font-bold normal-case">({p.unit})</span>
            )}
          </span>
        ))}
      </div>

      {/* Chart */}
      <div className="w-full h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-neutral-100)"
              vertical={false}
            />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 9, fontWeight: 700, fill: "var(--color-neutral-400)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              tickFormatter={(v: string) => v.toUpperCase()}
            />
            <YAxis
              tick={{ fontSize: 9, fontWeight: 700, fill: "var(--color-neutral-400)" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              content={
                <CustomTooltip paramMeta={graphableParams} />
              }
              cursor={{ stroke: "var(--color-neutral-200)", strokeWidth: 1 }}
            />
            <Legend content={() => null} />
            {graphableParams.map((p, i) => (
              <Line
                key={p.id}
                type="monotone"
                dataKey={p.metricKey}
                name={p.label}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[9px] font-bold text-neutral-300 uppercase tracking-widest text-right">
        Last 24 hours · Hourly resolution
      </p>
    </div>
  );
}
