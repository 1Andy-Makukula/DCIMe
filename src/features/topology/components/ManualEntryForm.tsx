import { useEffect, useState } from "react";
import { Plus, Trash2, Rows3, CornerDownLeft } from "lucide-react";
import { EXPECTED_COLUMNS, type ImportKind } from "../hooks/useCommissioningImport";

// ─────────────────────────────────────────────────────────────────────────────
// Typing rows in, instead of uploading them.
//
// A spreadsheet is the right tool for commissioning fifty racks. It is the
// wrong tool for adding one breaker somebody forgot — building a file, naming
// the columns correctly and uploading it is far more work than the change
// deserves, so in practice the change does not get recorded at all.
//
// This produces THE SAME ROWS the parser produces and hands them to the same
// stage() call, so manual entry inherits validation, the staging table and the
// promote step rather than becoming a second way into the database with its own
// rules. The only difference is where the values came from.
//
// The fields are generated from EXPECTED_COLUMNS, so a column added to the
// import contract appears here automatically and cannot drift out of step.
// ─────────────────────────────────────────────────────────────────────────────

/** Placeholders that show the SHAPE of a value, not just its name. */
const HINTS: Record<string, string> = {
  equipment_id:        "ups_03",
  name:                "UPS 3 — Data Room",
  template_id:         "Leave blank unless it matches a template",
  category:            "UPS",
  location:            "Data Room",
  engine_type:         "STATIC",
  input_policy:        "ANY, ALL or PRIORITY",
  layout_x:            "420",
  layout_y:            "260",
  render_shape:        "rect",
  metric_prefix:       "ups3",
  source_equipment_id: "tco_1",
  target_equipment_id: "ups_03",
  source_port:         "OUT",
  target_port:         "IN",
  input_priority:      "1",
  connection_type:     "POWER",
  render_path_id:      "path-tco1-ups3"
};

export interface ManualEntryFormProps {
  kind: ImportKind;
  busy: boolean;
  /**
   * Same shape the spreadsheet parser emits. Resolve `false` to keep the typed
   * rows on screen — anything else clears the form.
   */
  onStage: (rows: { line: number; record: Record<string, unknown> }[]) => Promise<void | boolean>;
}

export function ManualEntryForm({ kind, busy, onStage }: ManualEntryFormProps) {
  const cols = EXPECTED_COLUMNS[kind];
  const all  = [...cols.required, ...cols.optional];

  const blank = () => Object.fromEntries(all.map(c => [c, ""])) as Record<string, string>;

  const [draft, setDraft] = useState<Record<string, string>>(blank());
  const [queued, setQueued] = useState<Record<string, string>[]>([]);
  const [showOptional, setShowOptional] = useState(false);

  // Rows are shaped by the kind they were typed for. Switching from Equipment
  // to Cables while rows are queued would stage equipment records against the
  // cable contract — every one of them failing validation for reasons the
  // person who typed them could not see.
  useEffect(() => {
    setQueued([]);
    setDraft(blank());
    // blank() closes over `all`, which is derived from kind, so it is correct
    // for the NEW kind by the time this runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // Required fields only. Optional ones stay optional.
  const complete = cols.required.every(c => draft[c]?.trim());

  const addRow = () => {
    if (!complete) return;
    setQueued(q => [...q, draft]);
    setDraft(blank());
  };

  const stageAll = async () => {
    // An unadded but complete draft is almost certainly meant to be included —
    // losing it because someone did not press "Add" would be its own bug.
    const rows = complete ? [...queued, draft] : queued;
    if (rows.length === 0) return;

    // Cleared ONLY on success. The caller reports failures with a toast rather
    // than rethrowing, so clearing unconditionally threw away everything the
    // person had typed the moment staging failed — exactly when they most need
    // it back.
    const ok = await onStage(rows.map((record, i) => ({
      line: i + 1,
      // Blank optional fields are dropped rather than sent as "": an empty
      // string is a value, and the validator would treat it as one.
      record: Object.fromEntries(
        Object.entries(record).filter(([, v]) => String(v).trim() !== "")
      )
    })));
    if (ok === false) return;
    setQueued([]);
    setDraft(blank());
  };

  const field = (c: string, required: boolean) => (
    <div key={c}>
      <label className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-gray-400">
        {c}{required && <span className="ml-1 text-danger-500">*</span>}
      </label>
      <input
        value={draft[c] ?? ""}
        onChange={e => setDraft(d => ({ ...d, [c]: e.target.value }))}
        onKeyDown={e => { if (e.key === "Enter" && complete) { e.preventDefault(); addRow(); } }}
        placeholder={HINTS[c] ?? ""}
        className="w-full rounded-xl border-2 border-gray-100 bg-white px-3 py-2 text-[12px] font-semibold text-gray-900 outline-none transition-colors focus:border-brand-400"
      />
    </div>
  );

  const total = queued.length + (complete ? 1 : 0);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-black text-gray-900">Type it in</p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            For one or two items. Goes through the same checks as a spreadsheet.
          </p>
        </div>
        {queued.length > 0 && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-[11px] font-black text-brand-700">
            <Rows3 size={12} /> {queued.length} queued
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cols.required.map(c => field(c, true))}
      </div>

      {showOptional && (
        <div className="mt-3 grid gap-3 border-t border-gray-100 pt-3 sm:grid-cols-2">
          {cols.optional.map(c => field(c, false))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowOptional(s => !s)}
        className="mt-2.5 text-[10px] font-black uppercase tracking-wider text-gray-400 transition-colors hover:text-gray-700"
      >
        {showOptional ? "Hide" : "Show"} optional fields ({cols.optional.length})
      </button>

      {queued.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
          {queued.map((r, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <span className="font-mono text-[10px] text-gray-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold text-gray-700">
                {cols.required.map(c => r[c]).filter(Boolean).join("  ·  ")}
              </span>
              <button
                onClick={() => setQueued(q => q.filter((_, j) => j !== i))}
                aria-label={`Remove row ${i + 1}`}
                className="shrink-0 rounded text-gray-300 transition-colors hover:text-danger-500"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        <button
          onClick={addRow}
          disabled={!complete}
          className="flex items-center gap-1.5 rounded-xl border-2 border-gray-200 px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-gray-700 transition-colors hover:bg-gray-50 disabled:border-gray-100 disabled:text-gray-300"
        >
          <Plus size={13} /> Add another
          {complete && <CornerDownLeft size={11} className="opacity-40" />}
        </button>
        <button
          onClick={stageAll}
          disabled={busy || total === 0}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-gray-700 disabled:bg-gray-200 disabled:text-gray-400 sm:flex-none"
        >
          {busy ? "Staging..." : `Check ${total || ""} row${total === 1 ? "" : "s"}`.trim()}
        </button>
      </div>
    </div>
  );
}
