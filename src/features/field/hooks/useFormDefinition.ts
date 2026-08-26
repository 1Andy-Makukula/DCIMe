import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import type { FsmMode } from "@/features/field/hooks/useFacilityState";

// ─────────────────────────────────────────────────────────────────────────────
// The shift form, defined by data rather than by code.
//
// V1 rendered ~150 literal field names written into components. Adding a
// parameter meant editing source and redeploying — the failure this whole phase
// exists to remove. Here the form is a query result: insert a row in
// equipment_parameters and the field appears.
//
// One call returns the entire form grouped by equipment. Resolving each item
// separately would be dozens of round trips on a page a technician opens on a
// phone, in a basement, on mobile data.
// ─────────────────────────────────────────────────────────────────────────────

/** How often a reading is taken. Drives which fields appear on which round. */
export type Frequency = "hourly" | "2-hour" | "4-hour" | "daily";

export type InputType =
  | "number" | "text" | "boolean" | "select" | "time" | "date" | "textarea";

export interface ParameterDef {
  parameter_name: string;
  display_label:  string;
  data_type:      "number" | "string" | "boolean";
  input_type:     InputType;
  unit:           string | null;
  canonical_unit: string | null;
  dimension:      string | null;
  min_value:      number | null;
  max_value:      number | null;
  is_required:    boolean;
  is_constant:    boolean;
  constant_value: string | null;
  default_value:  string | null;
  /** Prefill from the previous reading — meter counts, cumulative hours. */
  carry_forward:  boolean;
  /**
   * CAPTURED — a technician types it. CONSTANT — a fixed nameplate figure,
   * rendered read-only. NOT_APPLICABLE never arrives here: the workbook asks
   * for it but this site does not collect it yet, so get_site_form_definition()
   * filters it out and the export supplies 'NA' instead.
   */
  capture_mode:   "CAPTURED" | "CONSTANT";
  /**
   * Facility modes in which this reading is withheld even though its asset is
   * on screen — the generator load parameters during an off-load test, and
   * grid_status, which the facility mode implies rather than a person typing.
   * Already applied server-side; carried for the admin editor.
   */
  hidden_in_modes: string[] | null;
  is_graphable:   boolean;
  options:        string[] | null;
  help_text:      string | null;
  display_order:  number | null;
  frequency:      Frequency | null;
  /** 'INSTANCE' overrides 'TEMPLATE'. Useful when a value looks wrong. */
  source:         "INSTANCE" | "TEMPLATE";
}

export interface EquipmentForm {
  equipment_id: string;
  name:         string;
  category:     string;
  location:     string;
  room_id:      string | null;
  parameters:   ParameterDef[];
}

export interface FormDefinition {
  site_uuid: string;
  frequency: Frequency | null;
  equipment: EquipmentForm[];
}

export interface UseFormDefinitionResult {
  form:       FormDefinition | null;
  /** Equipment groups in reading order, empty groups already removed. */
  groups:     EquipmentForm[];
  fieldCount: number;
  isLoading:  boolean;
  error:      string | null;
  refresh:    () => void;
}

/**
 * database.types.ts predates these functions, so the typed client rejects them.
 * Delete this once types are regenerated against a database carrying
 * 20260816_parameter_registry.sql:
 *
 *   npx supabase gen types typescript --project-id <id> > src/shared/types/database.types.ts
 */
type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;

const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

const NO_GROUPS: EquipmentForm[] = [];

export function useFormDefinition(
  frequency: Frequency | null = null,
  siteUuid?: string,
  /**
   * Facility mode to filter by. Omit — or pass null — to get the form
   * unfiltered, which is what a report or an export wants. A technician's form
   * should always pass one, or it will ask for generator readings while the
   * site is running on mains.
   */
  fsmMode: FsmMode | null = null
): UseFormDefinitionResult {
  const { currentSite } = useCurrentSite();
  const [form, setForm]       = useState<FormDefinition | null>(null);
  const [isLoading, setLoad]  = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [nonce, setNonce]     = useState(0);

  const targetSite = siteUuid ?? currentSite?.id ?? null;

  useEffect(() => {
    let cancelled = false;

    // Site context resolves asynchronously. Querying early would let the RPC
    // fall back to the JWT's site, which is not necessarily the one on screen.
    if (!targetSite) { setLoad(true); return; }

    (async () => {
      setLoad(true);
      setError(null);
      try {
        const { data, error: rpcError } = await rpc("get_site_form_definition", {
          p_site_uuid: targetSite,
          p_frequency: frequency,
          // Which readings are worth taking depends on what the site is doing.
          // Generators are not read while it runs on mains; grid is not read
          // during an outage. Passing null returns the form unfiltered, which
          // is right for a report and wrong for a technician.
          p_fsm_mode: fsmMode
        });
        if (cancelled) return;
        if (rpcError) { setError(rpcError.message); setForm(null); }
        else          { setForm((data as FormDefinition | null) ?? null); }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Could not load the form definition");
          setForm(null);
        }
      } finally {
        if (!cancelled) setLoad(false);
      }
    })();

    return () => { cancelled = true; };
    // fsmMode is a dependency: switching the site into a generator test has to
    // rebuild the form, not wait for the next remount.
  }, [targetSite, frequency, fsmMode, nonce]);

  const groups = form?.equipment.filter(e => e.parameters.length > 0) ?? NO_GROUPS;

  return {
    form,
    groups,
    fieldCount: groups.reduce((n, g) => n + g.parameters.length, 0),
    isLoading,
    error,
    refresh: useCallback(() => setNonce(n => n + 1), [])
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
//
// The rule that matters: FLAG, NEVER REJECT.
//
// A technician at 2 a.m. looking at a genuinely strange reading must be able to
// record it. Block them and they will type a plausible lie — which corrupts the
// data AND loses the anomaly, the one thing worth knowing. So an out-of-range
// value is accepted, marked, and surfaced for review.
// ─────────────────────────────────────────────────────────────────────────────

export type Severity = "ok" | "suspect" | "missing";

export interface FieldVerdict {
  severity: Severity;
  message:  string | null;
}

export function validateField(def: ParameterDef, raw: string): FieldVerdict {
  const empty = raw === "" || raw === null || raw === undefined;

  if (empty) {
    return def.is_required
      ? { severity: "missing", message: "Required" }
      : { severity: "ok", message: null };
  }

  if (def.data_type !== "number") return { severity: "ok", message: null };

  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return { severity: "suspect", message: "Not a number" };
  }

  // Range comes from the parameter registry, so widening a limit is a row edit
  // rather than a code change.
  if (def.min_value !== null && n < def.min_value) {
    return { severity: "suspect", message: `Below the usual ${def.min_value}${def.unit ?? ""}` };
  }
  if (def.max_value !== null && n > def.max_value) {
    return { severity: "suspect", message: `Above the usual ${def.max_value}${def.unit ?? ""}` };
  }

  return { severity: "ok", message: null };
}

/** Values that should be prefilled before the technician starts typing. */
export function initialValues(
  groups: EquipmentForm[],
  previous: Record<string, string> = {}
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of groups) {
    for (const p of g.parameters) {
      if (p.is_constant && p.constant_value !== null) {
        out[p.parameter_name] = p.constant_value;
      } else if (p.carry_forward && previous[p.parameter_name] !== undefined) {
        // Meter counts and cumulative hours only ever move forward; re-typing
        // them invites transcription errors.
        out[p.parameter_name] = previous[p.parameter_name];
      } else if (p.default_value !== null) {
        out[p.parameter_name] = p.default_value;
      } else {
        out[p.parameter_name] = "";
      }
    }
  }
  return out;
}
