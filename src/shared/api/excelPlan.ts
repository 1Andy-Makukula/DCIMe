import { supabase } from "@/shared/api/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Where every reading belongs in the two workbooks, read from the database.
//
// This replaces src/config/mappings/excelMappings.ts — 614 hand-maintained keys
// that were the only place these destinations existed, and which had drifted far
// enough from the registry that 291 of them pointed at metrics nobody collects
// and the Temp Record sheet wrote every room under the wrong heading.
//
// The same facts now live in parameter_excel_targets, loaded by 20260837 from
// that file so nothing was lost in the move. Correcting a column is now an
// UPDATE an administrator can make, not a redeploy.
// ─────────────────────────────────────────────────────────────────────────────

export type TargetWorkbook = "daily_canvas" | "commercial_logbook";

export type RowRule =
  | "hourly_row" | "four_hourly_row" | "dg_row" | "dg_check_row"
  | "fuel_row" | "pac_row" | "eqpt_status_row" | "fss_row";

export interface ExcelTarget {
  workbook: TargetWorkbook;
  /** 'DYNAMIC_DAY' resolves to the day-of-month sheet; anything else is literal. */
  sheetName: string;
  excelColumnIndex: number;
  rowType: RowRule;
}

export interface ExcelPlan {
  /** parameter_name → every cell it writes to. Most have one; 28 have two. */
  targets: Record<string, ExcelTarget[]>;
  /**
   * parameter_name → the value to print for readings nobody takes.
   *
   * NOT_APPLICABLE parameters are the workbook columns this site does not
   * collect: they never reach the technician's form, so no reading will ever
   * arrive for them, and without this the column would export blank. CONSTANT
   * parameters are nameplate figures — a UPS rating, a bank capacity — that are
   * equally never typed.
   */
  uncaptured: Record<string, string>;
  /**
   * parameter_name → the asset it belongs to.
   *
   * The export used to derive this by splitting the key on underscores and
   * taking the first two or three segments, which is the same guesswork that
   * let a Data Room sensor be called media_ambient_temp for a year. The
   * registry knows the answer.
   */
  owner: Record<string, string>;
  /**
   * equipment_id → its row within a per-asset sheet block (the PAC sheet's 23
   * aircon rows). Absent means the asset has no row there and is skipped.
   */
  rowIndex: Record<string, number>;
}

/** database.types.ts predates parameter_excel_targets. */
type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

const EMPTY_PLAN: ExcelPlan = { targets: {}, uncaptured: {}, owner: {}, rowIndex: {} };

/**
 * One round trip per table, both site-scoped.
 *
 * Called once per export rather than per cell: a month is 31 days × 24 hours ×
 * ~600 parameters, and resolving a destination per write would be millions of
 * lookups against the network instead of against a map.
 */
export async function fetchExcelPlan(siteUuid: string | null): Promise<ExcelPlan> {
  if (!siteUuid) return EMPTY_PLAN;

  const [targetRes, paramRes, assetRes] = await Promise.all([
    from("parameter_excel_targets")
      .select("parameter_name,workbook,sheet_name,column_index,row_rule")
      .eq("site_uuid", siteUuid),
    // equipment_parameters has no site column of its own — it inherits one
    // through its asset. Rather than lean on an embedded filter across that FK,
    // fetch the uncaptured rows and narrow them to this site by the destinations
    // above, which are already site-scoped. A parameter with no target here is
    // one this site never exports.
    from("equipment_parameters")
      .select("parameter_name,constant_value,capture_mode,equipment_id"),
    from("equipment_registry")
      .select("equipment_id,excel_row_index")
      .eq("site_uuid", siteUuid)
  ]);

  if (targetRes.error) throw new Error(`Could not load Excel destinations: ${targetRes.error.message}`);
  if (paramRes.error) throw new Error(`Could not load parameter defaults: ${paramRes.error.message}`);
  if (assetRes.error) throw new Error(`Could not load asset row positions: ${assetRes.error.message}`);

  const targets: Record<string, ExcelTarget[]> = {};
  for (const r of targetRes.data ?? []) {
    (targets[r.parameter_name] ??= []).push({
      workbook: r.workbook as TargetWorkbook,
      sheetName: r.sheet_name,
      excelColumnIndex: r.column_index,
      rowType: r.row_rule as RowRule
    });
  }

  const uncaptured: Record<string, string> = {};
  const owner: Record<string, string> = {};
  for (const p of paramRes.data ?? []) {
    if (p.equipment_id) owner[p.parameter_name] = p.equipment_id;
    if (p.capture_mode !== "CAPTURED"
        && p.constant_value !== null && p.constant_value !== undefined
        && targets[p.parameter_name]) {
      uncaptured[p.parameter_name] = p.constant_value;
    }
  }

  const rowIndex: Record<string, number> = {};
  for (const a of assetRes.data ?? []) {
    if (a.excel_row_index !== null && a.excel_row_index !== undefined) {
      rowIndex[a.equipment_id] = a.excel_row_index;
    }
  }

  return { targets, uncaptured, owner, rowIndex };
}
