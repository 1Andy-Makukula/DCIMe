import { useState, useEffect, useCallback } from "react";
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
import { Loader2, TrendingUp, AlertCircle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphableParam {
  id: string;          // equipment_parameters.id (UUID)
  parameter_name: string;
  unit: string | null;
  /** The key used inside the metrics JSONB — `param_<uuid>` */
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
const LINE_COLORS = [
  "#ef4444", // red-500
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#84cc16", // lime-500
];

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
    <div className="bg-white border border-gray-200 rounded-2xl shadow-xl px-4 py-3 min-w-[150px]">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
        {label}
      </p>
      {payload.map((entry: any) => {
        const meta = paramMeta.find((p) => p.metricKey === entry.dataKey);
        const unit = meta?.unit ?? "";
        const name = meta?.parameter_name ?? entry.dataKey;
        return (
          <div key={entry.dataKey} className="flex items-center gap-2 mb-1 last:mb-0">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-[11px] font-semibold text-gray-600 truncate max-w-[120px]">
              {name}:
            </span>
            <span className="text-[11px] font-black text-gray-900 tabular-nums ml-auto pl-2">
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
  const [graphableParams, setGraphableParams] = useState<GraphableParam[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!equipmentId) return;
    setIsLoading(true);
    setError(null);

    try {
      // ── Step 1: Fetch graphable parameters for this equipment ─────────────
      const { data: paramRows, error: paramError } = await supabase
        .from("equipment_parameters")
        .select("id, parameter_name, unit")
        .eq("equipment_id", equipmentId)
        .eq("is_graphable", true);

      if (paramError) throw paramError;

      const params: GraphableParam[] = (paramRows || []).map((p: any) => ({
        id: p.id,
        parameter_name: p.parameter_name,
        unit: p.unit,
        metricKey: `param_${p.id}`,
      }));

      setGraphableParams(params);

      if (params.length === 0) {
        setChartData([]);
        return;
      }

      // ── Step 2: Fetch telemetry logs for last 24 hours ────────────────────
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: logRows, error: logError } = await supabase
        .from("telemetry_logs")
        .select("target_hour, metrics")
        .eq("asset_id", "facility_wide")   // hourly logs are stored under "facility_wide"
        .gte("target_hour", since)
        .order("target_hour", { ascending: true });

      if (logError) throw logError;

      // ── Step 3: Parse + filter metrics payload ────────────────────────────
      const points: ChartDataPoint[] = (logRows || []).map((row: any) => {
        const metrics = (row.metrics as Record<string, any>) || {};
        const point: ChartDataPoint = {
          hour: toHourLabel(row.target_hour),
          ts: row.target_hour,
        };

        params.forEach((p) => {
          const raw = metrics[p.metricKey];
          const num = parseFloat(raw);
          point[p.metricKey] = isNaN(num) ? null : num;
        });

        return point;
      });

      // De-duplicate by hour label (keep latest for that hour)
      const deduped = Object.values(
        points.reduce((acc: Record<string, ChartDataPoint>, pt) => {
          acc[pt.hour] = pt;
          return acc;
        }, {})
      ).sort((a, b) => a.ts.localeCompare(b.ts));

      setChartData(deduped);
    } catch (err: any) {
      console.error("[TelemetryChart] fetch error:", err);
      setError(err.message || "Failed to load telemetry history.");
    } finally {
      setIsLoading(false);
    }
  }, [equipmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Render states ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
        <Loader2 size={22} className="animate-spin text-red-500" />
        <span className="text-[10px] font-black uppercase tracking-widest">
          Loading Telemetry History…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-700">
        <AlertCircle size={16} className="shrink-0" />
        <span className="text-[11px] font-bold">{error}</span>
      </div>
    );
  }

  if (graphableParams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-300 border-2 border-dashed border-gray-100 rounded-2xl">
        <TrendingUp size={28} />
        <p className="text-[11px] font-bold text-gray-400 text-center">
          No graphable parameters configured.
        </p>
        <p className="text-[10px] text-gray-400 text-center max-w-[220px]">
          Mark a parameter as <strong>Graphable</strong> in the parameter editor to see trend lines here.
        </p>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-300 border-2 border-dashed border-gray-100 rounded-2xl">
        <TrendingUp size={28} />
        <p className="text-[11px] font-bold text-gray-400 text-center">
          No data logged in the last 24 hours.
        </p>
        <p className="text-[10px] text-gray-400 text-center max-w-[220px]">
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
            className="inline-flex items-center gap-1.5 text-[10px] font-black text-gray-600 uppercase tracking-wider bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-full"
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}
            />
            {p.parameter_name}
            {p.unit && (
              <span className="text-gray-400 font-bold normal-case">({p.unit})</span>
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
              stroke="#f1f5f9"
              vertical={false}
            />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 9, fontWeight: 700, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              tickFormatter={(v: string) => v.toUpperCase()}
            />
            <YAxis
              tick={{ fontSize: 9, fontWeight: 700, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              content={
                <CustomTooltip paramMeta={graphableParams} />
              }
              cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }}
            />
            <Legend content={() => null} />
            {graphableParams.map((p, i) => (
              <Line
                key={p.id}
                type="monotone"
                dataKey={p.metricKey}
                name={p.parameter_name}
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

      <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest text-right">
        Last 24 hours · Hourly resolution
      </p>
    </div>
  );
}
