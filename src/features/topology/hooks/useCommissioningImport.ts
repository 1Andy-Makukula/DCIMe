import { useState, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";

// ─────────────────────────────────────────────────────────────────────────────
// Bulk commissioning: spreadsheet in, validated, then promoted.
//
// Bringing a site online means recording every asset AND every cable. Done by
// hand that is weeks per site, and it is the commonest reason DCIM rollouts are
// abandoned — not the software, the data entry.
//
// NOTHING GOES STRAIGHT INTO LIVE TABLES. Rows land in staging, are checked one
// by one, and are promoted only when clean. A half-imported facility is worse
// than none: the graph looks complete, the cascade runs, and the answers are
// quietly wrong.
// ─────────────────────────────────────────────────────────────────────────────

export type ImportKind = "EQUIPMENT" | "CONNECTIONS";
export type RowVerdict = "PENDING" | "OK" | "WARN" | "ERROR" | "SKIPPED";

export interface StagedRow {
  id:          string;
  source_line: number;
  payload:     Record<string, unknown>;
  verdict:     RowVerdict;
  message:     string | null;
}

export interface ImportBatch {
  id:          string;
  kind:        ImportKind;
  status:      "STAGED" | "VALIDATED" | "PROMOTED" | "DISCARDED";
  filename:    string | null;
  row_count:   number;
  error_count: number;
}

/** The columns each sheet is expected to carry. Shown to the user up front —
 *  discovering the format by failing an upload wastes everybody's time. */
export const EXPECTED_COLUMNS: Record<ImportKind, { required: string[]; optional: string[] }> = {
  EQUIPMENT: {
    required: ["equipment_id", "name"],
    optional: ["template_id", "category", "location", "engine_type",
               "input_policy", "layout_x", "layout_y", "render_shape", "metric_prefix"]
  },
  CONNECTIONS: {
    required: ["source_equipment_id", "target_equipment_id"],
    optional: ["source_port", "target_port", "input_priority",
               "connection_type", "render_path_id"]
  }
};

export interface UseCommissioningImportResult {
  batch:      ImportBatch | null;
  rows:       StagedRow[];
  isBusy:     boolean;
  error:      string | null;
  stage:      (kind: ImportKind, filename: string, rows: { line: number; record: Record<string, unknown> }[]) => Promise<void>;
  validate:   () => Promise<void>;
  promote:    () => Promise<{ inserted: number; graph_issues: number }>;
  discard:    () => Promise<void>;
  okCount:    number;
  warnCount:  number;
  errorCount: number;
}

/** database.types.ts predates these tables — see useWorkQueue for the rationale. */
type UntypedFrom = (table: string) => any;
type UntypedRpc  = (fn: string, args?: Record<string, unknown>) =>
  Promise<{ data: unknown; error: { message: string } | null }>;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;
const rpc  = supabase.rpc.bind(supabase)  as unknown as UntypedRpc;

export function useCommissioningImport(): UseCommissioningImportResult {
  const { currentSite } = useCurrentSite();
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [rows, setRows]   = useState<StagedRow[]>([]);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async (batchId: string) => {
    const { data } = await from("import_rows")
      .select("*")
      .eq("batch_id", batchId)
      .order("source_line", { ascending: true });
    setRows((data as StagedRow[] | null) ?? []);
  }, []);

  const stage = useCallback(async (
    kind: ImportKind, filename: string,
    rows: { line: number; record: Record<string, unknown> }[]
  ) => {
    if (!currentSite?.id) throw new Error("No site selected");
    if (rows.length === 0) throw new Error("That file has no rows");

    setBusy(true);
    setError(null);
    try {
      const { data: b, error: bErr } = await from("import_batches")
        .insert({ site_uuid: currentSite.id, kind, filename, status: "STAGED" })
        .select()
        .single();
      if (bErr) throw new Error(bErr.message);

      const created = b as ImportBatch;

      // The line number comes from the worksheet itself, so a message reading
      // "line 6" points at line 6 of the file the user is looking at — even
      // when blank rows sit above it.
      const staged = rows.map(r => ({
        batch_id: created.id,
        source_line: r.line,
        payload: r.record
      }));

      const { error: rErr } = await from("import_rows").insert(staged);
      if (rErr) throw new Error(rErr.message);

      setBatch(created);
      await loadRows(created.id);
    } catch (e: any) {
      setError(e?.message ?? "Could not stage the file");
      throw e;
    } finally {
      setBusy(false);
    }
  }, [currentSite?.id, loadRows]);

  const validate = useCallback(async () => {
    if (!batch) return;
    setBusy(true);
    setError(null);
    try {
      const { error: vErr } = await rpc("validate_import_batch", { p_batch_id: batch.id });
      if (vErr) throw new Error(vErr.message);

      const { data: b } = await from("import_batches").select("*").eq("id", batch.id).single();
      setBatch((b as ImportBatch | null) ?? batch);
      await loadRows(batch.id);
    } catch (e: any) {
      setError(e?.message ?? "Validation failed");
    } finally {
      setBusy(false);
    }
  }, [batch, loadRows]);

  const promote = useCallback(async () => {
    if (!batch) throw new Error("Nothing staged");
    setBusy(true);
    setError(null);
    try {
      const { data, error: pErr } = await rpc("promote_import_batch", { p_batch_id: batch.id });
      if (pErr) throw new Error(pErr.message);
      const result = data as { inserted: number; graph_issues: number };
      setBatch(b => (b ? { ...b, status: "PROMOTED" } : b));
      return result;
    } catch (e: any) {
      setError(e?.message ?? "Import failed");
      throw e;
    } finally {
      setBusy(false);
    }
  }, [batch]);

  const discard = useCallback(async () => {
    if (!batch) return;
    await from("import_batches").update({ status: "DISCARDED" }).eq("id", batch.id);
    setBatch(null);
    setRows([]);
  }, [batch]);

  return {
    batch, rows, isBusy, error,
    stage, validate, promote, discard,
    okCount:    rows.filter(r => r.verdict === "OK").length,
    warnCount:  rows.filter(r => r.verdict === "WARN").length,
    errorCount: rows.filter(r => r.verdict === "ERROR").length
  };
}
