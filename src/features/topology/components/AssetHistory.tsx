import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { supabase } from "@/shared/api/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// What has been changed on this asset, and by whom.
//
// registry_audit has been recording every field-level edit to equipment and
// parameters since the trigger was written. Nothing displayed it, so 296 rows
// accumulated somewhere nobody could reach.
//
// It sits inside Inventory rather than on an audit screen of its own, next to
// the controls that produce the entries. Somebody about to move a temperature
// limit can see who last moved it without going to look for a different page —
// and separate audit screens are the sort of thing people visit once.
//
// "System" is an honest author. A migration or a scheduled job has no auth.uid()
// to record, and writing a blank there invites the reading that the data is
// missing rather than that no person was involved.
// ─────────────────────────────────────────────────────────────────────────────

interface HistoryRow {
  changed_at: string;
  changed_by_name: string;
  scope: string;
  target: string | null;
  field: string;
  old_value: string | null;
  new_value: string | null;
}

type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

/** "min_value" → "Min value". The audit stores column names, not labels. */
const humaniseField = (f: string) =>
  f.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  });

export function AssetHistory({ equipmentId }: { equipmentId: string }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [isLoading, setLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoad(true);
    setError(null);
    rpc("get_asset_history", { p_equipment_id: equipmentId, p_limit: 100 })
      .then((r) => {
        if (cancelled) return;
        if (r.error) throw new Error(r.error.message);
        setRows((r.data as HistoryRow[] | null) ?? []);
        setLoad(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Could not load the change history");
        setLoad(false);
      });
    return () => { cancelled = true; };
  }, [equipmentId]);

  if (isLoading) {
    return (
      <p className="py-3 text-[11px] font-semibold text-neutral-400">Loading history…</p>
    );
  }

  if (error) {
    return (
      <p className="py-3 text-[11px] font-semibold text-danger-600">{error}</p>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-4 text-center text-[11px] font-semibold text-neutral-400">
        Nothing has been changed on this asset since records began.
      </div>
    );
  }

  // Long histories collapse. Ten entries is enough to answer "what happened
  // recently"; the rest is there when somebody is genuinely investigating.
  const shown = expanded ? rows : rows.slice(0, 10);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-400">
          <History size={12} /> Change history
        </h4>
        <span className="font-mono text-[10px] text-neutral-400">
          {rows.length} {rows.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      <ol className="space-y-1.5">
        {shown.map((r, i) => (
          <li
            key={`${r.changed_at}-${r.field}-${i}`}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border border-neutral-100 bg-neutral-50/60 px-3 py-2 text-[11px]"
          >
            <span className="font-mono text-[10px] text-neutral-400">{when(r.changed_at)}</span>
            <span className="rounded border border-neutral-200 bg-white px-1.5 py-px text-[9px] font-black uppercase tracking-wider text-neutral-500">
              {r.scope}
            </span>
            <span className="font-bold text-neutral-800">{humaniseField(r.field)}</span>
            {r.scope === "Parameter" && r.target && (
              <span className="text-neutral-500">on {r.target}</span>
            )}
            <span className="text-neutral-400">
              {/* Both sides shown always. "changed to 12" without the 18 it came
                  from is half a record, and the half that matters is missing. */}
              <span className="line-through">{r.old_value ?? "not set"}</span>
              {" → "}
              <span className="font-bold text-neutral-900">{r.new_value ?? "cleared"}</span>
            </span>
            <span className="ml-auto font-semibold text-neutral-400">{r.changed_by_name}</span>
          </li>
        ))}
      </ol>

      {rows.length > 10 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] font-black uppercase tracking-wider text-neutral-500 hover:text-neutral-800"
        >
          {expanded ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}

export default AssetHistory;
